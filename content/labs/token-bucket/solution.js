// Holds up to `capacity` tokens and gains `refillRate` tokens per second, computed lazily.
class TokenBucket {
  constructor(capacity, refillRate, now) {
    if (!(capacity > 0) || !(refillRate >= 0)) throw new RangeError("capacity must be > 0 and refillRate >= 0");
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.now = now;
    this._tokens = capacity; // a new bucket starts full
    this._last = now();
  }

  _refill() {
    const t = this.now();
    const elapsed = t - this._last;
    // Clock stood still or went backwards (NTP step, VM migration): mint nothing and keep
    // the later timestamp, so the same interval is never credited twice.
    if (elapsed <= 0) return;
    this._tokens = Math.min(this.capacity, this._tokens + elapsed * this.refillRate);
    this._last = t;
  }

  allow(cost = 1) {
    if (!(cost > 0)) throw new RangeError("cost must be positive");
    this._refill();
    if (cost > this.capacity || this._tokens < cost) return false; // a refused request takes nothing
    this._tokens -= cost;
    return true;
  }

  tokens() {
    this._refill();
    return this._tokens;
  }
}

module.exports = { TokenBucket };
