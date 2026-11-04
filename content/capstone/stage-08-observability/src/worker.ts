import http from "node:http";
import { context, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { JsMsg, MsgHdrs } from "nats";
import { config } from "./config";
import { pool } from "./db";
import { log } from "./log";
import { batchJobs, registry } from "./metrics";
import { connectQueue, CONSUMER, ensureConsumer, publishJob, STREAM, type BatchJob, type Queue } from "./queue";

/**
 * Batch worker: pulls jobs from JetStream and runs each through the gateway at "batch" priority.
 *
 * At-least-once delivery means any job can arrive twice (a worker crashed after generating but before acking,
 * or ack_wait expired). Idempotency comes from three places:
 *   1. the item row: a job whose item is already 'done' is acked and skipped;
 *   2. the request id sent to the gateway is batch:<batchId>:<customId>, and the usage ledger's primary key is the
 *      request id, so a duplicate generation is never billed twice;
 *   3. the final UPDATE only moves an item out of 'pending' once.
 * A duplicate can still cost a second generation (compute), but never a second charge or a second result.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Full jitter: a random delay in [0, base x 2^attempt], capped. Spreads retries so they do not arrive in lockstep. */
const backoffMs = (attempt: number) => Math.round(Math.random() * Math.min(60_000, 2_000 * 2 ** attempt));

let stopping = false;
const tracer = trace.getTracer("batch-worker");

/** Continue the trace that POST /v1/batches started, using the traceparent the gateway put in the headers. */
function extractContext(h: MsgHdrs | undefined) {
  return propagation.extract(ROOT_CONTEXT, h, {
    get: (carrier, key) => carrier?.get(key) || undefined,
    keys: (carrier) => (carrier ? carrier.keys() : []),
  });
}

async function runJob(q: Queue, m: JsMsg): Promise<void> {
  const job = JSON.parse(new TextDecoder().decode(m.data)) as BatchJob;
  const attempt = m.info.redeliveryCount; // 0 on first delivery
  const item = await pool.query<{ status: string; request: Record<string, unknown> }>(
    "SELECT status, request FROM batch_items WHERE batch_id = $1 AND custom_id = $2",
    [job.batchId, job.customId],
  );
  const row = item.rows[0];
  if (!row || row.status !== "pending") {
    batchJobs.inc({ result: "skipped" });
    log("batch_job_skipped", { ...job, reason: row ? `already ${row.status}` : "item not found" });
    m.ack();
    return;
  }
  await pool.query("UPDATE batch_items SET attempts = attempts + 1, updated_at = now() WHERE batch_id = $1 AND custom_id = $2", [
    job.batchId,
    job.customId,
  ]);

  // Long generations: tell JetStream we are alive so it does not redeliver the job to another worker meanwhile.
  const heartbeat = setInterval(() => m.working(), 15_000);
  try {
    const r = await fetch(`${config.gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": config.internalToken,
        "x-tenant-id": job.tenantId,
        "x-request-id": `batch:${job.batchId}:${job.customId}`,
      },
      body: JSON.stringify(row.request),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });

    if (r.status === 429 || r.status === 503) {
      // Interactive traffic has the capacity: back off and let it. This is batch yielding, not failing.
      // A nak still counts toward max_deliver; a job deferred 5 times stops being delivered, stays 'pending',
      // and the sweeper below republishes it as a fresh message.
      const retryAfter = Number(r.headers.get("retry-after")) || 5;
      batchJobs.inc({ result: "deferred" });
      log("batch_job_deferred", { ...job, status: r.status, retryAfterS: retryAfter });
      m.nak(retryAfter * 1000 + backoffMs(Math.min(attempt, 3)));
      return;
    }
    const body = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
      error?: { message: string };
    };
    if (!r.ok) throw new Error(body.error?.message ?? `gateway returned ${r.status}`);

    await pool.query(
      `UPDATE batch_items SET status = 'done', response = $3, prompt_tokens = $4, completion_tokens = $5, error = NULL, updated_at = now()
        WHERE batch_id = $1 AND custom_id = $2 AND status = 'pending'`,
      [job.batchId, job.customId, body.choices?.[0]?.message?.content ?? "", body.usage?.prompt_tokens ?? 0, body.usage?.completion_tokens ?? 0],
    );
    m.ack();
    batchJobs.inc({ result: "done" });
    log("batch_job_done", { ...job, attempt, completionTokens: body.usage?.completion_tokens });
  } catch (err) {
    const message = (err as Error).message;
    if (attempt + 1 >= 5) {
      // Last delivery (max_deliver = 5): record the failure and stop redelivery.
      await pool.query(
        "UPDATE batch_items SET status = 'failed', error = $3, updated_at = now() WHERE batch_id = $1 AND custom_id = $2 AND status = 'pending'",
        [job.batchId, job.customId, message],
      );
      m.term();
      batchJobs.inc({ result: "failed" });
      log("batch_job_failed", { ...job, attempt, error: message });
    } else {
      m.nak(backoffMs(attempt));
      batchJobs.inc({ result: "retry" });
      log("batch_job_retry", { ...job, attempt, error: message });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

async function loop(q: Queue, n: number): Promise<void> {
  const consumer = await q.js.consumers.get(STREAM, CONSUMER);
  while (!stopping) {
    let m: JsMsg | null = null;
    try {
      m = await consumer.next({ expires: 5_000 });
    } catch (err) {
      log("worker_fetch_error", { worker: n, error: (err as Error).message });
      await sleep(1_000);
      continue;
    }
    if (!m) continue; // nothing to do for 5 s
    const msg = m;
    await context.with(extractContext(msg.headers), () =>
      tracer.startActiveSpan(
        "batch.job",
        { kind: SpanKind.CONSUMER, attributes: { "messaging.system": "nats", "messaging.redelivery_count": msg.info.redeliveryCount } },
        async (span) => {
          try {
            await runJob(q, msg);
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            log("worker_job_crashed", { worker: n, error: (err as Error).message });
            msg.nak(backoffMs(1));
          } finally {
            span.end();
          }
        },
      ),
    );
  }
}

/**
 * Sweeper for the dual-write gap: items still 'pending' and untouched for 2 minutes may never have been published
 * (gateway crashed between COMMIT and publish, or the stream was full). Republish them. If a message for one does
 * exist, the worker sees a duplicate and the idempotency rules above make it harmless.
 */
async function republishStale(q: Queue): Promise<void> {
  const { rows } = await pool.query<{ batch_id: string; custom_id: string; tenant_id: string }>(
    `SELECT i.batch_id, i.custom_id, b.tenant_id
       FROM batch_items i JOIN batches b ON b.id = i.batch_id
      WHERE i.status = 'pending' AND i.updated_at < now() - interval '2 minutes'
      ORDER BY i.updated_at LIMIT 100`,
  );
  for (const r of rows) {
    await publishJob(q, { batchId: r.batch_id, customId: r.custom_id, tenantId: r.tenant_id });
    await pool.query("UPDATE batch_items SET updated_at = now() WHERE batch_id = $1 AND custom_id = $2", [r.batch_id, r.custom_id]);
  }
  if (rows.length) log("sweeper_republished", { items: rows.length });
}

async function main(): Promise<void> {
  const q = await connectQueue("worker");
  await ensureConsumer(q);
  log("worker_started", { concurrency: config.workerConcurrency, gateway: config.gatewayUrl });
  // Prometheus scrapes the worker on its own port.
  http
    .createServer(async (_req, res) => {
      res.writeHead(200, { "content-type": registry.contentType });
      res.end(await registry.metrics());
    })
    .listen(config.workerMetricsPort);
  const sweeper = setInterval(() => republishStale(q).catch((err: Error) => log("sweeper_error", { error: err.message })), 60_000);

  const shutdown = async (signal: string) => {
    log("shutdown", { signal });
    stopping = true; // loops finish their current job; unacked jobs are redelivered to another worker anyway
    clearInterval(sweeper);
    setTimeout(() => process.exit(1), 30_000).unref();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await Promise.all(Array.from({ length: config.workerConcurrency }, (_, i) => loop(q, i)));
  await q.nc.drain();
  await pool.end();
}

main().catch((err: Error) => {
  log("worker_fatal", { error: err.message });
  process.exit(1);
});
