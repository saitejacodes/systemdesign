import type { Challenge } from "@/lib/sim/engine";
import type { BenchResult, FilterId, VsConfig, VsState } from "./model";

const MAX_PCT = 20;
const MIN_RECALL = 0.95;
const pc = (x: number) => `${x.toFixed(1)}%`;

/** A finished benchmark for this filter, with no fault active. */
const resultFor = (s: VsState, f: FilterId): BenchResult | undefined => (s.last && s.last.filter === f && !s.last.faults.length ? s.last : undefined);

function judge(s: VsState, f: FilterId, why: (r: BenchResult) => string): { passed: boolean; value: number; detail: string } {
  const r = resultFor(s, f);
  if (!r) return { passed: false, value: 0, detail: s.last?.faults.length ? "A fault was active: clear it in Break it and let the benchmark rerun." : "No finished benchmark yet: wait for the index to build and the 200 queries to run." };
  const how = `recall@10 ${r.recall.toFixed(3)} at ${Math.round(r.comps)} distance computations per query (${pc(r.pct)} of brute force)${r.short ? `; ${r.short} of ${r.queries} queries got fewer than 10 results` : ""}`;
  const passed = r.recall >= MIN_RECALL && r.pct < MAX_PCT && r.short === 0;
  return { passed, value: r.recall * 100, detail: passed ? `Passed: ${how}. ${why(r)}` : `Not yet: ${how}.` };
}

export const challenges: Challenge<VsConfig, VsState>[] = [
  {
    id: "recall-95-cheap",
    title: "95% recall for a fifth of the work",
    description: "With no filter, reach recall@10 ≥ 0.95 on the 200-query benchmark while HNSW computes fewer than 20% of the distances brute force does (400 of 2,000 per query).",
    setup: { filter: "none" },
    durationMs: 60_000,
    better: "higher",
    done: (s) => !!resultFor(s, "none"),
    winCondition: (_h, s) => judge(s, "none", (r) => `M=${r.M}, efConstruction=${r.efC}, efSearch=${r.efSearch}. A better-connected graph lets a small beam find the true neighbours; a bigger beam buys recall with more distance computations.`),
    hint: "The default graph is too sparse (M=4). Raise M and efConstruction so the graph has good links, then find the smallest efSearch that still reaches 0.95. Too large an efSearch blows the 20% budget.",
  },
  {
    id: "rare-filter",
    title: "The post-filter trap",
    description: "Filter to source = ticket AND year = 2026 (about 3% of items). Every query must return 10 results with recall@10 ≥ 0.95 and under 20% of brute-force distance computations.",
    setup: { filter: "rare" },
    durationMs: 60_000,
    better: "higher",
    done: (s) => !!resultFor(s, "rare"),
    winCondition: (_h, s) => judge(s, "rare", (r) => (r.mode === "pre" ? `Scanning only the ~${Math.round(r.comps)} matching items is exact and cheap when the filter is this selective.` : "HNSW's beam happened to hold enough matches.")),
    hint: "Post-filtering keeps only the matches among HNSW's efSearch best: with 3% matching, efSearch=100 leaves about 3. Raising efSearch costs more than it helps. Filter first.",
  },
  {
    id: "broad-filter",
    title: "When pre-filtering costs too much",
    description: "Filter to source = docs (about 40% of items). Every query must return 10 results with recall@10 ≥ 0.95 and under 20% of brute-force distance computations.",
    setup: { filter: "docs" },
    durationMs: 60_000,
    better: "higher",
    done: (s) => !!resultFor(s, "docs"),
    winCondition: (_h, s) => judge(s, "docs", (r) => (r.mode === "post" ? `With 40% matching, efSearch=${r.efSearch} candidates hold 10 matches for every query, so searching first and filtering after is cheaper than an exact scan of ~800 items. Real planners pick by selectivity.` : "")),
    hint: "An exact scan of 40% of the items costs 40% of brute force. With a broad filter, post-filtering works if efSearch is big enough to hold 10 matches: about 10 ÷ 0.4 = 25, plus margin.",
  },
];
