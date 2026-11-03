export type BreakerState = "closed" | "open" | "half_open";

/** Thrown instead of calling the dependency while the breaker is open. */
export class CircuitOpenError extends Error {
  constructor(message = "circuit open") { super(message); this.name = "CircuitOpenError"; }
}

export interface BreakerOptions { failureThreshold?: number; resetTimeout?: number; halfOpenMaxCalls?: number; now?: () => number }

export class CircuitBreaker {
  private failureThreshold: number;
  private resetTimeout: number;
  private halfOpenMaxCalls: number;
  private now: () => number;
  private current: BreakerState = "closed";
  private failures = 0;  // consecutive failures while closed
  private openedAt = 0;
  private trials = 0;    // trial calls admitted in this half-open period
  private successes = 0; // trial calls that succeeded

  constructor({ failureThreshold = 5, resetTimeout = 30, halfOpenMaxCalls = 1, now = () => performance.now() / 1000 }: BreakerOptions = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenMaxCalls = halfOpenMaxCalls;
    this.now = now;
  }

  state(): BreakerState {
    // Open turns into half-open lazily, the first time anyone looks after the cooldown.
    if (this.current === "open" && this.now() - this.openedAt >= this.resetTimeout) {
      this.current = "half_open"; this.trials = 0; this.successes = 0;
    }
    return this.current;
  }

  private open(): void { this.current = "open"; this.openedAt = this.now(); }

  allowRequest(): void {
    const s = this.state();
    if (s === "open") throw new CircuitOpenError();
    if (s === "half_open") {
      if (this.trials >= this.halfOpenMaxCalls) throw new CircuitOpenError("half-open: trial calls already in flight");
      this.trials++;
    }
  }

  recordSuccess(): void {
    if (this.current === "half_open") {
      if (++this.successes >= this.halfOpenMaxCalls) { this.current = "closed"; this.failures = 0; }
    } else {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    if (this.current === "half_open") this.open(); // still sick: wait a full cooldown again
    else if (this.current === "closed" && ++this.failures >= this.failureThreshold) this.open();
  }

  call<T>(fn: () => T): T {
    this.allowRequest(); // throws CircuitOpenError without touching fn
    let result: T;
    try {
      result = fn();
    } catch (e) {
      this.recordFailure();
      throw e;
    }
    this.recordSuccess();
    return result;
  }
}
