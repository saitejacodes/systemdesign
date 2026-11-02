import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { CAPACITY, USERS, maxAvg, shModel, type ShConfig, type ShState } from "./model";

const sim = (c: Partial<ShConfig> = {}, seed = 1) => new Simulation<ShConfig, ShState>(shModel, { shards: 8, strategy: "hash", skew: 0, ...c }, seed);
const win = (i: number, s: Simulation<ShConfig, ShState>) => challenges[i].winCondition(s.metrics.history(), s.state);

describe("sharding", () => {
  it("routes per strategy", () => {
    const id = sim({ strategy: "range-id" }).state;
    expect(id.owner[0]).toBe(0);
    expect(id.owner[USERS - 1]).toBe(7);
    expect(id.owner[1249]).toBe(0);
    expect(id.owner[1250]).toBe(1);
    const name = sim({ strategy: "range-name" }).state;
    expect(name.owner[name.byName[0]]).toBe(0);
    expect(name.owner[name.byName[USERS - 1]]).toBe(7);
    const h = sim().state;
    for (const u of [0, 17, 4321]) expect(h.owner[u]).toBe(h.hashes[u] % 8);
    for (const s of [id, name, h]) expect(Array.from(s.users).reduce((a, b) => a + b, 0)).toBe(USERS);
  });

  it("adding a shard moves most data under hash, little under range and directory", () => {
    const moved = (strategy: ShConfig["strategy"]) => { const s = sim({ strategy }); s.act("addShard"); expect(s.state.n).toBe(9); return s.state.last!.moved; };
    expect(moved("hash")).toBeGreaterThan(0.8);
    expect(moved("range-id")).toBeLessThan(0.1);
    expect(moved("range-name")).toBeLessThan(0.1);
    expect(moved("directory")).toBeLessThan(0.1);
  });

  it("changing strategy or N in the config re-shards on the next tick, and actions are not undone", () => {
    const s = sim();
    s.act("addShard");
    s.step();
    expect(s.state.n).toBe(9);
    s.setConfig({ strategy: "directory" });
    s.step();
    expect(s.state.last!.moved).toBe(0);
    s.setConfig({ shards: 12 });
    s.step();
    expect(s.state.n).toBe(12);
    s.setConfig({ shards: 4 });
    s.step();
    expect(s.state.n).toBe(4);
    expect(Math.max(...s.state.owner)).toBe(3);
  });

  it("Zipf skew raises max/avg, worst with range by id", () => {
    expect(maxAvg(sim({ skew: 1.1 }).state)).toBeGreaterThan(maxAvg(sim().state));
    expect(maxAvg(sim({ strategy: "range-id", skew: 1.1 }).state)).toBeGreaterThan(5);
    expect(maxAvg(sim({ strategy: "range-id" }).state)).toBeCloseTo(1, 5);
  });

  it("a celebrity overloads their shard; salting or a dedicated shard fixes it", () => {
    const s = sim();
    const before = Math.max(...s.state.load);
    s.act("celebrity");
    const hot = Math.max(...s.state.load);
    expect(hot).toBeGreaterThan(before + 1000);
    expect(hot).toBeGreaterThan(CAPACITY);
    s.act("salt");
    expect(Math.max(...s.state.load)).toBeLessThan(CAPACITY * 0.8);
    expect(s.state.last!.moved).toBeLessThan(0.001);

    const d = sim({ strategy: "directory" });
    d.act("celebrity");
    d.act("isolate");
    expect(d.state.n).toBe(9);
    expect(d.state.users[8]).toBe(1);
    expect(Math.max(...d.state.load)).toBeLessThan(CAPACITY);
  });

  it("splitting the hot shard in directory mode lowers max/avg", () => {
    const s = sim({ strategy: "directory", skew: 1.1 });
    const r = maxAvg(s.state);
    s.act("addShard");
    expect(maxAvg(s.state)).toBeLessThan(r);
  });

  it("counts shards per friends' feed query: range keeps friends together, salting fans out", () => {
    const range = sim({ strategy: "range-id" }).state, hash = sim().state;
    expect(range.perQuery).toBeLessThan(hash.perQuery - 2);
    expect(hash.perQuery).toBeGreaterThan(7);
    expect(hash.crossShard).toBeGreaterThan(0.99);
    const s = sim({ strategy: "range-id" });
    s.act("salt");
    expect(s.state.perQuery).toBeGreaterThan(range.perQuery);
  });

  it("challenge 1: range by id fails at Zipf 1.1; hash with the top keys salted passes", () => {
    const bad = sim(challenges[0].setup);
    bad.act("addShard");
    expect(win(0, bad).passed).toBe(false);
    const good = sim(challenges[0].setup);
    good.setConfig({ strategy: "hash" });
    good.step();
    expect(win(0, good).passed).toBe(false);
    for (let i = 0; i < 3; i++) good.act("salt");
    expect(win(0, good).passed).toBe(true);
    expect(challenges[0].done!(good.state)).toBe(true);
  });

  it("challenge 2: more shards do not tame a celebrity; salting does", () => {
    const bad = sim(challenges[1].setup);
    expect(win(1, bad).passed).toBe(false);
    bad.act("celebrity");
    bad.setConfig({ shards: 16 });
    bad.step();
    expect(win(1, bad).passed).toBe(false);
    const good = sim(challenges[1].setup);
    good.act("celebrity");
    good.act("salt");
    expect(win(1, good).passed).toBe(true);
  });

  it("is deterministic per seed", () => {
    const run = (seed: number) => { const s = sim({ skew: 0.8 }, seed); s.runFor(1_000); return [s.state.perQuery, ...s.state.obs]; };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });
});
