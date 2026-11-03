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
  private currStart: number | null = null; // start of the current aligned window
  private prev = 0;                        // requests allowed in the window before it
  private curr = 0;                        // requests allowed in the current window
  private lastT: number | null = null;

  constructor(readonly limit: number, readonly window: number) {
    if (!(limit > 0) || !(window > 0)) throw new RangeError("limit and window must be positive");
  }

  private advance(t: number): number {
    if (this.lastT !== null && t < this.lastT) throw new RangeError("timestamps must be non-decreasing");
    this.lastT = t;
    const start = Math.floor(t / this.window) * this.window;
    if (this.currStart !== null && start !== this.currStart) {
      // Rolled into the next window, or idle for a whole window or more (nothing overlaps).
      this.prev = start === this.currStart + this.window ? this.curr : 0;
      this.curr = 0;
    }
    this.currStart = start;
    return start;
  }

  estimate(t: number): number {
    const start = this.advance(t);
    const elapsed = (t - start) / this.window;
    return this.prev * (1 - elapsed) + this.curr;
  }

  allow(t: number): boolean {
    if (this.estimate(t) >= this.limit) return false; // a refused request is not counted
    this.curr += 1;
    return true;
  }
}
