import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { definition } from "./index";
import raw from "./data/corpus.json";
import { TICK_BUDGET, answer, bruteForce, decodeCorpus, insert, isBuilt, knn, layerSizes, newIndex, vsModel, type RawCorpus, type VsConfig } from "./model";
import { mulberry32 } from "@/lib/sim/engine/rng";

const corpus = decodeCorpus(raw as RawCorpus);
const base = definition.defaultConfig;
const GOOD: Partial<VsConfig> = { M: 8, efConstruction: 64, efSearch: 20 };

function run(cfg: Partial<VsConfig> = {}, seed = 1, faults: string[] = []) {
  const sim = new Simulation(vsModel, { ...base, ...cfg }, seed);
  sim.act("load", corpus);
  for (const f of faults) sim.toggleFault(f);
  for (let i = 0; i < 20_000 && !sim.state.last; i++) sim.step();
  return sim;
}
const check = (id: string, cfg: Partial<VsConfig>) => {
  const c = challenges.find((x) => x.id === id)!;
  const sim = run({ ...cfg, ...c.setup });
  expect(c.done!(sim.state)).toBe(true);
  return c.winCondition(sim.metrics.history(), sim.state);
};

describe("corpus", () => {
  it("decodes 2,000 unit-length 64-d LSA vectors in 8 topics", () => {
    expect(corpus.n).toBe(2000);
    expect(corpus.dim).toBe(64);
    expect(corpus.topics).toHaveLength(8);
    for (const i of [0, 777, 1999]) {
      let n = 0;
      for (let d = 0; d < 64; d++) n += corpus.vecs[i * 64 + d] ** 2;
      expect(n).toBeCloseTo(1, 5);
    }
    expect(corpus.queries.length).toBeGreaterThanOrEqual(8);
  });

  it("neighbours are mostly, not entirely, from the same topic (the clusters overlap)", () => {
    let same = 0, total = 0;
    for (let q = 0; q < corpus.n; q += 20) {
      const r = bruteForce(corpus.vecs, 64, corpus.n, corpus.vecs, q, 10, (i) => i !== q);
      same += r.hits.filter((h) => corpus.topic[h.id] === corpus.topic[q]).length;
      total += r.hits.length;
    }
    expect(same / total).toBeGreaterThan(0.5);
    expect(same / total).toBeLessThan(0.95);
  });
});

describe("search", () => {
  it("brute force returns the exact top-k by cosine and scans every item", () => {
    const q = 5;
    const r = bruteForce(corpus.vecs, 64, corpus.n, corpus.vecs, q, 10, () => true);
    const all = Array.from({ length: corpus.n }, (_, i) => { let s = 0; for (let d = 0; d < 64; d++) s += corpus.vecs[q * 64 + d] * corpus.vecs[i * 64 + d]; return { i, s }; }).sort((a, b) => b.s - a.s);
    expect(r.hits.map((h) => h.id)).toEqual(all.slice(0, 10).map((x) => x.i));
    expect(r.hits[0].id).toBe(q);
    expect(r.comps).toBe(corpus.n);
  });

  it("HNSW respects degree caps (2M on layer 0, M above) and layers shrink about M-fold", () => {
    const M = 8, ix = newIndex(corpus.vecs, 64, corpus.n, M, 64), rng = { next: mulberry32(3) };
    for (let i = 0; i < corpus.n; i++) insert(ix, i, rng);
    for (let i = 0; i < corpus.n; i++) ix.links[i].forEach((l, layer) => expect(l.length).toBeLessThanOrEqual(layer === 0 ? 2 * M : M));
    const sizes = layerSizes(ix);
    expect(sizes[0]).toBe(corpus.n);
    expect(sizes[1]).toBeGreaterThan(corpus.n / M / 2);
    expect(sizes[1]).toBeLessThan((corpus.n / M) * 2);
    const { hits, comps } = knn(ix, corpus.vecs, 10, 20);
    expect(hits[0].id).toBe(10);
    expect(comps).toBeLessThan(corpus.n / 4);
  });

  it("builds incrementally within the per-tick budget, then benchmarks", () => {
    const sim = new Simulation(vsModel, { ...base, ...GOOD }, 1);
    sim.act("load", corpus);
    sim.step();
    const after1 = sim.state.ix!.buildComps;
    expect(sim.state.ix!.inserted).toBeLessThan(corpus.n);
    expect(after1).toBeLessThan(TICK_BUDGET + 5000);
    for (let i = 0; i < 20_000 && !sim.state.last; i++) sim.step();
    expect(sim.state.buildTicks).toBeGreaterThan(10);
    expect(sim.state.last!.queries).toBe(200);
    expect(sim.log.entries().some((e) => e.message.startsWith("HNSW built"))).toBe(true);
  });

  it("the largest build stays responsive: no tick takes long", () => {
    const sim = new Simulation(vsModel, { ...base, M: 32, efConstruction: 400 }, 1);
    sim.act("load", corpus);
    sim.step(); // JIT warm-up
    let worst = 0;
    while (!isBuilt(sim.state)) { const t = performance.now(); sim.step(); worst = Math.max(worst, performance.now() - t); }
    expect(worst).toBeLessThan(50); // ~4 ms on a laptop; loose for slow CI
  });

  it("more effort buys recall and costs distance computations", () => {
    const lo = run().state.last!, hi = run(GOOD).state.last!;
    expect(lo.recall).toBeLessThan(0.9);
    expect(hi.recall).toBeGreaterThan(0.97);
    expect(hi.comps).toBeGreaterThan(lo.comps);
  });

  it("changing M rebuilds the index; changing efSearch reruns only the benchmark", () => {
    const sim = run(GOOD);
    const ix = sim.state.ix;
    sim.setConfig({ efSearch: 40 });
    sim.step();
    expect(sim.state.ix).toBe(ix);
    expect(sim.state.bench!.next).toBeGreaterThan(0);
    sim.setConfig({ M: 12 });
    sim.step();
    expect(sim.state.ix).not.toBe(ix);
    expect(sim.state.ix!.M).toBe(12);
  });

  it("answers an interactive query with a trace, while paused", () => {
    const sim = run(GOOD);
    sim.act("query", { kind: "item", i: 42 });
    const r = answer(sim.state, sim.config)!;
    expect(r.hits).toHaveLength(10);
    expect(r.hits.some((h) => h.id === 42)).toBe(false);
    expect(r.trace!.visited.length).toBeGreaterThan(0);
    expect(r.trace!.visited.length).toBeLessThanOrEqual(r.comps);
    sim.act("query", { kind: "sample", i: 3 });
    expect(answer(sim.state, sim.config)!.exact[0].id).not.toBe(r.exact[0].id);
  });

  it("is deterministic per seed (layer draws come from the sim RNG)", () => {
    const a = run(GOOD, 7).state, b = run(GOOD, 7).state, c = run(GOOD, 8).state;
    expect(a.ix!.buildComps).toBe(b.ix!.buildComps);
    expect(a.last).toEqual(b.last);
    expect(c.ix!.level).not.toEqual(a.ix!.level);
  });
});

describe("filters and faults", () => {
  it("post-filter with a rare filter returns too few results; pre-filter returns all 10, exactly", () => {
    const post = run({ ...GOOD, filter: "rare", filterMode: "post", efSearch: 100 }).state.last!;
    expect(post.returned).toBeLessThan(5);
    expect(post.short).toBeGreaterThan(150);
    const pre = run({ ...GOOD, filter: "rare", filterMode: "pre" }).state.last!;
    expect(pre.returned).toBe(10);
    expect(pre.recall).toBe(1);
    expect(pre.pct).toBeLessThan(5);
  });

  it("forgetting to normalise lets long texts win and drops recall", () => {
    const r = run(GOOD, 1, ["unnormalised"]).state.last!;
    expect(r.faults).toEqual(["unnormalised"]);
    expect(r.recall).toBeLessThan(0.8);
  });

  it("a query embedding model that doesn't match the index returns near-random neighbours", () => {
    expect(run(GOOD, 1, ["mismatch"]).state.last!.recall).toBeLessThan(0.2);
  });
});

describe("challenges", () => {
  it("recall-95-cheap: a tuned graph passes; the sparse default and an oversized beam fail", () => {
    expect(check("recall-95-cheap", GOOD).passed).toBe(true);
    expect(check("recall-95-cheap", {}).passed).toBe(false);
    expect(check("recall-95-cheap", { M: 16, efConstruction: 100, efSearch: 120 }).passed).toBe(false);
  });

  it("rare-filter: pre-filter passes; post-filter fails even with a big beam", () => {
    expect(check("rare-filter", { ...GOOD, filterMode: "pre" }).passed).toBe(true);
    expect(check("rare-filter", { ...GOOD, filterMode: "post", efSearch: 150 }).passed).toBe(false);
  });

  it("broad-filter: post-filter with enough efSearch passes; pre-filter costs ~40%", () => {
    expect(check("broad-filter", { ...GOOD, filterMode: "post", efSearch: 48 }).passed).toBe(true);
    const pre = check("broad-filter", { ...GOOD, filterMode: "pre" });
    expect(pre.passed).toBe(false);
    expect(check("broad-filter", { ...GOOD, filterMode: "post", efSearch: 12 }).passed).toBe(false);
  });

  it("a fault voids the result", () => {
    const c = challenges[0];
    const sim = run({ ...GOOD, ...c.setup }, 1, ["mismatch"]);
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(false);
  });
});
