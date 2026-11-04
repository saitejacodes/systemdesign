import { createHash } from "node:crypto";
import { config } from "./config";
import { pool } from "./db";
import { log } from "./log";
import type { ChatRequest } from "./openai";
import { redis } from "./ratelimit";

/**
 * Two response caches, checked in this order:
 *
 * 1. Exact match (Redis). Key = hash of tenant + model version + the canonical request (messages, max_tokens,
 *    temperature, seed). Safe: it only returns an answer to the byte-identical question. Only temperature 0
 *    requests are cached; caching a sampled answer would freeze one random draw and serve it forever.
 *
 * 2. Semantic (pgvector). Embed the prompt, find the nearest stored prompt for the same tenant and model version,
 *    and return its answer if cosine similarity >= SEMANTIC_THRESHOLD. Cheap when it is right and a wrong answer
 *    when it is not: "How do I enable 2FA?" and "How do I disable 2FA?" differ by two letters and can embed very
 *    close together. So it is opt-in per request (x-semantic-cache: allow, meaning "this answer is not personal")
 *    and limited to single-turn, temperature 0 prompts.
 *
 * Both are scoped by MODEL_VERSION: rolling out a new model or quantization changes every key, so old answers
 * are never served as the new model's.
 */

export interface CachedAnswer {
  text: string;
  completionTokens: number;
  similarity?: number;
  matchedPrompt?: string;
}

const canonical = (chat: ChatRequest) =>
  JSON.stringify({ m: chat.messages.map((x) => [x.role, x.content]), mt: chat.max_tokens, t: chat.temperature, s: chat.seed ?? null });

export const exactKey = (tenantId: string, chat: ChatRequest) =>
  `cache:exact:${tenantId}:${config.modelVersion}:${createHash("sha256").update(canonical(chat)).digest("hex")}`;

/** ±10% TTL jitter: entries written together (after a deploy or a flush) do not all expire in the same second. */
const jitter = (seconds: number) => Math.max(1, Math.round(seconds * (0.9 + Math.random() * 0.2)));

export const exactCacheable = (chat: ChatRequest) => chat.temperature === 0;

export function semanticCacheable(chat: ChatRequest, optIn: boolean): boolean {
  const users = chat.messages.filter((m) => m.role === "user").length;
  const others = chat.messages.filter((m) => m.role === "assistant").length;
  return optIn && chat.temperature === 0 && users === 1 && others === 0;
}

/** The text we embed: system prompt (if any) and the single user message. */
const semanticText = (chat: ChatRequest) => chat.messages.map((m) => `${m.role}: ${m.content}`).join("\n");

export async function getExact(tenantId: string, chat: ChatRequest): Promise<CachedAnswer | null> {
  try {
    const raw = await redis.get(exactKey(tenantId, chat));
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
  } catch {
    return null; // a cache that is down is a miss, never an error
  }
}

export async function putExact(tenantId: string, chat: ChatRequest, answer: CachedAnswer): Promise<void> {
  await redis.set(exactKey(tenantId, chat), JSON.stringify(answer), "EX", jitter(config.exactCacheTtlSeconds)).catch(() => {});
}

/** Embedding from the llama.cpp embedding server (bge-small-en-v1.5, 384 dimensions). */
export async function embed(text: string, signal?: AbortSignal): Promise<number[]> {
  const r = await fetch(`${config.embedUrl}/v1/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: text, model: "bge-small-en-v1.5" }),
    signal: signal ?? AbortSignal.timeout(2_000),
  });
  if (!r.ok) throw new Error(`embedding server returned ${r.status}`);
  const body = (await r.json()) as { data: { embedding: number[] }[] };
  return body.data[0].embedding;
}

const toVector = (v: number[]) => `[${v.join(",")}]`;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Nearest stored prompt in this tenant + model version scope; a hit only at or above the threshold. */
export async function getSemantic(tenantId: string, chat: ChatRequest): Promise<{ answer: CachedAnswer | null; embedding: number[] | null }> {
  let embedding: number[];
  try {
    embedding = await embed(semanticText(chat));
  } catch (err) {
    log("embed_failed", { error: (err as Error).message });
    return { answer: null, embedding: null };
  }
  // <=> is pgvector's cosine distance (1 - cosine similarity). ORDER BY it LIMIT 1 can use the HNSW index.
  const { rows } = await pool.query<{ prompt: string; response: string; completion_tokens: number; similarity: number }>(
    `SELECT prompt, response, completion_tokens, 1 - (embedding <=> $1::vector) AS similarity
       FROM semantic_cache
      WHERE tenant_id = $2 AND model_version = $3 AND expires_at > now()
      ORDER BY embedding <=> $1::vector
      LIMIT 1`,
    [toVector(embedding), tenantId, config.modelVersion],
  );
  const best = rows[0];
  if (!best || best.similarity < config.semanticThreshold) {
    if (best) log("semantic_near_miss", { tenant: tenantId, similarity: +best.similarity.toFixed(4), threshold: config.semanticThreshold });
    return { answer: null, embedding };
  }
  return {
    answer: { text: best.response, completionTokens: best.completion_tokens, similarity: +best.similarity.toFixed(4), matchedPrompt: best.prompt },
    embedding,
  };
}

export async function putSemantic(tenantId: string, chat: ChatRequest, embedding: number[], answer: CachedAnswer): Promise<void> {
  await pool
    .query(
      `INSERT INTO semantic_cache (tenant_id, model_version, prompt, embedding, response, completion_tokens, expires_at)
       VALUES ($1, $2, $3, $4::vector, $5, $6, now() + make_interval(secs => $7))`,
      [
        tenantId,
        config.modelVersion,
        semanticText(chat),
        toVector(embedding),
        answer.text,
        answer.completionTokens,
        jitter(config.semanticCacheTtlSeconds),
      ],
    )
    .catch((err: Error) => log("semantic_put_failed", { error: err.message }));
}
