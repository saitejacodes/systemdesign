import type { Challenge } from "@/lib/sim/engine";
import { counts, spread, type ChConfig, type ChState } from "./model";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const balanced = (s: ChState) => s.ids.length === 5 && spread(counts(s, s.ownerC)) < 0.1;
const grewFrom4 = (s: ChState) => s.last?.kind === "add" && s.last.from === 4 && s.last.to === 5;

export const challenges: Challenge<ChConfig, ChState>[] = [
  {
    id: "even-load",
    title: "Even out 5 nodes",
    description: "With 10,000 keys on 5 nodes, get the standard deviation of keys per node under 10% of the mean. Add a node, then find how many virtual nodes it takes.",
    setup: { keys: 10_000 },
    durationMs: 120_000,
    done: balanced,
    winCondition(_h, s) {
      const sd = spread(counts(s, s.ownerC));
      if (s.ids.length !== 5) return { passed: false, value: sd * 100, detail: `You have ${s.ids.length} nodes. The challenge needs exactly 5.` };
      return sd < 0.1
        ? { passed: true, value: sd * 100, detail: `Spread is ${pct(sd)} of the mean with ${s.v} virtual nodes per node.` }
        : { passed: false, value: sd * 100, detail: `Spread is still ${pct(sd)} of the mean. With few points per node, arcs of the ring differ wildly in length.` };
    },
    hint: "One point per node gives each node one random arc. More virtual nodes average many arcs together; the spread shrinks roughly like 1/√V.",
  },
  {
    id: "add-fifth",
    title: "Grow from 4 to 5 nodes",
    description: "Starting from 4 nodes, add a fifth. Show that consistent hashing moves about 1/5 of the keys (under 30%) while modulo hashing moves most of them.",
    durationMs: 120_000,
    better: "lower",
    done: grewFrom4,
    winCondition(_h, s) {
      if (!grewFrom4(s)) return { passed: false, value: 100, detail: "Press Add node once, from 4 nodes to 5." };
      const { movedC, movedM } = s.last!;
      return movedC < 0.3 && movedM > 0.6
        ? { passed: true, value: movedC * 100, detail: `Consistent hashing moved ${pct(movedC)}; modulo moved ${pct(movedM)}. Only the new node's arcs changed hands.` }
        : { passed: false, value: movedC * 100, detail: `Consistent hashing moved ${pct(movedC)}. With so few virtual nodes the new node landed on an unusually large arc. Raise V, reset and try again.` };
    },
    hint: "In theory a new node takes 1/(N+1) of the keys. Modulo hashing changes key % 4 into key % 5, which keeps only 1 key in 5 in place.",
  },
];
