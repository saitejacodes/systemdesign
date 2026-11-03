// Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
// attempt counts from 0; rand() returns a number in [0, 1).

function exponential(attempt, base, cap) {
  // TODO: min(cap, base * 2^attempt)
  return base;
}

function fullJitter(attempt, base, cap, rand) {
  // TODO: random_between(0, exponential window)
  return 0;
}

function equalJitter(attempt, base, cap, rand) {
  // TODO: temp / 2 + random_between(0, temp / 2)
  return 0;
}

function decorrelatedJitter(prev, base, cap, rand) {
  // TODO: min(cap, random_between(base, prev * 3))
  return base;
}

class RetryableError extends Error {
  constructor(message) { super(message); this.name = "RetryableError"; }
}

function retry(fn, maxAttempts, sleep, { base = 100, cap = 5000, rand = Math.random, retryable = (e) => e instanceof RetryableError } = {}) {
  // TODO: validate maxAttempts; call fn(); on a retryable failure that is not the last
  // attempt, call sleep(fullJitter(attempt, base, cap, rand)) and try again; otherwise rethrow
  return fn();
}

module.exports = { exponential, fullJitter, equalJitter, decorrelatedJitter, RetryableError, retry };
