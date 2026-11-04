import type { StudioGraph } from "../types";
import { analyze } from "./analyze";
import { azToLose, DEFAULT_DT_S, frameMembers, NO_FAULTS, steadyState, stepSim } from "./model";
import type { ChallengeCheck, Faults, RunChallenge, TrafficProfile } from "./types";

/** Sim time at which a challenge's scenario starts. */
export const SCENARIO_AT_S = 10;

export const TARGET_LABELS: Record<keyof RunChallenge["targets"], string> = {
  minOkQps: "Successful QPS",
  maxP99Ms: "p99 latency (worst request type)",
  maxErrorRatePct: "Error rate",
  maxSpofs: "Single points of failure",
  minAvailabilityPct: "Estimated availability",
  maxCostPerMonth: "Cost per month",
};

/** Faults a challenge applies at sim time t. */
export function challengeFaults(graph: StudioGraph, challenge: Pick<RunChallenge, "atPeak" | "scenario">, t: number): Faults {
  const f: Faults = { ...NO_FAULTS, killed: [], slowed: [], peak: !!challenge.atPeak };
  if (t < SCENARIO_AT_S || !challenge.scenario) return f;
  if (challenge.scenario === "traffic-x10") f.trafficMultiplier = 10;
  else if (challenge.scenario === "cache-flush") f.cacheFlushAt = SCENARIO_AT_S;
  else { const az = azToLose(graph); if (az) f.killed = frameMembers(graph, az); }
  return f;
}

/** Headless run: 0.5 s steps for durationS with the challenge's peak and scenario, then the targets on the final state. */
export function evaluateChallenge(graph: StudioGraph, challenge: RunChallenge, profile: TrafficProfile): ChallengeCheck {
  const duration = challenge.durationS ?? 60;
  let state = steadyState(graph, profile, challengeFaults(graph, challenge, 0), 0);
  let faults = challengeFaults(graph, challenge, 0);
  const steps = Math.round(duration / DEFAULT_DT_S);
  for (let i = 0; i < steps; i++) {
    faults = challengeFaults(graph, challenge, state.t + DEFAULT_DT_S);
    state = stepSim(graph, profile, state, faults, DEFAULT_DT_S);
  }
  const a = analyze(graph, profile, state, faults);
  const worstP99 = state.requestTypes.reduce((m, r) => Math.max(m, r.p99Ms), 0);
  const actuals: Record<keyof RunChallenge["targets"], number> = {
    minOkQps: state.totals.okQps,
    maxP99Ms: worstP99,
    maxErrorRatePct: state.totals.errorRatePct,
    maxSpofs: a.spofs.length,
    minAvailabilityPct: a.availabilityPct,
    maxCostPerMonth: a.costPerMonth,
  };
  const results: ChallengeCheck["results"] = [];
  for (const key of Object.keys(TARGET_LABELS) as (keyof RunChallenge["targets"])[]) {
    const target = challenge.targets[key];
    if (target === undefined) continue;
    const actual = actuals[key];
    const passed = key.startsWith("min") ? actual >= target : actual <= target;
    results.push({ key, label: TARGET_LABELS[key], actual, target, passed });
  }
  return { passed: results.every((r) => r.passed), results };
}
