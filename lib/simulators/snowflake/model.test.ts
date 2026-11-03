import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { compose, genMs, layoutOf, lifetimeYears, maxMachines, perMs, snowModel, stepBack, type Policy, type SnowConfig } from "./model";

const base: SnowConfig = { tsBits: 41, dcBits: 5, workerBits: 5, machines: 4, rateK: 500, policy: "trust", stepBackMs: 0 };
const sim = (patch: Partial<SnowConfig> = {}, seed = 1) => new Simulation(snowModel, { ...base, ...patch }, seed);
const blank = (patch: Partial<SnowConfig> = {}) => { const s = snowModel.init({ ...base, ...patch }, { int: () => 0 } as never); return s; };
const run = (id: string, patch: Partial<SnowConfig> = {}, seed = 1) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(snowModel, { ...base, ...c.setup, ...patch }, seed);
  s.runFor(c.durationMs);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("snowflake", () => {
  it("Twitter's layout: 69.7 years, 1,024 machines, 4,096 per ms", () => {
    const l = layoutOf(base);
    expect(l.seq).toBe(12);
    expect(lifetimeYears(l)).toBeCloseTo(69.68, 1);
    expect(maxMachines(l)).toBe(1024);
    expect(perMs(l)).toBe(4096);
    expect(lifetimeYears(layoutOf({ tsBits: 40, dcBits: 0, workerBits: 0 }))).toBeCloseTo(34.8, 1);
    expect(compose(l, 1, 3, 2)).toBe(BigInt(2 ** 22 + 3 * 2 ** 12 + 2));
    expect(compose(l, 2 ** 41 - 1, 1023, 4095).toString(2)).toBe("1".repeat(63)); // the sign bit stays 0
  });

  it("sequence overflow waits for the next millisecond and stays unique", () => {
    const s = blank({ tsBits: 41, dcBits: 5, workerBits: 13 }); // 4 sequence bits: 16 per ms
    genMs(s, 0, 10, 40, "trust");
    expect(s.served).toBe(16);
    expect(s.gens[0].backlog).toBe(24);
    genMs(s, 0, 11, 0, "trust");
    genMs(s, 0, 12, 0, "trust");
    expect(s.served).toBe(40);
    expect(s.gens[0].backlog).toBe(0);
    expect(s.dups).toBe(0);
    expect(s.waitMs).toBe(24 + 8); // 24 waited one ms, 8 of them a second
  });

  it("the naive generator re-issues IDs after the clock goes back (the lesson's table)", () => {
    const s = blank();
    genMs(s, 0, 1000, 2, "trust");   // (1000, 0..1)
    stepBack(s, 0, 2);
    genMs(s, 0, 1001, 1, "trust");   // clock reads 999: (999, 0), out of order but unique
    expect(s.dups).toBe(0);
    expect(s.gens[0].outOfOrder).toBe(1);
    genMs(s, 0, 1002, 1, "trust");   // clock reads 1000 again: (1000, 0) duplicates A
    expect(s.dups).toBe(1);
  });

  it.each(["refuse", "wait", "borrow"] as Policy[])("%s never duplicates and stays monotonic per machine", (policy) => {
    const s = sim({ policy, stepBackMs: 20 });
    s.toggleFault("vm-pause");
    s.runFor(10_000);
    expect(s.state.dups).toBe(0);
    expect(s.state.gens.reduce((a, g) => a + g.outOfOrder, 0)).toBe(0);
    expect(s.state.served).toBeGreaterThan(15_000_000);
    if (policy === "borrow") expect(s.state.rejected).toBe(0);
    else expect(s.state.rejected).toBeGreaterThan(0);
  });

  it("refuse rejects exactly while the clock is behind; trust duplicates instead", () => {
    const r = blank();
    genMs(r, 0, 1000, 5, "refuse");
    stepBack(r, 0, 3);
    for (const t of [1001, 1002, 1003]) genMs(r, 0, t, 7, "refuse"); // clock reads 998, 999 (refused), then 1000 = last (served)
    expect(r.rejected).toBe(14);
    expect(r.dups).toBe(0);
    const t = sim({ stepBackMs: 20 });
    t.runFor(4_000);
    expect(t.state.dups).toBeGreaterThan(1000);
  });

  it("too few machine bits make generators share an ID and collide", () => {
    const s = sim({ dcBits: 0, workerBits: 1, machines: 4 });
    s.runFor(2_000);
    expect(s.state.dups).toBeGreaterThan(0);
    const ok = sim({ dcBits: 0, workerBits: 2, machines: 4 });
    ok.runFor(2_000);
    expect(ok.state.dups).toBe(0);
  });

  it("is deterministic per seed", () => {
    const go = () => { const s = sim({ stepBackMs: 20 }, 9); s.runFor(4_000); return [s.state.served, s.state.dups, s.state.recent]; };
    expect(go()).toEqual(go());
  });

  it("challenges: the intended fix passes, the naive setup fails, over 5 seeds", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(run("fleet-layout", {}, seed).passed).toBe(false);
      expect(run("fleet-layout", { tsBits: 41, dcBits: 5, workerBits: 5 }, seed).passed).toBe(true);
      expect(run("fleet-layout", { tsBits: 41, dcBits: 0, workerBits: 9 }, seed).passed).toBe(false); // 512 machines
      expect(run("clock-step", {}, seed).passed).toBe(false);
      for (const policy of ["refuse", "wait", "borrow"] as Policy[]) expect(run("clock-step", { policy }, seed).passed).toBe(true);
      expect(run("burst", {}, seed).passed).toBe(false);
      expect(run("burst", { policy: "borrow" }, seed).passed).toBe(false); // no waiting, but IDs run far ahead
      expect(run("burst", { tsBits: 40, workerBits: 4 }, seed).passed).toBe(false); // 34.8 years
      expect(run("burst", { workerBits: 4 }, seed).passed).toBe(true);
    }
  });
});
