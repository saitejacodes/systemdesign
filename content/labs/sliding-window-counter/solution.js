// Given, for contrast: one counter per aligned window, reset at each boundary.
class FixedWindowCounter {
  constructor(limit, window) { this.limit = limit; this.window = window; this.start = null; this.count = 0; }

  allow(t) {
    const start = Math.floor(t / this.window) * this.window;
    if (start !== this.start) { this.start = start; this.count = 0; }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }
}

// Approximates a sliding window from two fixed-window counts:
// estimate = prev * (1 - elapsed / window) + curr.
class SlidingWindowCounter {
  constructor(limit, window) {
    if (!(limit > 0) || !(window > 0)) throw new RangeError("limit and window must be positive");
    this.limit = limit; this.window = window;
    this.currStart = null; // start of the current aligned window
    this.prev = 0;         // requests allowed in the window before it
    this.curr = 0;         // requests allowed in the current window
    this.lastT = null;
  }

  _advance(t) {
    if (this.lastT !== null && t < this.lastT) throw new RangeError("timestamps must be non-decreasing");
    this.lastT = t;
    const start = Math.floor(t / this.window) * this.window;
    if (this.currStart === null) { this.currStart = start; return; }
    if (start === this.currStart) return;
    // Rolled into the next window, or idle for a whole window or more (nothing overlaps).
    this.prev = start === this.currStart + this.window ? this.curr : 0;
    this.curr = 0; this.currStart = start;
  }

  estimate(t) {
    this._advance(t);
    const elapsed = (t - this.currStart) / this.window;
    return this.prev * (1 - elapsed) + this.curr;
  }

  allow(t) {
    if (this.estimate(t) >= this.limit) return false; // a refused request is not counted
    this.curr += 1;
    return true;
  }
}

module.exports = { FixedWindowCounter, SlidingWindowCounter };
