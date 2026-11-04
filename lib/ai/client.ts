import Anthropic from "@anthropic-ai/sdk";
import { estimateTokens, modelInfo } from "./pricing";
import { AiError, type AiConfig, type ChatRequest, type ChatResult } from "./types";

export const TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 1_500;

type OnDelta = (text: string) => void;

/**
 * Streams one chat completion from the configured provider. Times out after 60 s; retries once (after a short backoff)
 * on rate limits, overload, network errors and timeouts, but only if no text has streamed yet, so a retry never
 * duplicates output. Errors are AiError with a kind the UI turns into a readable message.
 */
export async function chat(cfg: AiConfig, req: ChatRequest, onDelta: OnDelta = () => {}, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<ChatResult> {
  let streamed = false;
  const tap: OnDelta = (t) => { streamed = true; onDelta(t); };
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(req.signal, (signal) => (cfg.provider === "anthropic" ? anthropicChat(cfg, req, signal, tap) : openAiChat(cfg, req, signal, tap)));
    } catch (e) {
      const err = toAiError(e);
      if (attempt === 0 && err.retryable && !streamed && !req.signal?.aborted) { await sleep(RETRY_DELAY_MS); continue; }
      throw err;
    }
  }
}

async function withTimeout<T>(outer: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  outer?.addEventListener("abort", onAbort);
  try {
    return await run(ctl.signal);
  } catch (e) {
    if (timedOut) throw new AiError("timeout", "Timed out after 60 s");
    if (outer?.aborted) throw new AiError("aborted", "Stopped");
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

/** Maps SDK, HTTP and fetch errors to an AiError kind. */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError("timeout", "Timed out");
  if (e instanceof Anthropic.APIUserAbortError) return new AiError("aborted", "Stopped");
  if (e instanceof Anthropic.APIConnectionError) return new AiError("network", e.message);
  if (e instanceof Anthropic.APIError && typeof e.status === "number") return fromStatus(e.status, e.message);
  if (e instanceof DOMException && e.name === "AbortError") return new AiError("aborted", "Stopped");
  // fetch rejects with a TypeError on network failure and on a CORS block (the browser hides which).
  if (e instanceof TypeError) return new AiError("network", e.message);
  return new AiError("unknown", e instanceof Error ? e.message : String(e));
}

export function fromStatus(status: number, message: string): AiError {
  if (status === 401 || status === 403) return new AiError("invalid-key", message);
  if (status === 404) return new AiError("not-found", message);
  if (status === 429) return new AiError("rate-limit", message);
  if (status === 529 || status >= 500) return new AiError("overloaded", message);
  if (status === 408) return new AiError("timeout", message);
  return new AiError("bad-request", message);
}

async function anthropicChat(cfg: AiConfig, req: ChatRequest, signal: AbortSignal, onDelta: OnDelta): Promise<ChatResult> {
  // The SDK sends the anthropic-dangerous-direct-browser-access header when dangerouslyAllowBrowser is set; the API
  // then answers CORS preflights. Retries and the timeout are handled above, so the SDK's own are turned off.
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: TIMEOUT_MS });
  const info = modelInfo(cfg.model);
  const stream = client.beta.messages.stream({
    model: cfg.model,
    max_tokens: req.maxTokens ?? 16_000,
    system: req.system,
    messages: req.messages,
    ...(info?.effort && req.effort ? { output_config: { effort: req.effort } } : {}),
    // Server-side refusal fallback: a declined request is re-run on a fallback model inside the same call.
    ...(info?.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  }, { signal });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") onDelta(ev.delta.text);
  }
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new AiError("refused", "The model declined this request");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const u = msg.usage;
  return {
    text,
    inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens,
    estimatedTokens: false,
    model: msg.model,
  };
}

async function openAiChat(cfg: AiConfig, req: ChatRequest, signal: AbortSignal, onDelta: OnDelta): Promise<ChatResult> {
  const base = (cfg.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new AiError("bad-request", "Set a base URL (http or https) for the OpenAI-compatible endpoint");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 16_000,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "system", content: req.system }, ...req.messages],
    }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j?.error?.message ?? detail; } catch { /* body not JSON */ }
    throw fromStatus(res.status, detail || `HTTP ${res.status}`);
  }
  if (!res.body) throw new AiError("unknown", "The endpoint returned no body");
  let text = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    let j: { choices?: { delta?: { content?: string } }[]; usage?: typeof usage };
    try { j = JSON.parse(data); } catch { continue; }
    const d = j.choices?.[0]?.delta?.content;
    if (d) { text += d; onDelta(d); }
    if (j.usage) usage = j.usage;
  }
  const estimated = usage?.prompt_tokens == null || usage?.completion_tokens == null;
  return {
    text,
    inputTokens: usage?.prompt_tokens ?? estimateTokens(req.system + req.messages.map((m) => m.content).join("")),
    outputTokens: usage?.completion_tokens ?? estimateTokens(text),
    estimatedTokens: estimated,
    model: cfg.model,
  };
}

/** The `data:` payloads of a server-sent-events stream. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += dec.decode(value, { stream: !done });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
    if (done) break;
  }
  if (buf.startsWith("data:")) yield buf.slice(5).trim();
}
