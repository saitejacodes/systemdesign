// Holds up to `capacity` tokens and gains `refillRate` tokens per second, computed lazily.
export class TokenBucket {
  // `now` is a zero-argument function returning seconds.
  constructor(readonly capacity: number, readonly refillRate: number, private now: () => number) {
    // TODO: throw a RangeError if capacity <= 0 or refillRate < 0
    // TODO: start full, and remember when you last refilled
  }

  private refill(): void {
    // TODO: tokens = min(capacity, tokens + elapsed * refillRate)
    // TODO: if the clock did not move forward, add nothing and keep the later timestamp
  }

  allow(cost = 1): boolean {
    // TODO: throw a RangeError for cost <= 0; refill; take `cost` tokens if there are enough
    return true;
  }

  tokens(): number {
    // TODO: refill, then report the current (possibly fractional) token count
    return 0;
  }
}
