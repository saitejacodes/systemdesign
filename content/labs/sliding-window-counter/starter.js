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
    // TODO: throw a RangeError unless limit > 0 and window > 0
    this.limit = limit; this.window = window;
    // TODO: the current window's start, prev and curr counts, and the last timestamp seen
  }

  estimate(t) {
    // TODO: throw a RangeError if t is earlier than the last timestamp
    // TODO: roll windows: next window -> prev = curr; skipped one or more -> prev = 0
    // TODO: return prev * (1 - (t - currentWindowStart) / window) + curr
    return 0;
  }

  allow(t) {
    // TODO: refuse (and count nothing) when estimate(t) >= limit; otherwise count it
    return true;
  }
}

module.exports = { FixedWindowCounter, SlidingWindowCounter };
