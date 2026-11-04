import { analyze, evaluateChallenge, NO_FAULTS, steadyState, type ChallengeCheck, type Faults, type RunChallenge, type TrafficProfile } from "@/lib/studio/sim";
import type { StudioGraph } from "@/lib/studio/types";

export interface RunMetrics { p99Ms: number; okQps: number; offeredQps: number; errorRatePct: number; spofs: number; availabilityPct: number; costPerMonth: number }
export interface RunResult { average: RunMetrics; peak: RunMetrics; challenge: ChallengeCheck }

function metrics(graph: StudioGraph, profile: TrafficProfile, faults: Faults): RunMetrics {
  const s = steadyState(graph, profile, faults, 0);
  const a = analyze(graph, profile, s, faults);
  return {
    p99Ms: s.requestTypes.reduce((m, r) => Math.max(m, r.p99Ms), 0),
    okQps: s.totals.okQps,
    offeredQps: s.totals.offeredQps,
    errorRatePct: s.totals.errorRatePct,
    spofs: a.spofs.length,
    availabilityPct: a.availabilityPct,
    costPerMonth: a.costPerMonth,
  };
}

/** Runs one design headlessly against the case's traffic: steady state at average and at peak, plus the run challenge. */
export function runDesign(graph: StudioGraph, profile: TrafficProfile, challenge: RunChallenge): RunResult {
  return {
    average: metrics(graph, profile, NO_FAULTS),
    peak: metrics(graph, profile, { ...NO_FAULTS, peak: true }),
    challenge: evaluateChallenge(graph, challenge, profile),
  };
}

/** Rows of the comparison table: label, how to format, and which direction is better. */
export const COMPARE_ROWS: { key: keyof RunMetrics; label: string; better: "lower" | "higher"; fmt: (v: number) => string }[] = [
  { key: "p99Ms", label: "p99 (worst request type)", better: "lower", fmt: (v) => `${v >= 100 ? Math.round(v) : +v.toFixed(1)} ms` },
  { key: "okQps", label: "Successful QPS", better: "higher", fmt: (v) => Math.round(v).toLocaleString("en-US") },
  { key: "errorRatePct", label: "Error rate", better: "lower", fmt: (v) => `${+v.toFixed(2)}%` },
  { key: "spofs", label: "Single points of failure", better: "lower", fmt: (v) => String(v) },
  { key: "availabilityPct", label: "Estimated availability", better: "higher", fmt: (v) => `${+v.toFixed(3)}%` },
  { key: "costPerMonth", label: "Cost per month", better: "lower", fmt: (v) => `$${Math.round(v).toLocaleString("en-US")}` },
];
