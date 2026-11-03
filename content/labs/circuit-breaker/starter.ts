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
  // TODO: state, consecutive failure count, time opened, half-open trial counters

  constructor({ failureThreshold = 5, resetTimeout = 30, halfOpenMaxCalls = 1, now = () => performance.now() / 1000 }: BreakerOptions = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenMaxCalls = halfOpenMaxCalls;
    this.now = now;
  }

  state(): BreakerState {
    // TODO: if open and resetTimeout has elapsed on this.now(), become half-open
    return "closed";
  }

  allowRequest(): void {
    // TODO: open -> throw CircuitOpenError; half-open -> admit at most halfOpenMaxCalls trials
  }

  recordSuccess(): void {
    // TODO: closed -> reset failures; half-open -> close after halfOpenMaxCalls successes
  }

  recordFailure(): void {
    // TODO: closed -> count, open at failureThreshold; half-open -> reopen (restart cooldown)
  }

  call<T>(fn: () => T): T {
    // TODO: allowRequest(), run fn, record the outcome, rethrow fn's own error
    return fn();
  }
}
