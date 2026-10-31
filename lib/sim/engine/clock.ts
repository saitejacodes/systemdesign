export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export const DEFAULT_TICK_MS = 10;
/** A slow tab or a background pause must not trigger a burst of catch-up ticks. */
const MAX_FRAME_MS = 100;

/** Simulated time, advanced in fixed ticks and decoupled from render frames. */
export class SimClock {
  t = 0;
  speed = 1;
  paused = true;
  private carry = 0;

  constructor(readonly tickMs = DEFAULT_TICK_MS) {}

  /** Given real elapsed ms since the last frame, returns how many ticks to run now. */
  advance(realMs: number): number {
    if (this.paused) return 0;
    this.carry += Math.min(realMs, MAX_FRAME_MS) * this.speed;
    const n = Math.floor(this.carry / this.tickMs);
    this.carry -= n * this.tickMs;
    return n;
  }

  /** Moves time forward by one tick; the caller runs the model for it. */
  tick() { this.t += this.tickMs; return this.t; }

  setSpeed(s: number) { this.speed = Math.min(4, Math.max(0.25, s)); }
  reset() { this.t = 0; this.carry = 0; }
}
