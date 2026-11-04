import { createHash } from "node:crypto";
import pg from "pg";
import { config } from "./config";

// Each connection is a Postgres backend process, so pool size x gateway instances must stay under
// max_connections (100 by default). The gateway's DB work is small (auth + one ledger write per request).
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  connectionTimeoutMillis: 2_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 2_000,
});
pool.on("error", (err) => console.error("idle pg client error", err.message));

export type Tier = "gold" | "standard" | "free";
export interface Tenant {
  id: string;
  name: string;
  tier: Tier;
  tokensPerMinute: number;
}

export const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/**
 * Resolve "Authorization: Bearer <key>" to a tenant. Results are cached in memory for AUTH_CACHE_SECONDS so the
 * hot path does not hit Postgres on every request; the cost is that a revoked key keeps working for up to that long.
 */
const authCache = new Map<string, { tenant: Tenant | null; expires: number }>();

export async function authenticate(key: string): Promise<Tenant | null> {
  const keyHash = hashKey(key);
  const hit = authCache.get(keyHash);
  if (hit && hit.expires > Date.now()) return hit.tenant;
  const { rows } = await pool.query<{ id: string; name: string; tier: Tier; tokens_per_minute: number }>(
    `SELECT t.id, t.name, t.tier, t.tokens_per_minute
       FROM api_keys k JOIN tenants t ON t.id = k.tenant_id
      WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
    [keyHash],
  );
  const r = rows[0];
  const tenant = r ? { id: r.id, name: r.name, tier: r.tier, tokensPerMinute: r.tokens_per_minute } : null;
  if (authCache.size > 10_000) authCache.clear();
  authCache.set(keyHash, { tenant, expires: Date.now() + config.authCacheSeconds * 1000 });
  return tenant;
}

export interface UsageEntry {
  requestId: string;
  tenantId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  source: "interactive" | "batch" | "cache";
  status: "ok" | "cancelled" | "error";
}

/**
 * Append to the ledger and bump the daily rollup in ONE statement, so both change or neither does.
 * ON CONFLICT DO NOTHING makes it idempotent: the rollup only moves when the ledger row was actually inserted.
 * Returns false when this request id was already recorded.
 */
export async function recordUsage(u: UsageEntry): Promise<boolean> {
  const { rowCount } = await pool.query(
    `WITH ins AS (
       INSERT INTO usage_ledger (request_id, tenant_id, model, prompt_tokens, completion_tokens, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING tenant_id, prompt_tokens, completion_tokens, created_at
     )
     INSERT INTO usage_daily AS d (tenant_id, day, requests, prompt_tokens, completion_tokens)
     SELECT tenant_id, (created_at AT TIME ZONE 'UTC')::date, 1, prompt_tokens, completion_tokens FROM ins
     ON CONFLICT (tenant_id, day) DO UPDATE
       SET requests = d.requests + 1,
           prompt_tokens = d.prompt_tokens + EXCLUDED.prompt_tokens,
           completion_tokens = d.completion_tokens + EXCLUDED.completion_tokens`,
    [u.requestId, u.tenantId, u.model, u.promptTokens, u.completionTokens, u.source, u.status],
  );
  return (rowCount ?? 0) > 0;
}

export interface UsageRow {
  request_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  source: string;
  status: string;
  created_at: Date;
}

/**
 * Keyset pagination, newest first. The cursor is the (created_at, request_id) of the last row of the previous page,
 * so page N costs the same as page 1 (OFFSET would scan and discard every earlier row) and rows inserted while you
 * page do not shift later pages.
 */
export async function listUsage(tenantId: string, limit: number, cursor: string | null): Promise<{ data: UsageRow[]; nextCursor: string | null }> {
  const params: unknown[] = [tenantId, limit + 1];
  let where = "tenant_id = $1";
  if (cursor) {
    const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!ts || !id || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(ts)) throw new Error("bad cursor");
    params.push(ts, id);
    where += " AND (created_at, request_id) < ($3::timestamptz, $4)";
  }
  // The cursor keeps Postgres's microsecond timestamp as text: a JS Date would round it to milliseconds and
  // could skip rows written in the same millisecond.
  const { rows } = await pool.query<UsageRow & { cursor_ts: string }>(
    `SELECT request_id, model, prompt_tokens, completion_tokens, source, status, created_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_ts
       FROM usage_ledger WHERE ${where}
      ORDER BY created_at DESC, request_id DESC LIMIT $2`,
    params,
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? Buffer.from(`${last.cursor_ts}|${last.request_id}`).toString("base64url") : null;
  return { data: page.map(({ cursor_ts: _omit, ...row }) => row), nextCursor };
}
