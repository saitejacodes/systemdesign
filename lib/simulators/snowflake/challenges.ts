import type { Challenge } from "@/lib/sim/engine";
import { avgWait, lifetimeYears, maxMachines, perMs, type SnowConfig, type SnowState } from "./model";

const yrs = (s: SnowState) => lifetimeYears(s.layout).toFixed(1);
const lay = (s: SnowState) => `${s.layout.ts}|${s.layout.dc}|${s.layout.worker}|${s.layout.seq}`;
const pct = (s: SnowState) => (s.demanded ? (100 * s.rejected) / s.demanded : 0);

export const challenges: Challenge<SnowConfig, SnowState>[] = [
  {
    id: "fleet-layout",
    title: "1,000 machines, 10k IDs/s each, 50+ years",
    description: "Rebalance the 63 bits so the layout supports at least 1,000 machine IDs, 10,000 IDs per second per machine and a lifetime of 50 years or more, then run it with no duplicates and under 1 ms average wait.",
    setup: { tsBits: 38, dcBits: 5, workerBits: 5, machines: 4, rateK: 10, policy: "refuse", stepBackMs: 0 },
    durationMs: 5_000,
    winCondition(_h, s) {
      const l = s.layout;
      const miss = [
        lifetimeYears(l) < 50 && `lifetime ${yrs(s)} years (2^${l.ts} ms)`,
        maxMachines(l) < 1000 && `${maxMachines(l)} machine IDs`,
        perMs(l) * 1000 < 10_000 && `${perMs(l) * 1000} IDs/s per machine`,
        s.dups > 0 && `${s.dups} duplicates`,
        avgWait(s) >= 1 && `${avgWait(s).toFixed(2)} ms average wait`,
      ].filter(Boolean);
      return miss.length
        ? { passed: false, value: miss.length, detail: `Layout ${lay(s)} falls short: ${miss.join(", ")}.` }
        : { passed: true, value: 0, detail: `Layout ${lay(s)}: ${yrs(s)} years, ${maxMachines(l).toLocaleString()} machines, ${(perMs(l) * 1000).toLocaleString()} IDs/s each. Every bit you didn't need is headroom somewhere else.` };
    },
    hint: "50 years needs 2^t ms ≥ 1.58 × 10^12, so t ≥ 41. 1,000 machines needs 10 bits. That leaves 12 for the sequence: Twitter's layout already fits.",
  },
  {
    id: "clock-step",
    title: "Survive NTP stepping the clock back",
    description: "M1's clock steps back 20 ms every 3 seconds. Keep issuing IDs with zero duplicates while refusing under 1% of requests.",
    setup: { tsBits: 41, dcBits: 5, workerBits: 5, machines: 4, rateK: 200, policy: "trust", stepBackMs: 20 },
    durationMs: 10_000,
    winCondition: (_h, s) => (s.dups === 0 && s.served > 0 && pct(s) < 1
      ? { passed: true, value: 0, detail: `No duplicates across ${s.steps} clock steps; ${pct(s).toFixed(2)}% of requests refused. The generator remembered its last timestamp instead of trusting the clock.` }
      : { passed: false, value: s.dups, detail: s.dups ? `${s.dups.toLocaleString()} duplicate IDs: after each step the clock re-reads milliseconds it already used and the sequence restarts at 0.` : `No duplicates, but ${pct(s).toFixed(2)}% of requests were refused.` }),
    hint: "The naive generator only resets the sequence when the millisecond changes; it never checks that the new millisecond is later. Pick a policy that compares against the last timestamp.",
  },
  {
    id: "burst",
    title: "Absorb 6 million IDs a second per machine",
    description: "Each machine now gets 6,000 IDs per millisecond. Keep the average wait under 1 ms with no IDs running more than 10 ms ahead of the clock, while keeping 50+ years and at least 512 machine IDs.",
    setup: { tsBits: 41, dcBits: 5, workerBits: 5, machines: 2, rateK: 6000, policy: "refuse", stepBackMs: 0 },
    durationMs: 5_000,
    winCondition(_h, s) {
      const l = s.layout;
      const ahead = Math.max(...s.gens.map((g) => g.aheadMs));
      const ok = avgWait(s) < 1 && ahead <= 10 && lifetimeYears(l) >= 50 && maxMachines(l) >= 512 && s.dups === 0;
      return ok
        ? { passed: true, value: avgWait(s), detail: `Layout ${lay(s)}: ${perMs(l).toLocaleString()} per ms covers the burst; average wait ${avgWait(s).toFixed(3)} ms.` }
        : { passed: false, value: avgWait(s), detail: `Layout ${lay(s)}: ${perMs(l).toLocaleString()} IDs per ms, average wait ${avgWait(s).toFixed(1)} ms, up to ${ahead} ms ahead, ${yrs(s)} years, ${maxMachines(l)} machines.` };
    },
    hint: "4,096 per ms can't serve 6,000: requests queue for the next millisecond and the queue never drains. One more sequence bit doubles capacity; take it from the worker field, not the timestamp.",
  },
];
