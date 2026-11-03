// Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
// attempt counts from 0; rand() returns a number in [0, 1).
export type Rand = () => number;

export function exponential(attempt: number, base: number, cap: number): number {
  // TODO: min(cap, base * 2^attempt)
  return base;
}

export function fullJitter(attempt: number, base: number, cap: number, rand: Rand): number {
  // TODO: random_between(0, exponential window)
  return 0;
}

export function equalJitter(attempt: number, base: number, cap: number, rand: Rand): number {
  // TODO: temp / 2 + random_between(0, temp / 2)
  return 0;
}

export function decorrelatedJitter(prev: number, base: number, cap: number, rand: Rand): number {
  // TODO: min(cap, random_between(base, prev * 3))
  return base;
}

export class RetryableError extends Error {
  constructor(message: string) { super(message); this.name = "RetryableError"; }
}

export interface RetryOptions { base?: number; cap?: number; rand?: Rand; retryable?: (e: unknown) => boolean }

export function retry<T>(fn: () => T, maxAttempts: number, sleep: (ms: number) => void,
  { base = 100, cap = 5000, rand = Math.random, retryable = (e) => e instanceof RetryableError }: RetryOptions = {}): T {
  // TODO: validate maxAttempts; call fn(); on a retryable failure that is not the last
  // attempt, call sleep(fullJitter(attempt, base, cap, rand)) and try again; otherwise rethrow
  return fn();
}
