import type { ChatChunk, ChatRequest } from "./openai";

/** The model server answered with an HTTP error, or the connection failed before any token. */
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * POST to llama.cpp's OpenAI-compatible endpoint with stream=true and yield each server-sent event as a parsed
 * chunk. We always stream from the model server, even when the client asked for a single JSON response, so the
 * gateway can time the first token (TTFT) and the gaps between tokens (TPOT).
 */
export async function* streamChat(baseUrl: string, body: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatChunk> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // cache_prompt (llama.cpp): reuse the KV cache of the longest matching prefix already in the slot.
      body: JSON.stringify({ ...body, stream: true, cache_prompt: true }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new UpstreamError(502, `model server unreachable: ${(err as Error).message}`);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new UpstreamError(res.status === 503 ? 503 : 502, `model server returned ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const event = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") return;
          yield JSON.parse(data) as ChatChunk;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
