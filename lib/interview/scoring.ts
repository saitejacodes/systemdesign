import type { Rubric } from "@/lib/content/schemas";
import { STEPS, type Mode, type Step } from "./types";

export interface ScoreTotal {
  /** Sum of self-scores (0–2 each) over scored criteria. */
  raw: number;
  /** 2 × number of criteria. */
  max: number;
  scored: number;
  /** Mock mode: one point per hint used. Practice: 0. */
  hintPenalty: number;
  /** max(0, raw − penalty) / max, as a whole percentage. */
  pct: number;
}

export const hintsUsed = (hints: Record<Step, number>) => STEPS.reduce((a, s) => a + (hints[s] ?? 0), 0);

export function scoreTotal(rubric: Rubric | null, selfScores: Record<string, number>, mode: Mode, hints: Record<Step, number>): ScoreTotal {
  const criteria = rubric?.criteria ?? [];
  const max = criteria.length * 2;
  let raw = 0, scored = 0;
  for (const c of criteria) {
    const v = selfScores[c.id];
    if (v === 0 || v === 1 || v === 2) { raw += v; scored++; }
  }
  const hintPenalty = mode === "mock" ? hintsUsed(hints) : 0;
  const pct = max ? Math.round((Math.max(0, raw - hintPenalty) / max) * 100) : 0;
  return { raw, max, scored, hintPenalty, pct };
}

/** Rubric criteria grouped by step, in framework order (steps without criteria are left out). */
export function groupByStep(rubric: Rubric) {
  return STEPS.map((step) => ({ step, criteria: rubric.criteria.filter((c) => c.step === step) })).filter((g) => g.criteria.length > 0);
}
