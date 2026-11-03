const CLOSED = "closed", OPEN = "open", HALF_OPEN = "half_open";

/** Thrown instead of calling the dependency while the breaker is open. */
class CircuitOpenError extends Error {
  constructor(message = "circuit open") { super(message); this.name = "CircuitOpenError"; }
}

class CircuitBreaker {
  constructor({ failureThreshold = 5, resetTimeout = 30, halfOpenMaxCalls = 1, now = () => performance.now() / 1000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenMaxCalls = halfOpenMaxCalls;
    this.now = now;
    this.current = CLOSED;
    this.failures = 0;  // consecutive failures while closed
    this.openedAt = 0;
    this.trials = 0;    // trial calls admitted in this half-open period
    this.successes = 0; // trial calls that succeeded
  }

  state() {
    // Open turns into half-open lazily, the first time anyone looks after the cooldown.
    if (this.current === OPEN && this.now() - this.openedAt >= this.resetTimeout) {
      this.current = HALF_OPEN; this.trials = 0; this.successes = 0;
    }
    return this.current;
  }

  open() { this.current = OPEN; this.openedAt = this.now(); }

  allowRequest() {
    const s = this.state();
    if (s === OPEN) throw new CircuitOpenError();
    if (s === HALF_OPEN) {
      if (this.trials >= this.halfOpenMaxCalls) throw new CircuitOpenError("half-open: trial calls already in flight");
      this.trials++;
    }
  }

  recordSuccess() {
    if (this.current === HALF_OPEN) {
      if (++this.successes >= this.halfOpenMaxCalls) { this.current = CLOSED; this.failures = 0; }
    } else {
      this.failures = 0;
    }
  }

  recordFailure() {
    if (this.current === HALF_OPEN) this.open(); // still sick: wait a full cooldown again
    else if (this.current === CLOSED && ++this.failures >= this.failureThreshold) this.open();
  }

  call(fn) {
    this.allowRequest(); // throws CircuitOpenError without touching fn
    let result;
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

module.exports = { CircuitBreaker, CircuitOpenError };
