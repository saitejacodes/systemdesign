import { Redis, type Result } from "ioredis";
import { config } from "./config";
import type { Tenant, Tier } from "./db";
import { HttpError } from "./http";
import { log } from "./log";

/**
 * Per-tenant token bucket, measured in LLM tokens, not requests. One request can cost 20 tokens or 2,000; counting
 * requests would let a tenant sending huge prompts take a hundred times their share of the model.
 *
 * Bucket capacity = the tenant's tokens_per_minute (a burst of up to one minute's budget); it refills at
 * tokens_per_minute / 60 per second. Each request is charged in two steps:
 *   1. before running: charge the estimate (prompt estimate + max_tokens, the most it can cost) or refuse with 429;
 *   2. after finishing: adjust by (actual - estimate), which usually refunds the unused part of max_tokens.
 *
 * The check-and-decrement runs as one Lua script inside Redis, so it is atomic across every gateway: two gateways
 * reading "500 left" and both spending 400 is impossible. The script reads the clock with Redis TIME, so gateway
 * clock skew cannot mint or destroy tokens.
 */
const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local force = ARGV[4] == "force"
local t = redis.call("TIME")
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local b = redis.call("HMGET", KEYS[1], "tokens", "ts")
local tokens = tonumber(b[1]) or capacity
local ts = tonumber(b[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - ts) * rate / 1000)
local allowed = 1
local retry_ms = 0
if force or tokens >= cost then
  tokens = tokens - cost
else
  allowed = 0
  retry_ms = math.ceil((cost - tokens) * 1000 / rate)
end
redis.call("HSET", KEYS[1], "tokens", tostring(tokens), "ts", tostring(now))
redis.call("PEXPIRE", KEYS[1], math.ceil(capacity * 1000 / rate) * 2)
return {allowed, math.floor(tokens), retry_ms}
`;

declare module "ioredis" {
  interface RedisCommander<Context> {
    tokenBucket(key: string, capacity: number, ratePerSec: number, cost: number, mode: "check" | "force"): Result<[number, number, number], Context>;
  }
}

export const redis = new Redis(config.redisUrl, {
  enableOfflineQueue: false, // while disconnected, fail at once instead of queueing commands
  maxRetriesPerRequest: 1,
  connectTimeout: 1_000,
  commandTimeout: 100, // the limiter sits on every request's critical path: give up fast
});
redis.on("error", (err: Error) => log("redis_error", { error: err.message }));
// defineCommand sends the script once and then calls it by SHA (EVALSHA), so each check is one small round trip.
redis.defineCommand("tokenBucket", { numberOfKeys: 1, lua: TOKEN_BUCKET_LUA });

const failOpenTiers = new Set(config.rateLimitFailOpenTiers);
const bucketKey = (tenantId: string) => `rl:tokens:${tenantId}`;

export interface Charge {
  limit: number;
  remaining: number | null;
  /** false when Redis was unreachable and the tier fails open: nothing to adjust later. */
  counted: boolean;
}

/** Charge the worst-case cost up front. Throws 429 (over budget) or 503 (limiter down and this tier fails closed). */
export async function chargeEstimate(tenant: Tenant, estimate: number): Promise<Charge> {
  const capacity = tenant.tokensPerMinute;
  if (estimate > capacity) {
    throw new HttpError(
      400,
      `this request may use ${estimate} tokens, more than your whole ${capacity} tokens/minute budget`,
      "invalid_request_error",
    );
  }
  try {
    const [allowed, remaining, retryMs] = await redis.tokenBucket(bucketKey(tenant.id), capacity, capacity / 60, estimate, "check");
    const headers = {
      "x-ratelimit-limit-tokens": String(capacity),
      "x-ratelimit-remaining-tokens": String(Math.max(0, remaining)),
    };
    if (!allowed) {
      throw new HttpError(429, `token rate limit reached for ${tenant.id}: ${capacity} tokens/minute`, "rate_limit_error", {
        ...headers,
        "retry-after": String(Math.max(1, Math.ceil(retryMs / 1000))),
      });
    }
    return { limit: capacity, remaining, counted: true };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Redis is down or slow. Fail open: keep serving without limits (availability wins; a tenant could overspend
    // for the outage). Fail closed: refuse (protects the model fleet and your bill; the outage becomes everyone's).
    if (failOpenTiers.has(tenant.tier)) {
      log("ratelimit_fail_open", { tenant: tenant.id, error: (err as Error).message });
      return { limit: capacity, remaining: null, counted: false };
    }
    log("ratelimit_fail_closed", { tenant: tenant.id, error: (err as Error).message });
    throw new HttpError(503, "rate limiter unavailable", "overloaded_error", { "retry-after": "5" });
  }
}

/** After the response: settle the difference between what we charged and what was used. Never blocks. */
export function settle(tenant: Tenant, charge: Charge, estimate: number, actual: number): void {
  if (!charge.counted || actual === estimate) return;
  redis
    .tokenBucket(bucketKey(tenant.id), tenant.tokensPerMinute, tenant.tokensPerMinute / 60, actual - estimate, "force")
    .catch((err: Error) => log("ratelimit_settle_failed", { tenant: tenant.id, error: err.message }));
}

/** Lower number = served first. Batch (stage 7) comes last. */
export const PRIORITY: Record<Tier | "batch", number> = { gold: 0, standard: 1, free: 2, batch: 3 };
