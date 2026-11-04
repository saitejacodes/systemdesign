// Every setting comes from the environment so the same build runs on your laptop and in a container.

export function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

export const str = (name: string, fallback: string) => process.env[name] || fallback;

export const config = {
  port: num("PORT", 8080),
  instanceId: str("INSTANCE_ID", "local"),
  /** Comma-separated model replica base URLs. */
  llmReplicas: str("LLM_REPLICAS", "http://localhost:8081")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  routerPolicy: str("ROUTER_POLICY", "prefix_affinity"),
  /** prefix_affinity gives up the cache hit when its replica already has this many running + queued requests. */
  affinityMaxOutstanding: num("AFFINITY_MAX_OUTSTANDING", 4),
  modelName: str("MODEL_NAME", "qwen2.5-0.5b-instruct"),
  /** Part of every cache key. Change it whenever the weights, quantization or chat template change. */
  modelVersion: str("MODEL_VERSION", "qwen2.5-0.5b-instruct-q4_k_m@9217f5d"),
  /** Hard cap on max_tokens: output length is the biggest driver of latency and of how long a slot stays busy. */
  maxTokensLimit: num("MAX_TOKENS_LIMIT", 512),
  databaseUrl: str("DATABASE_URL", "postgres://app:app@localhost:5432/llm"),
  dbPoolMax: num("DB_POOL_MAX", 10),
  authCacheSeconds: num("AUTH_CACHE_SECONDS", 30),
  /** Must equal llama.cpp --parallel: more than that and llama.cpp queues internally, where we cannot see or shed. */
  slotsPerReplica: num("SLOTS_PER_REPLICA", 4),
  maxQueue: num("MAX_QUEUE", 8),
  maxQueueWaitMs: num("MAX_QUEUE_WAIT_MS", 5_000),
  /** llama.cpp splits --ctx-size evenly across --parallel slots: 8192 / 4 = 2048 tokens per request. */
  contextPerSlot: num("CONTEXT_PER_SLOT", 2048),
  redisUrl: str("REDIS_URL", "redis://localhost:6379"),
  /** Tiers that keep being served when Redis is down; every other tier gets 503 until it is back. */
  rateLimitFailOpenTiers: str("RATE_LIMIT_FAIL_OPEN_TIERS", "gold,standard")
    .split(",")
    .map((s) => s.trim()),
  embedUrl: str("EMBED_URL", "http://localhost:8082"),
  exactCacheTtlSeconds: num("EXACT_CACHE_TTL_SECONDS", 3600),
  semanticCacheTtlSeconds: num("SEMANTIC_CACHE_TTL_SECONDS", 3600),
  /** Cosine similarity needed for a semantic hit. Higher = fewer hits and fewer wrong answers. */
  semanticThreshold: num("SEMANTIC_THRESHOLD", 0.95),
  firstTokenTimeoutMs: num("FIRST_TOKEN_TIMEOUT_MS", 30_000),
  requestTimeoutMs: num("REQUEST_TIMEOUT_MS", 120_000),
};
