import type { Challenge } from "@/lib/sim/engine";
import { lamportMisleads, pickedPair, seenEverything, wallContradicts, type ClocksConfig, type ClocksState } from "./model";

const pairText = (s: ClocksState) => { const p = pickedPair(s); return p ? `${p[0].name} and ${p[1].name}` : "no pair"; };

export const challenges: Challenge<ClocksConfig, ClocksState>[] = [
  {
    id: "lamport-misleads",
    title: "Catch Lamport lying",
    description: "Pick two concurrent events whose Lamport timestamps differ, so ordering by L would put one \"first\" although neither could have influenced the other.",
    durationMs: 3_600_000,
    better: "higher",
    done: lamportMisleads,
    winCondition: (_h, s) => (lamportMisleads(s)
      ? { passed: true, value: 1, detail: `${pairText(s)} are concurrent (neither vector ≤ the other), yet their L values differ. a → b implies L(a) < L(b), never the converse.` }
      : { passed: false, value: 0, detail: `Picked: ${pairText(s)}. Pick two events whose vectors are incomparable and whose L values differ.` }),
    hint: "Do two or three local events on P1 while P3 does one. Neither talked to the other, so they are concurrent, but P1's later events carry bigger L.",
  },
  {
    id: "wall-clock-lies",
    title: "Make the wall clock contradict causality",
    description: "Pick a send and its effect (or any causally ordered pair) where the effect's wall-clock reading is no later than the cause's.",
    durationMs: 3_600_000,
    better: "higher",
    setup: { skew1: 0, skew2: 0, skew3: 0 },
    done: wallContradicts,
    winCondition: (_h, s) => (wallContradicts(s)
      ? { passed: true, value: 1, detail: `${pairText(s)}: one happened before the other, but its wall clock reads later. Last-write-wins on these timestamps would keep the older value.` }
      : { passed: false, value: 0, detail: `Picked: ${pairText(s)}. With accurate clocks, an effect always reads later than its cause. Skew one clock first.` }),
    hint: "Set P1's skew to +200 ms, then send from P1 to P2 and receive it. The receive happened after the send, yet P2's clock says earlier.",
  },
  {
    id: "seen-everything",
    title: "One event that has seen it all",
    description: "With at least 6 events on all three processes, create an event that every other event happened before: its vector dominates every other vector.",
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => !!seenEverything(s),
    winCondition(_h, s) {
      const e = seenEverything(s);
      return e
        ? { passed: true, value: 1, detail: `${e.name} has V=[${e.V}]: the element-wise max of everything. This is what a merged write carries to supersede both siblings.` }
        : { passed: false, value: 0, detail: `${s.events.length} events. Every event must reach one process through messages, and that process must receive last.` };
    },
    hint: "Turn off auto events. Do some events everywhere, then have P1 and P3 each send to P2, and receive both on P2 as the very last events.",
  },
];
