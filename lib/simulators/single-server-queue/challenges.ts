import type { Challenge } from "@/lib/sim/engine";
import type { QueueConfig, QueueState } from "./model";

export const MU_BUDGET = 160;

export const challenges: Challenge<QueueConfig, QueueState>[] = [
  {
    id: "p99-under-200",
    title: "Keep p99 under 200 ms at λ = 80/s",
    description: `Arrivals are fixed at 80 requests/s. Pick a service rate μ (at most ${MU_BUDGET}/s: faster servers cost money) so the p99 latency stays under 200 ms for the whole second half of a 30 s run.`,
    setup: { lambda: 80 },
    durationMs: 30_000,
    winCondition(history, state) {
      const p99 = (history.p99 ?? []).filter((x) => x.t >= 15_000);
      const worst = p99.reduce((m, x) => Math.max(m, x.v), 0);
      const mu = state.lastMu;
      if (mu > MU_BUDGET) return { passed: false, value: Math.round(worst), detail: `μ = ${mu}/s is over the ${MU_BUDGET}/s budget. Find a cheaper server.` };
      return worst < 200
        ? { passed: true, value: Math.round(worst), detail: `Worst p99 was ${Math.round(worst)} ms with μ = ${mu}/s.` }
        : { passed: false, value: Math.round(worst), detail: `p99 reached ${Math.round(worst)} ms. At ${Math.round((80 / mu) * 100)}% utilization the queue tail is too long.` };
    },
    hint: "For M/M/1, latency ≈ 1/(μ − λ) on average and the p99 is about 4.6× that. Solve 4.6/(μ − 80) < 0.2 s, then add headroom for randomness.",
  },
];
