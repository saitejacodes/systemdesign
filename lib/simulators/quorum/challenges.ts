import type { Challenge } from "@/lib/sim/engine";
import { ord, type QuorumConfig, type QuorumState } from "./model";

const READ_P99 = 33;
const worst = (xs: { t: number; v: number }[] = [], from = 0) => xs.filter((x) => x.t >= from).reduce((m, x) => Math.max(m, x.v), 0);

/** Shared gate: a node must have died, and the overlap rule must have held the whole run. */
function gate(s: QuorumState) {
  if (!s.crashed) return "N1 never crashed. Let the challenge run to the end.";
  if (s.weakMs > 0) return `R + W ≤ N for ${(s.weakMs / 1000).toFixed(1)} s. Stale reads there are rare, not impossible: zero of them proves nothing. Keep R + W > N.`;
  if (s.totalStale) return `${s.totalStale} reads returned an older version than one already acknowledged.`;
  if (s.totalReadFails || s.totalWriteFails) return `${s.totalReadFails} reads and ${s.totalWriteFails} writes failed after N1 died: the quorum needed more replicas than were left.`;
  return "";
}

export const challenges: Challenge<QuorumConfig, QuorumState>[] = [
  {
    id: "strong-and-tolerant",
    title: "Consistent and one failure tolerant",
    description: "N = 3. Pick R and W so every read sees the latest acknowledged write (R + W > N the whole run, zero stale reads) and N1 crashing at t = 10 s fails no read and no write.",
    setup: { preset: "custom", n: 3, opsRate: 100, readPct: 50, latency: 1, crashAt: 10_000 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const why = gate(s);
      return why
        ? { passed: false, value: s.totalStale + s.totalReadFails + s.totalWriteFails, detail: why }
        : { passed: true, value: 0, detail: `R = ${s.eff.r}, W = ${s.eff.w}: every read quorum shares a replica with every write quorum, and each needs only ${Math.max(s.eff.r, s.eff.w)} of the 2 survivors.` };
    },
    hint: "Failures tolerated are N − R for reads and N − W for writes. You need both to be at least 1, and R + W at least 4.",
  },
  {
    id: "fast-consistent-reads",
    title: `Read p99 under ${READ_P99} ms at N = 5`,
    description: `N = 5, 90% reads, N1 crashes at t = 10 s. Keep R + W > N, zero stale reads, zero failed requests, and read p99 under ${READ_P99} ms for the whole run.`,
    setup: { preset: "custom", n: 5, opsRate: 200, readPct: 90, latency: 1, crashAt: 10_000 },
    durationMs: 30_000,
    winCondition(h, s) {
      const p99 = Math.round(worst(h.readP99, 1_000) * 10) / 10;
      const why = gate(s);
      if (why) return { passed: false, value: p99, detail: why };
      return p99 < READ_P99
        ? { passed: true, value: p99, detail: `Read p99 ${p99} ms with R = ${s.eff.r}: a read waits only for the ${ord(s.eff.r)} fastest reply, and W = ${s.eff.w} keeps the overlap.` }
        : { passed: false, value: p99, detail: `Read p99 reached ${p99} ms: each read waits for its ${ord(s.eff.r)} fastest replica.` };
    },
    better: "lower",
    hint: "Read latency is the R-th fastest reply, so make R small; then W must be large enough that R + W > 5, but small enough to survive one dead replica.",
  },
];
