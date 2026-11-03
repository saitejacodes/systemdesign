// Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
// attempt counts from 0; rand() returns a number in [0, 1).
export type Rand = () => number;

/** Capped exponential backoff, no jitter: min(cap, base * 2^attempt). */
export function exponential(attempt: number, base: number, cap: number): number {
  // Clamp the exponent: 2 ** 1023 is still finite, and a product that overflows to Infinity is capped by min.
  return Math.min(cap, base * 2 ** Math.min(attempt, 1023));
}

/** random_between(0, min(cap, base * 2^attempt)). */
export function fullJitter(attempt: number, base: number, cap: number, rand: Rand): number {
  return rand() * exponential(attempt, base, cap);
}

/** Half the window guaranteed, the other half random. */
export function equalJitter(attempt: number, base: number, cap: number, rand: Rand): number {
  const temp = exponential(attempt, base, cap);
  return temp / 2 + rand() * (temp / 2);
}

/** min(cap, random_between(base, prev * 3)); start with prev = base. */
export function decorrelatedJitter(prev: number, base: number, cap: number, rand: Rand): number {
  return Math.min(cap, base + rand() * (prev * 3 - base));
}

/** Throw (or extend) this for failures that are worth another attempt. */
export class RetryableError extends Error {
  constructor(message: string) { super(message); this.name = "RetryableError"; }
}

export interface RetryOptions { base?: number; cap?: number; rand?: Rand; retryable?: (e: unknown) => boolean }

/** Call fn() up to maxAttempts times, sleeping with full jitter between attempts. */
export function retry<T>(fn: () => T, maxAttempts: number, sleep: (ms: number) => void,
  { base = 100, cap = 5000, rand = Math.random, retryable = (e) => e instanceof RetryableError }: RetryOptions = {}): T {
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
