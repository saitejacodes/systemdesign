import { HttpError } from "./http";

/**
 * Admission control for one model replica: at most `slots` requests run at once (match llama.cpp --parallel),
 * at most `maxQueue` wait, and nobody waits longer than their deadline allows.
 *
 * Why bound the queue? By Little's law, wait = queue length / service rate. Example (assumed numbers, measure
 * yours): 4 slots, each request holding a slot ~2.5 s, serves 4 / 2.5 = 1.6 req/s. With 8 waiting, the last one
 * waits 8 / 1.6 = 5 s; with 400 waiting (an unbounded queue during a spike), 250 s. Every one of those requests eventually times out at the client, after holding
 * memory and possibly a slot, so the server does work nobody receives while new requests queue behind it. p99
 * goes from seconds to minutes and goodput falls toward zero. A short queue plus a fast "no" (503 + Retry-After)
 * keeps the requests you do accept fast, and tells clients to come back instead of piling on.
 */
interface Waiter {
  resolve: (release: () => void) => void;
  reject: (err: unknown) => void;
  timer: NodeJS.Timeout;
  onAbort: () => void;
  signal: AbortSignal;
}

export function overloaded(message: string, retryAfterSeconds: number): HttpError {
  return new HttpError(503, message, "overloaded_error", { "retry-after": String(Math.max(1, Math.ceil(retryAfterSeconds))) });
}

export class Admission {
  private active = 0;
  private readonly queue: Waiter[] = [];
  /** Exponentially weighted moving average of how long a request holds a slot. Seeds the wait prediction. */
  private ewmaServiceMs = 2_000;

  constructor(
    readonly name: string,
    readonly slots: number,
    readonly maxQueue: number,
    readonly maxWaitMs: number,
  ) {}

  get inflight(): number {
    return this.active;
  }
  get queued(): number {
    return this.queue.length;
  }
  get outstanding(): number {
    return this.active + this.queue.length;
  }

  /** Expected wait for a request joining the back of the queue now. */
  predictedWaitMs(): number {
    if (this.active < this.slots && this.queue.length === 0) return 0;
    return Math.ceil((this.queue.length + 1) / this.slots) * this.ewmaServiceMs;
  }

  /** Resolves with a release function once a slot is free; rejects with 503 when shedding. */
  acquire(signal: AbortSignal, deadlineMs: number): Promise<() => void> {
    if (this.active < this.slots && this.queue.length === 0) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    const waitBudget = Math.min(this.maxWaitMs, deadlineMs);
    const predicted = this.predictedWaitMs();
    if (this.queue.length >= this.maxQueue)
      return Promise.reject(overloaded(`${this.name}: queue full (${this.maxQueue} waiting)`, predicted / 1000));
    // Fail fast: if we already expect to blow the caller's deadline, saying no now is kinder than saying no later.
    if (predicted > waitBudget)
      return Promise.reject(overloaded(`${this.name}: predicted wait ${predicted} ms exceeds the ${waitBudget} ms budget`, predicted / 1000));

    return new Promise((resolve, reject) => {
      const w: Waiter = {
        resolve,
        reject,
        signal,
        timer: setTimeout(() => {
          this.remove(w);
          reject(overloaded(`${this.name}: waited ${waitBudget} ms for a slot`, this.predictedWaitMs() / 1000));
        }, waitBudget),
        onAbort: () => {
          this.remove(w);
          reject(signal.reason);
        },
      };
      signal.addEventListener("abort", w.onAbort, { once: true });
      this.queue.push(w);
    });
  }

  private remove(w: Waiter): void {
    const i = this.queue.indexOf(w);
    if (i >= 0) this.queue.splice(i, 1);
    clearTimeout(w.timer);
    w.signal.removeEventListener("abort", w.onAbort);
  }

  private releaser(): () => void {
    const started = performance.now();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.ewmaServiceMs = 0.8 * this.ewmaServiceMs + 0.2 * (performance.now() - started);
      this.active--;
      this.dispatch();
    };
  }

  private dispatch(): void {
    while (this.active < this.slots && this.queue.length > 0) {
      const w = this.queue.shift()!;
      this.remove(w);
      this.active++;
      w.resolve(this.releaser());
    }
  }
}
