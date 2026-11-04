import { STEPS, type Step } from "./types";

/** Suggested minutes per step for a 45-minute interview; other durations scale from it. */
export const BASE_SPLIT_45 = [5, 5, 5, 5, 10, 10, 5] as const;

/**
 * Whole minutes per step scaled to `durationMin`, summing exactly to it (largest-remainder rounding; ties go to the
 * earlier step). 45 → 5/5/5/5/10/10/5, 30 → 4/3/3/3/7/7/3, 60 → 7/7/7/7/13/13/6.
 */
export function splitTime(durationMin: number): Record<Step, number> {
  const total = BASE_SPLIT_45.reduce((a, b) => a + b, 0);
  const raw = BASE_SPLIT_45.map((m) => (m * durationMin) / total);
  const out = raw.map(Math.floor);
  let left = durationMin - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) { if (left <= 0) break; out[i]++; left--; }
  return Object.fromEntries(STEPS.map((s, i) => [s, out[i]])) as Record<Step, number>;
}

/** Each step's scheduled window [startMs, endMs) on the interview clock. */
export function stepWindows(durationMin: number): Record<Step, { startMs: number; endMs: number }> {
  const split = splitTime(durationMin);
  let t = 0;
  const out = {} as Record<Step, { startMs: number; endMs: number }>;
  for (const s of STEPS) { const len = split[s] * 60_000; out[s] = { startMs: t, endMs: t + len }; t += len; }
  return out;
}

/**
 * When each of `n` deep-dive questions appears: evenly spaced over the Deep Dives window, the first at its start.
 * The window starts at the scheduled time, or earlier if the learner opened Deep Dives early.
 */
export function revealSchedule(n: number, durationMin: number, openedAtMs: number | null = null): number[] {
  const w = stepWindows(durationMin)["Deep Dives"];
  const start = openedAtMs === null ? w.startMs : Math.min(w.startMs, openedAtMs);
  const gap = (w.endMs - w.startMs) / Math.max(1, n);
  return Array.from({ length: n }, (_, k) => start + k * gap);
}

/** Questions visible at `elapsedMs`: by schedule, or more if requested (Practice "next question"). */
export function revealedCount(n: number, durationMin: number, elapsedMs: number, openedAtMs: number | null, requested = 0): number {
  const byTime = revealSchedule(n, durationMin, openedAtMs).filter((t) => elapsedMs >= t).length;
  return Math.min(n, Math.max(byTime, requested));
}

// ---------- Clock: per-step accumulation, wall-clock based ----------

export interface ClockState { activeStep: Step; stepMs: Record<Step, number>; since: number | null }

/** Total elapsed ms: flushed step time plus the running segment. */
export function elapsedMs(c: ClockState, now: number): number {
  const flushed = STEPS.reduce((a, s) => a + c.stepMs[s], 0);
  return flushed + (c.since === null ? 0 : Math.max(0, now - c.since));
}

/** Time in one step including the running segment. */
export function stepElapsed(c: ClockState, step: Step, now: number): number {
  return c.stepMs[step] + (c.since !== null && c.activeStep === step ? Math.max(0, now - c.since) : 0);
}

/** Adds the running segment to the active step; keeps running (since = now) unless `stop`. */
export function flush<T extends ClockState>(c: T, now: number, stop = false): T {
  if (c.since === null) return c;
  const add = Math.max(0, now - c.since);
  return { ...c, stepMs: { ...c.stepMs, [c.activeStep]: c.stepMs[c.activeStep] + add }, since: stop ? null : now };
}

export const pause = <T extends ClockState>(c: T, now: number): T => flush(c, now, true);
export const resume = <T extends ClockState>(c: T, now: number): T => (c.since === null ? { ...c, since: now } : c);
export function switchStep<T extends ClockState>(c: T, step: Step, now: number): T {
  if (step === c.activeStep) return c;
  return { ...flush(c, now), activeStep: step };
}

/** "45:00", "04:09", or "+02:13" once past zero. */
export function formatClock(ms: number): string {
  const neg = ms < 0;
  // Counting down shows 00:01 until zero (ceil); counting up past zero shows whole seconds over (floor).
  const s = neg ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
  return `${neg ? "+" : ""}${mm}:${ss}`;
}

/** Remaining whole minutes for the aria-live summary, announced only when this value changes (once a minute). */
export function minuteMark(remainingMs: number): string {
  if (remainingMs <= 0) return `Time is up. ${Math.floor(-remainingMs / 60_000)} minutes over.`;
  const m = Math.ceil(remainingMs / 60_000);
  return `${m} minute${m === 1 ? "" : "s"} remaining.`;
}

export const fmtMinutes = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
