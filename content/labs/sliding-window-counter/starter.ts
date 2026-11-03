// Given, for contrast: one counter per aligned window, reset at each boundary.
export class FixedWindowCounter {
  private start: number | null = null;
  private count = 0;

  constructor(readonly limit: number, readonly window: number) {}

  allow(t: number): boolean {
    const start = Math.floor(t / this.window) * this.window;
    if (start !== this.start) { this.start = start; this.count = 0; }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }
}

// Approximates a sliding window from two fixed-window counts:
// estimate = prev * (1 - elapsed / window) + curr.
export class SlidingWindowCounter {
  constructor(readonly limit: number, readonly window: number) {
    // TODO: throw a RangeError unless limit > 0 and window > 0
    // TODO: the current window's start, prev and curr counts, and the last timestamp seen
  }

  estimate(t: number): number {
    // TODO: throw a RangeError if t is earlier than the last timestamp
    // TODO: roll windows: next window -> prev = curr; skipped one or more -> prev = 0
    // TODO: return prev * (1 - (t - currentWindowStart) / window) + curr
    return 0;
  }

  allow(t: number): boolean {
    // TODO: refuse (and count nothing) when estimate(t) >= limit; otherwise count it
    return true;
  }
}
