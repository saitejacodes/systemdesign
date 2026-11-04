/**
 * Streaming latency, measured at the gateway:
 *   TTFT = time from receiving the request to the first generated token (queueing + prefill + first decode step)
 *   TPOT = average gap between later tokens (one decode step each)
 *   end-to-end ≈ TTFT + (tokens - 1) × TPOT
 * llama.cpp streams one token per SSE chunk, so chunks with content are counted as tokens.
 */
export class StreamTimer {
  readonly start = performance.now();
  private first: number | undefined;
  private last: number | undefined;
  tokens = 0;

  token(now = performance.now()): void {
    this.first ??= now;
    this.last = now;
    this.tokens++;
  }

  get ttftMs(): number | null {
    return this.first === undefined ? null : round(this.first - this.start);
  }

  get tpotMs(): number | null {
    return this.tokens > 1 ? round((this.last! - this.first!) / (this.tokens - 1)) : null;
  }

  get totalMs(): number {
    return round(performance.now() - this.start);
  }
}

const round = (ms: number) => Math.round(ms * 10) / 10;
