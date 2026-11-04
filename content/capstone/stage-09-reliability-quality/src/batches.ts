import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireTenant } from "./auth";
import { pool } from "./db";
import { header, HttpError, readJson, sendJson } from "./http";
import { log } from "./log";
import { parseChatRequest } from "./openai";
import { connectQueue, publishJob, queueDepth, type Queue } from "./queue";

// POST /v1/batches        {"requests": [{"custom_id": "q1", "body": {chat completion request}}, ...]}
//                         Idempotency-Key header required. 202 with the batch id; results arrive in the background.
// GET  /v1/batches/:id    progress and per-item results

let queue: Promise<Queue> | null = null;
export const getQueue = () =>
  (queue ??= connectQueue("gateway").catch((err: unknown) => {
    queue = null; // do not cache a failed connection: try again on the next request
    throw err;
  }));

const MAX_ITEMS = 100;

export async function createBatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const tenant = await requireTenant(req);
  const idemKey = header(req, "idempotency-key");
  if (!idemKey || idemKey.length > 200) throw new HttpError(400, "Idempotency-Key header (1-200 characters) is required");
  const body = (await readJson(req, 1024 * 1024)) as { requests?: unknown } | null;
  if (!Array.isArray(body?.requests) || body.requests.length === 0 || body.requests.length > MAX_ITEMS) {
    throw new HttpError(400, `requests must be an array of 1-${MAX_ITEMS} items`);
  }
  const items = body.requests.map((r, i) => {
    const item = r as { custom_id?: unknown; body?: unknown };
    if (typeof item.custom_id !== "string" || !/^[\w.-]{1,64}$/.test(item.custom_id))
      throw new HttpError(400, `requests[${i}].custom_id must match [A-Za-z0-9_.-]{1,64}`);
    const chat = parseChatRequest(item.body);
    return { customId: item.custom_id, request: { ...chat, stream: false } };
  });
  if (new Set(items.map((i) => i.customId)).size !== items.length) throw new HttpError(400, "custom_id values must be unique");

  // One transaction: the batch and all its items exist, or none do. ON CONFLICT on (tenant, idempotency key)
  // turns a retried submit into a read of the first one.
  const client = await pool.connect();
  let batchId = `batch_${randomUUID()}`;
  let created = false;
  try {
    await client.query("BEGIN");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO batches (id, tenant_id, idempotency_key, total) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`,
      [batchId, tenant.id, idemKey, items.length],
    );
    if (ins.rows[0]) {
      created = true;
      for (const it of items) {
        await client.query("INSERT INTO batch_items (batch_id, custom_id, request) VALUES ($1, $2, $3)", [
          batchId,
          it.customId,
          JSON.stringify(it.request),
        ]);
      }
    } else {
      const existing = await client.query<{ id: string }>("SELECT id FROM batches WHERE tenant_id = $1 AND idempotency_key = $2", [
        tenant.id,
        idemKey,
      ]);
      batchId = existing.rows[0].id;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (!created) return sendJson(res, 200, { id: batchId, status: "exists", note: "same Idempotency-Key as an earlier batch" });

  // Committed, now publish. If the process dies between COMMIT and publish, items stay 'pending' in Postgres with
  // no message in the queue: the classic dual write. The worker's sweeper republishes stale pending items; the
  // transactional outbox pattern (write the message to a table in the same transaction) is the general fix.
  try {
    const q = await getQueue();
    for (const it of items) await publishJob(q, { batchId, customId: it.customId, tenantId: tenant.id });
  } catch (err) {
    log("batch_publish_failed", { batchId, error: (err as Error).message });
    // The stream is full (discard new) or NATS is down: tell the client to slow down. Items stay pending and the
    // sweeper will enqueue them once there is room, so the batch is accepted, just delayed.
    return sendJson(
      res,
      202,
      { id: batchId, status: "accepted_delayed", note: "queue full or unavailable; items will be enqueued by the sweeper" },
      { "retry-after": "30" },
    );
  }
  log("batch_created", { batchId, tenant: tenant.id, items: items.length });
  sendJson(res, 202, { id: batchId, status: "queued", total: items.length });
}

export async function getBatch(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const tenant = await requireTenant(req);
  const b = await pool.query<{ id: string; total: number; created_at: Date }>(
    "SELECT id, total, created_at FROM batches WHERE id = $1 AND tenant_id = $2",
    [id, tenant.id],
  );
  // Another tenant's batch id gets the same 404 as a missing one: do not confirm that it exists.
  if (!b.rows[0]) throw new HttpError(404, "no such batch");
  const items = await pool.query<{
    custom_id: string;
    status: string;
    response: string | null;
    error: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    attempts: number;
  }>(
    "SELECT custom_id, status, response, error, prompt_tokens, completion_tokens, attempts FROM batch_items WHERE batch_id = $1 ORDER BY custom_id",
    [id],
  );
  const counts = { pending: 0, done: 0, failed: 0 } as Record<string, number>;
  for (const it of items.rows) counts[it.status]++;
  sendJson(res, 200, { id, total: b.rows[0].total, createdAt: b.rows[0].created_at, counts, items: items.rows });
}

export async function batchQueueStats(): Promise<{ pending: number; inProgress: number } | { error: string }> {
  try {
    return await queueDepth(await getQueue());
  } catch (err) {
    return { error: (err as Error).message };
  }
}
