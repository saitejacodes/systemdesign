// Holds up to `capacity` tokens and gains `refillRate` tokens per second, computed lazily.
class TokenBucket {
  constructor(capacity, refillRate, now) {
    // TODO: throw a RangeError if capacity <= 0 or refillRate < 0
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.now = now; // a zero-argument function returning seconds
    // TODO: start full, and remember when you last refilled
  }

  _refill() {
    // TODO: tokens = min(capacity, tokens + elapsed * refillRate)
    // TODO: if the clock did not move forward, add nothing and keep the later timestamp
  }

  allow(cost = 1) {
    // TODO: throw a RangeError for cost <= 0; refill; take `cost` tokens if there are enough
    return true;
  }

  tokens() {
    // TODO: refill, then report the current (possibly fractional) token count
    return 0;
  }
}

module.exports = { TokenBucket };
