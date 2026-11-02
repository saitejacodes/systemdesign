import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { definition } from "./index";
import { cacheModel, hitRate, raceTimeline, zipfCdf, type CacheConfig } from "./model";

const base = definition.defaultConfig;
const sim = (patch: Partial<CacheConfig> = {}, seed = 1) => new Simulation(cacheModel, { ...base, ...patch }, seed);
const run = (id: string, patch: Partial<CacheConfig> = {}, seed = 1) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(cacheModel, { ...base, ...c.setup, ...patch }, seed);
  s.runFor(c.durationMs);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("cache", () => {
  it("Zipf CDF is monotonic and ends at 1; higher skew concentrates traffic", () => {
    const a = zipfCdf(1000, 0.8), b = zipfCdf(1000, 1.4);
    expect(a[999]).toBeCloseTo(1);
    expect(b[9]).toBeGreaterThan(a[9]);
    for (let i = 1; i < 1000; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1]);
  });

  it("never holds more than cacheSize items, under every eviction policy", () => {
    for (const eviction of ["lru", "lfu", "fifo", "random"] as const) {
      const s = sim({ eviction, cacheSize: 300 });
      s.runFor(5_000);
      expect(s.state.cache.size).toBeLessThanOrEqual(300);
      expect(s.state.keys.length).toBe(s.state.cache.size);
    }
  });

  it("a warm cache absorbs most reads; a bigger one absorbs more", () => {
    const small = sim({ cacheSize: 200 }); small.runFor(20_000);
    const big = sim({ cacheSize: 4000 }); big.runFor(20_000);
    expect(hitRate(big.state, 10)).toBeGreaterThan(0.85);
    expect(hitRate(big.state, 10)).toBeGreaterThan(hitRate(small.state, 10) + 0.1);
  });

  it("LRU beats random eviction on a skewed workload", () => {
    const go = (eviction: CacheConfig["eviction"]) => { const s = sim({ eviction, cacheSize: 500 }); s.runFor(20_000); return hitRate(s.state, 10); };
    expect(go("lru")).toBeGreaterThan(go("random"));
  });

  it("failure: a flush without coalescing stampedes the DB past capacity", () => {
    const s = sim({ ...challenges[0].setup, flushAt: 5_000 });
    s.runFor(10_000);
    expect(s.state.dbPeakAfterFlush).toBeGreaterThan(0.9);
  });

  it("failure: a dead cache node loses unflushed write-behind writes", () => {
    const s = sim({ strategy: "write-behind", readRatio: 0.7 });
    s.runFor(3_500);
    s.toggleFault("node-down");
    expect(s.state.lostWrites).toBeGreaterThan(0);
  });

  it("caching 'not found' cuts DB load from repeated missing ids", () => {
    const go = (nullCache: boolean) => { const s = sim({ bogusPct: 30, nullCache }); s.runFor(20_000); return s.state.secs.slice(-10).reduce((a, x) => a + x.db, 0); };
    expect(go(true)).toBeLessThan(go(false) * 0.8);
  });

  it("write-through keeps reads fresher than delete-on-write under a slow DB", () => {
    const go = (strategy: CacheConfig["strategy"]) => { const s = sim({ strategy, readRatio: 0.95, dbLatency: 100 }); s.runFor(15_000); return s.state.stale; };
    expect(go("write-through")).toBeLessThan(go("cache-aside"));
  });

  it("race demo: update-on-write ends stale, delete-on-write ends consistent", () => {
    expect(raceTimeline("update").at(-1)!.bad).toBe(true);
    const d = raceTimeline("delete").at(-1)!;
    expect(d.bad).toBeFalsy();
    expect(d.cache).toBe(d.db);
  });

  it("is deterministic per seed", () => {
    const a = sim({}, 7), b = sim({}, 7);
    a.runFor(5_000); b.runFor(5_000);
    expect(a.state.hits).toBe(b.state.hits);
    expect(a.state.dbQueries).toBe(b.state.dbQueries);
  });

  describe("challenges", () => {
    it("cold-start: fails as set up, passes with a rebuild lock", () => {
      expect(run("cold-start").passed).toBe(false);
      expect(run("cold-start", { mutex: true }).passed).toBe(true);
    });
    it("mass-expiry: fails as set up, passes with jitter, rejects coalescing", () => {
      expect(run("mass-expiry").passed).toBe(false);
      expect(run("mass-expiry", { jitter: true }).passed).toBe(true);
      expect(run("mass-expiry", { coalescing: true }).passed).toBe(false);
    });
    it("hit-rate: fails as set up, passes with LFU + long TTL + write-through, rejects a bigger cache", () => {
      expect(run("hit-rate").passed).toBe(false);
      expect(run("hit-rate", { eviction: "lfu", ttl: 60, strategy: "write-through" }).passed).toBe(true);
      expect(run("hit-rate", { cacheSize: 5000 }).passed).toBe(false);
    });
  });
});
