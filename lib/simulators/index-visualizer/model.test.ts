import { describe, expect, it } from "vitest";
import { createRng, Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import {
  L0_MAX, btDelete, btInsert, btKeys, btLevels, btSearch, btWA, ivModel, lsmFlush, lsmGet, lsmReadCost, lsmWA, newLsm, newTree,
  type BNode, type BTree, type IvConfig,
} from "./model";

/** Every B-tree rule: sorted keys, node sizes within bounds, all leaves at one depth. */
function checkTree(t: BTree) {
  const leafDepths = new Set<number>();
  const visit = (n: BNode, depth: number, lo: number, hi: number, root: boolean) => {
    expect(n.keys.length).toBeLessThanOrEqual(t.order - 1);
    if (!root) expect(n.keys.length).toBeGreaterThanOrEqual(Math.ceil(t.order / 2) - 1);
    n.keys.forEach((k, i) => { expect(k).toBeGreaterThan(lo); expect(k).toBeLessThan(hi); if (i) expect(k).toBeGreaterThan(n.keys[i - 1]); });
    if (!n.kids) { leafDepths.add(depth); return; }
    expect(n.kids).toHaveLength(n.keys.length + 1);
    n.kids.forEach((c, i) => visit(c, depth + 1, i ? n.keys[i - 1] : lo, i < n.keys.length ? n.keys[i] : hi, false));
  };
  visit(t.root, 0, -Infinity, Infinity, true);
  expect(leafDepths.size).toBeLessThanOrEqual(1);
}

const cfg = (p: Partial<IvConfig> = {}): IvConfig => ({ order: 4, pattern: "random", batch: 64, bloom: false, ...p });

describe("B-tree", () => {
  it.each([3, 4, 5])("stays valid through random inserts and deletes (order %i)", (order) => {
    const t = newTree(order), rng = createRng(order), live = new Set<number>();
    for (let i = 0; i < 600; i++) { const k = rng.int(0, 999); btInsert(t, k); live.add(k); }
    checkTree(t);
    expect(btKeys(t)).toEqual([...live].sort((a, b) => a - b));
    for (let i = 0; i < 500; i++) { const k = rng.int(0, 999); expect(btDelete(t, k).found).toBe(live.has(k)); live.delete(k); }
    checkTree(t);
    expect(btKeys(t)).toEqual([...live].sort((a, b) => a - b));
    for (const k of [...live].slice(0, 20)) expect(btSearch(t, k).found).toBe(true);
  });

  it("splits a full leaf and grows a new root (order 3)", () => {
    const t = newTree(3);
    btInsert(t, 10); btInsert(t, 20);
    const r = btInsert(t, 30);
    expect(r.split).toEqual([0]);
    expect(t.root.keys).toEqual([20]);
    expect(t.root.kids!.map((k) => k.keys)).toEqual([[10], [30]]);
    expect(btSearch(t, 30).path).toHaveLength(2);
  });

  it("deleting everything empties the tree back to one leaf", () => {
    const t = newTree(4);
    for (let k = 0; k < 100; k++) btInsert(t, k);
    expect(btLevels(t).length).toBeGreaterThan(2);
    for (let k = 0; k < 100; k++) btDelete(t, k);
    expect(t.root).toMatchObject({ keys: [] });
    expect(t.root.kids).toBeUndefined();
    expect(btDelete(t, 5).found).toBe(false); // failure path: deleting a missing key is a no-op
  });
});

describe("LSM tree", () => {
  it("reads return the newest value through flushes, deletes and compactions", () => {
    const lsm = newLsm(), rng = createRng(3), live = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const k = rng.int(0, 499);
      if (rng.chance(0.2)) { lsm.mem[k] = { k, d: 1 }; live.delete(k); } else { lsm.mem[k] = { k }; live.add(k); }
      if (Object.keys(lsm.mem).length >= 32) lsmFlush(lsm, 32);
    }
    expect(lsm.files.filter((f) => f.level === 0).length).toBeLessThanOrEqual(L0_MAX);
    expect(lsm.files.some((f) => f.level === 2)).toBe(true);
    for (let k = 0; k < 500; k++) expect(lsmGet(lsm, k, false).found, `key ${k}`).toBe(live.has(k));
    for (let k = 0; k < 500; k++) expect(lsmGet(lsm, k, true).found).toBe(live.has(k)); // Bloom filters never give false negatives
    // L1 and L2 files never overlap within a level.
    for (const level of [1, 2]) {
      const fs = lsm.files.filter((f) => f.level === level).sort((a, b) => a.min - b.min);
      fs.slice(1).forEach((f, i) => expect(f.min).toBeGreaterThan(fs[i].max));
    }
  });
});

describe("index visualizer model", () => {
  const fill = (c: IvConfig, n = 1000, seed = 1) => {
    const sim = new Simulation(ivModel, c, seed);
    sim.act("bulk", { n, config: c, seed });
    return sim;
  };

  it("the LSM writes far fewer bytes than the B-tree for 1,000 random inserts", () => {
    const s = fill(cfg()).state;
    expect(s.inserted).toBe(1000);
    expect(lsmWA(s)).toBeGreaterThan(1); // flush + at least some compaction rewrites
    expect(btWA(s)).toBeGreaterThan(lsmWA(s) * 3);
  });

  it("sequential keys and bigger batches make the B-tree cheaper (fewer distinct dirty pages)", () => {
    const rnd = btWA(fill(cfg({ batch: 16 })).state), seq = btWA(fill(cfg({ batch: 16, pattern: "sequential" })).state);
    expect(seq).toBeLessThan(rnd / 2);
    expect(btWA(fill(cfg({ batch: 128 })).state)).toBeLessThan(rnd);
  });

  it("Bloom filters cut LSM files touched per read; misses without them read every overlapping file", () => {
    const off = fill(cfg()).state;
    const on = fill(cfg({ bloom: true })).state;
    expect(lsmReadCost(off)).toBeGreaterThan(2);
    expect(lsmReadCost(on)).toBeLessThan(1.2);
    // A B-tree read touches at most one node per level (fewer when the key sits in an internal node).
    expect(Math.max(...on.btReads)).toBeLessThanOrEqual(btLevels(on.tree).length);
  });

  it("Play inserts one batch per second and the order control rebuilds the tree", () => {
    const sim = new Simulation(ivModel, cfg({ batch: 32 }), 1);
    sim.runFor(3_050);
    expect(sim.state.inserted).toBe(96);
    sim.setConfig({ order: 3 });
    sim.runFor(100);
    expect(sim.state.tree.order).toBe(3);
    checkTree(sim.state.tree);
    expect(btKeys(sim.state.tree)).toHaveLength(Object.keys(sim.state.keys).length);
  });

  it("manual insert, search and delete record the path and LSM files touched", () => {
    const sim = fill(cfg({ order: 3 }), 300);
    const key = btKeys(sim.state.tree)[10];
    sim.act("search", { key, bloom: false });
    expect(sim.state.last).toMatchObject({ kind: "search", found: true });
    expect(sim.state.last!.path.length).toBeLessThanOrEqual(btLevels(sim.state.tree).length);
    expect(sim.state.last!.path[0]).toBe(sim.state.tree.root.id);
    sim.act("delete", { key, batch: 64 });
    sim.act("search", { key, bloom: false });
    expect(sim.state.last!.found).toBe(false);
    expect(lsmGet(sim.state.lsm, key, false).found).toBe(false); // the tombstone shadows it
  });
});

describe("index visualizer challenges", () => {
  const get = (id: string) => challenges.find((c) => c.id === id)!;

  it("write-cost needs 1,000 inserts and the right answer", () => {
    const c = get("write-cost");
    const sim = new Simulation(ivModel, cfg(), 1);
    sim.act("answer", "lsm");
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(false);
    sim.act("bulk", { n: 1000, config: cfg(), seed: 1 });
    expect(c.done!(sim.state)).toBe(true);
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(true);
    sim.act("answer", "btree");
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(false);
  });

  it("bloom-reads fails without filters and passes once they are on", () => {
    const c = get("bloom-reads");
    const sim = new Simulation(ivModel, cfg(), 1);
    sim.act("bulk", { n: 1000, config: cfg(), seed: 1 });
    expect(c.done!(sim.state)).toBe(false);
    sim.act("bulk", { n: 640, config: cfg({ bloom: true }), seed: 2 });
    expect(c.done!(sim.state)).toBe(true);
    expect(c.winCondition(sim.metrics.history(), sim.state).detail).toMatch(/without Bloom filters/);
  });
});
