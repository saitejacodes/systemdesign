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
    // TODO: state, consecutive failure count, time opened, half-open trial counters
  }

  state() {
    // TODO: if open and resetTimeout has elapsed on this.now(), become half-open
    return CLOSED;
  }

  allowRequest() {
    // TODO: open -> throw CircuitOpenError; half-open -> admit at most halfOpenMaxCalls trials
  }

  recordSuccess() {
    // TODO: closed -> reset failures; half-open -> close after halfOpenMaxCalls successes
  }

  recordFailure() {
    // TODO: closed -> count, open at failureThreshold; half-open -> reopen (restart cooldown)
  }

  call(fn) {
    // TODO: allowRequest(), run fn, record the outcome, rethrow fn's own error
    return fn();
  }
}

module.exports = { CircuitBreaker, CircuitOpenError };
