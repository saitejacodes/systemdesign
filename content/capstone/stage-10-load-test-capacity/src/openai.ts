import { config } from "./config";
import { HttpError } from "./http";

// The subset of the OpenAI Chat Completions API this gateway accepts. Being wire-compatible means any OpenAI
// client library (or curl recipe) works against it by changing the base URL.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  stream: boolean;
  seed?: number;
}

/** One streamed chunk, as llama.cpp and OpenAI send it. llama.cpp adds `timings` to the last chunk. */
export interface ChatChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: { index: number; delta?: { role?: string; content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
  timings?: Record<string, number>;
}

const ROLES = new Set(["system", "user", "assistant"]);

export function parseChatRequest(body: unknown): ChatRequest {
  if (!body || typeof body !== "object") throw new HttpError(400, "body must be a JSON object");
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0) throw new HttpError(400, "messages must be a non-empty array");
  const messages: ChatMessage[] = b.messages.map((m, i) => {
    const msg = m as Record<string, unknown>;
    if (!msg || typeof msg.role !== "string" || !ROLES.has(msg.role))
      throw new HttpError(400, `messages[${i}].role must be system, user or assistant`);
    if (typeof msg.content !== "string") throw new HttpError(400, `messages[${i}].content must be a string`);
    return { role: msg.role as ChatMessage["role"], content: msg.content };
  });
  const maxTokens = b.max_tokens === undefined ? 256 : Number(b.max_tokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new HttpError(400, "max_tokens must be a positive integer");
  if (maxTokens > config.maxTokensLimit) throw new HttpError(400, `max_tokens may be at most ${config.maxTokensLimit}`);
  const temperature = b.temperature === undefined ? 0.7 : Number(b.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new HttpError(400, "temperature must be between 0 and 2");
  const seed = b.seed === undefined ? undefined : Number(b.seed);
  return {
    model: typeof b.model === "string" ? b.model : config.modelName,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: b.stream === true,
    seed,
  };
}

/** Rough token estimate before we know the real count: ~4 characters per token for English text. */
export function estimatePromptTokens(messages: ChatMessage[]): number {
  const chars = messages.reduce((n, m) => n + m.content.length + 8, 0);
  return Math.ceil(chars / 4);
}

export const sseData = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
export const SSE_DONE = "data: [DONE]\n\n";
