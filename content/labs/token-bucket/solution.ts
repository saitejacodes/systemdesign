// Holds up to `capacity` tokens and gains `refillRate` tokens per second, computed lazily.
export class TokenBucket {
  private _tokens: number;
  private _last: number;

  constructor(readonly capacity: number, readonly refillRate: number, private now: () => number) {
    if (!(capacity > 0) || !(refillRate >= 0)) throw new RangeError("capacity must be > 0 and refillRate >= 0");
    this._tokens = capacity; // a new bucket starts full
    this._last = now();
  }

  private refill(): void {
    const t = this.now();
    const elapsed = t - this._last;
    // Clock stood still or went backwards (NTP step, VM migration): mint nothing and keep
    // the later timestamp, so the same interval is never credited twice.
    if (elapsed <= 0) return;
    this._tokens = Math.min(this.capacity, this._tokens + elapsed * this.refillRate);
    this._last = t;
  }

  allow(cost = 1): boolean {
    if (!(cost > 0)) throw new RangeError("cost must be positive");
    this.refill();
    if (cost > this.capacity || this._tokens < cost) return false; // a refused request takes nothing
    this._tokens -= cost;
    return true;
  }

  tokens(): number {
    this.refill();
    return this._tokens;
  }
}
