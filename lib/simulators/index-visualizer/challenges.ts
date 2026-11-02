import type { Challenge } from "@/lib/sim/engine";
import { btWA, cheaperWriter, lsmReadCost, lsmWA, type IvConfig, type IvState } from "./model";

const LABEL = { btree: "the B-tree", lsm: "the LSM tree" };
const bloomWin = (s: IvState) => s.bloomAt === true && s.lsmReads.length >= 100 && s.lsm.files.length >= 3 && lsmReadCost(s) <= 1.2;

export const challenges: Challenge<IvConfig, IvState>[] = [
  {
    id: "write-cost",
    title: "Who writes less?",
    description: "Insert at least 1,000 random keys into both structures (Play, or Insert 1,000), compare the bytes each wrote to disk, then answer: which has the lower write cost?",
    setup: { pattern: "random" },
    durationMs: 600_000,
    better: "higher",
    done: (s) => s.inserted >= 1000 && s.answer !== undefined,
    winCondition(_h, s) {
      if (s.inserted < 1000) return { passed: false, value: 0, detail: `Only ${s.inserted} keys inserted so far; insert at least 1,000.` };
      const right = cheaperWriter(s);
      const nums = `B-tree ${btWA(s).toFixed(1)}× vs LSM ${lsmWA(s).toFixed(1)}× write amplification`;
      return s.answer === right
        ? { passed: true, value: 1, detail: `Right: ${LABEL[right]} (${nums}). A random insert dirties a whole 4 KB page to store 100 bytes; the LSM buffers in RAM and writes sorted runs sequentially, paying again only when compaction rewrites them.` }
        : { passed: false, value: 0, detail: s.answer ? `Not quite: ${nums}. Look at the two write-amplification cards.` : `Answer the question under the panes. ${nums}.` };
    },
    hint: "Write amplification = bytes written to disk ÷ bytes you inserted. Compare a 4 KB page rewrite per random insert with a flush that writes each entry once (plus compactions).",
  },
  {
    id: "bloom-reads",
    title: "Cut LSM read cost with Bloom filters",
    description: "With random keys and at least 3 SSTables, get the LSM's average files touched per read (last 100+ reads, half of them for missing keys) to 1.2 or less.",
    setup: { pattern: "random", bloom: false },
    durationMs: 300_000,
    better: "lower",
    done: bloomWin,
    winCondition(_h, s) {
      const v = lsmReadCost(s);
      const before = s.noBloomAvg !== undefined ? ` (it was ${s.noBloomAvg.toFixed(2)} without Bloom filters)` : "";
      return bloomWin(s)
        ? { passed: true, value: v, detail: `${v.toFixed(2)} files per read${before}. A missing key now costs almost nothing: each file's filter says "definitely not here" in RAM, and only ~1% of checks are false positives.` }
        : { passed: false, value: v, detail: `${v.toFixed(2)} files per read over ${s.lsmReads.length} reads${s.bloomAt ? "" : ", Bloom filters off"}. Random keys make L0 files overlap, so a miss has to open every one of them.` };
    },
    hint: "Fence pointers (each file's min/max key) can't help when every L0 file spans the whole key range. Something cheap in memory has to say \"this key is definitely not in this file\".",
  },
];
