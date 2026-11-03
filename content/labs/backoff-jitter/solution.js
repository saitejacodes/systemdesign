// Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
// attempt counts from 0; rand() returns a number in [0, 1).

/** Capped exponential backoff, no jitter: min(cap, base * 2^attempt). */
function exponential(attempt, base, cap) {
  // Clamp the exponent: 2 ** 1023 is still finite, and a product that overflows to Infinity is capped by min.
  return Math.min(cap, base * 2 ** Math.min(attempt, 1023));
}

/** random_between(0, min(cap, base * 2^attempt)). */
function fullJitter(attempt, base, cap, rand) {
  return rand() * exponential(attempt, base, cap);
}

/** Half the window guaranteed, the other half random. */
function equalJitter(attempt, base, cap, rand) {
  const temp = exponential(attempt, base, cap);
  return temp / 2 + rand() * (temp / 2);
}

/** min(cap, random_between(base, prev * 3)); start with prev = base. */
function decorrelatedJitter(prev, base, cap, rand) {
  return Math.min(cap, base + rand() * (prev * 3 - base));
}

/** Throw (or extend) this for failures that are worth another attempt. */
class RetryableError extends Error {
  constructor(message) { super(message); this.name = "RetryableError"; }
}

/** Call fn() up to maxAttempts times, sleeping with full jitter between attempts. */
function retry(fn, maxAttempts, sleep, { base = 100, cap = 5000, rand = Math.random, retryable = (e) => e instanceof RetryableError } = {}) {
  if (!(maxAttempts >= 1)) throw new RangeError("maxAttempts must be at least 1");
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (e) {
      // Errors that will repeat (bad input, auth) fail fast; so does the last attempt.
      if (!retryable(e) || attempt === maxAttempts - 1) throw e;
    }
    sleep(fullJitter(attempt, base, cap, rand));
  }
}

module.exports = { exponential, fullJitter, equalJitter, decorrelatedJitter, RetryableError, retry };
