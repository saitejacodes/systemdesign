// Shared helpers for the k6 scripts. k6 reads a whole response body, so streaming is measured from timings:
//   TTFT ≈ res.timings.waiting   (time to first byte: the gateway sends headers together with the first token)
//   TPOT ≈ res.timings.receiving / (tokens - 1)   (time from first to last byte, spread over the later tokens)
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
export const ttft = new Trend("ttft", true);
export const tpot = new Trend("tpot", true);
export const outputTokens = new Counter("output_tokens");

/** Streams one chat completion and records TTFT, TPOT and the number of streamed content chunks (tokens). */
export function chat(apiKey, messages, maxTokens, tags) {
  const res = http.post(`${BASE_URL}/v1/chat/completions`, JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.7, stream: true }), {
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "x-allow-fallback": "false" },
    tags,
    timeout: "120s",
  });
  if (res.status === 200 && typeof res.body === "string") {
    // The gateway's last chunk carries usage.completion_tokens; count content chunks only if it is missing.
    // (Chunks undercount tokens: the output guardrail's holdback can merge several tokens into one chunk.)
    const usage = res.body.match(/"completion_tokens":(\d+)/);
    const tokens = usage ? Number(usage[1]) : (res.body.match(/"content":"/g) || []).length;
    ttft.add(res.timings.waiting, tags);
    if (tokens > 1) tpot.add(res.timings.receiving / (tokens - 1), tags);
    outputTokens.add(tokens, tags);
  }
  return res;
}

/** A prompt of roughly n tokens (about 4 characters each). */
export function filler(n) {
  const sentence = "The quick brown fox reports on queueing, batching and caching in model serving. ";
  return sentence.repeat(Math.max(1, Math.ceil((n * 4) / sentence.length)));
}
