import type { Challenge } from "@/lib/sim/engine";
import { CAPACITY, maxAvg, type ShConfig, type ShState } from "./model";

const x = (v: number) => `${v.toFixed(2)}×`;
const balanced = (s: ShState) => s.skew >= 1.1 && maxAvg(s) < 1.5;
const tamed = (s: ShState) => s.celebs.length > 0 && maxAvg(s) < 1.5 && s.load.every((l) => l < CAPACITY);

export const challenges: Challenge<ShConfig, ShState>[] = [
  {
    id: "zipf-balance",
    title: "Balance a Zipf workload",
    description: "Traffic follows Zipf 1.1: the busiest user gets about 15% of all requests, and the hot users have the lowest ids. Get the busiest shard under 1.5× the average while skew stays at 1.1 or above.",
    setup: { shards: 8, strategy: "range-id", skew: 1.1 },
    durationMs: 120_000,
    done: balanced,
    winCondition(_h, s) {
      const r = maxAvg(s);
      if (s.skew < 1.1) return { passed: false, value: r, detail: `Skew is ${s.skew}. Put it back to 1.1: the point is to survive a skewed workload.` };
      return r < 1.5
        ? { passed: true, value: r, detail: `Busiest shard is ${x(r)} the average with ${s.n} shards.` }
        : { passed: false, value: r, detail: `Busiest shard is ${x(r)} the average. ${s.strategy === "range-id" ? "Range by id puts all the low-id hot users on the first shard." : "A single hot key still dominates its shard."}` };
    },
    hint: "Range by id clusters the hot users, and splitting ranges cannot cut below one user. Switch to hash (or a directory) to scatter them, then salt the 2–3 hottest keys so no single user outweighs a shard.",
  },
  {
    id: "celebrity",
    title: "Handle a celebrity",
    description: "On 8 hash-sharded shards with uniform traffic, mark a celebrity (1,500 req/s). Then keep every shard under capacity and the busiest under 1.5× the average.",
    setup: { shards: 8, strategy: "hash", skew: 0 },
    durationMs: 120_000,
    done: tamed,
    winCondition(_h, s) {
      const r = maxAvg(s);
      if (!s.celebs.length) return { passed: false, value: r, detail: "Press Mark celebrity first." };
      return tamed(s)
        ? { passed: true, value: r, detail: `Busiest shard is ${x(r)} the average and none is overloaded.` }
        : { passed: false, value: r, detail: `Busiest shard is ${x(r)} the average. The celebrity's shard serves their 1,500 req/s on top of everyone else living there.` };
    },
    hint: "Adding shards only shrinks the neighbours' share. Either salt the celebrity's key (split it across every shard) or switch to the directory and give the celebrity a dedicated shard.",
  },
];
