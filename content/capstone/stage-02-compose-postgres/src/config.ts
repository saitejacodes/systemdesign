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
  llmUrl: str("LLM_URL", "http://localhost:8081"),
  modelName: str("MODEL_NAME", "qwen2.5-0.5b-instruct"),
  /** Hard cap on max_tokens: output length is the biggest driver of latency and of how long a slot stays busy. */
  maxTokensLimit: num("MAX_TOKENS_LIMIT", 512),
  databaseUrl: str("DATABASE_URL", "postgres://app:app@localhost:5432/llm"),
  dbPoolMax: num("DB_POOL_MAX", 10),
  authCacheSeconds: num("AUTH_CACHE_SECONDS", 30),
  firstTokenTimeoutMs: num("FIRST_TOKEN_TIMEOUT_MS", 30_000),
  requestTimeoutMs: num("REQUEST_TIMEOUT_MS", 120_000),
};
