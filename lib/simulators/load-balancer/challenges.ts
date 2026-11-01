import type { Challenge } from "@/lib/sim/engine";
import type { LbConfig, LbState } from "./model";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const worst = (xs: { t: number; v: number }[] = [], from = 0) => xs.filter((x) => x.t >= from).reduce((m, x) => Math.max(m, x.v), 0);

export const challenges: Challenge<LbConfig, LbState>[] = [
  {
    id: "survive-kill",
    title: "Lose a server, keep errors under 1%",
    description: "Four servers carry 600 requests/s. Server 2 crashes at t = 5 s. Tune the health checks (interval and failure threshold) so fewer than 1% of all requests in the 30 s run fail.",
    setup: { servers: 4, rps: 600, capacity: 250, latency: 50, hetero: false, killAt: 5_000, spikeAt: 0 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const rate = s.arrivals ? s.errors / s.arrivals : 0;
      return rate < 0.01
        ? { passed: true, value: rate * 100, detail: `Only ${pct(rate)} of requests failed. The LB stopped routing to the dead server quickly.` }
        : { passed: false, value: rate * 100, detail: `${pct(rate)} of requests failed. Every request sent to the dead server before it was marked down is an error.` };
    },
    hint: "Detection time ≈ interval × threshold. At 600 req/s, a quarter of traffic hits the dead server until then: 150 errors per second of blindness. You can afford about 1.2 s.",
  },
  {
    id: "heterogeneous",
    title: "Big and small servers",
    description: "Servers 1 and 3 are twice as big as 2 and 4 (400 vs 200 req/s). Traffic is 900 req/s, 75% of total capacity. Pick an algorithm that keeps p99 under 250 ms and errors under 1%.",
    setup: { servers: 4, rps: 900, capacity: 200, latency: 50, hetero: true, killAt: 0, spikeAt: 0 },
    durationMs: 30_000,
    winCondition(h, s) {
      const p99 = worst(h.p99, 10_000);
      const err = s.arrivals ? s.errors / s.arrivals : 0;
      const ok = p99 < 250 && err < 0.01;
      const name = { rr: "Round robin", wrr: "Weighted round robin", least: "Least connections", iphash: "IP hash", random: "Random" }[s.lastAlgorithm];
      return ok
        ? { passed: true, value: Math.round(p99), detail: `${name} kept p99 at ${Math.round(p99)} ms.${s.lastAlgorithm === "least" ? " Least connections adapts to capacity too; weighted round robin does it without tracking connections." : ""}` }
        : { passed: false, value: Math.round(p99), detail: `${name}: p99 reached ${Math.round(p99)} ms with ${pct(err)} errors. An equal split overloads the small servers (225 req/s each into 200 req/s of capacity).` };
    },
    hint: "Round robin gives every server the same share. The small servers need a smaller share: weight traffic by capacity.",
  },
  {
    id: "spike-p99",
    title: "Ride out a ×3 spike",
    description: "Traffic is 350 req/s and triples for 10 s at t = 10 s. Size the fleet (servers and algorithm) so p99 stays under 300 ms through the whole run.",
    setup: { rps: 350, capacity: 250, latency: 50, hetero: false, killAt: 0, spikeAt: 10_000 },
    durationMs: 30_000,
    winCondition(h, s) {
      const p99 = worst(h.p99, 1_000);
      if (s.spikeMs < 9_000) return { passed: false, value: Math.round(p99), detail: "The spike didn't run. Let the challenge play to the end." };
      return p99 < 300
        ? { passed: true, value: Math.round(p99), detail: `Peak p99 was ${Math.round(p99)} ms during 1,050 req/s.` }
        : { passed: false, value: Math.round(p99), detail: `p99 reached ${Math.round(p99)} ms. At 1,050 req/s the fleet ran too close to capacity, so queues formed.` };
    },
    hint: "Peak load is 1,050 req/s and each server handles about 250. Keep peak utilization under roughly 85%: capacity ≥ 1,050 ÷ 0.85 ≈ 1,250 req/s.",
  },
];
