import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { rlModel, type RlConfig } from "./model";

const base: RlConfig = { pattern: "steady", traffic: 8, rate: 5, burst: 10, window: 1, distributed: false };
const sim = (c: Partial<RlConfig> = {}, ms = 30_000) => { const s = new Simulation(rlModel, { ...base, ...c }, 1); s.runFor(ms); return s; };
const check = (id: string, c: Partial<RlConfig>) => {
  const ch = challenges.find((x) => x.id === id)!;
  const s = sim({ ...c, ...ch.setup }, ch.durationMs);
  return ch.winCondition(s.metrics.history(), s.state);
};

describe("rate limiter", () => {
  it("every algorithm holds the long-run rate near R under overload", () => {
    const s = sim({ traffic: 20 }, 60_000);
    for (const id of ["tb", "lb", "fw", "sl", "sc"] as const) {
      const perSec = s.state.lanes[id].allowed / 60;
      expect(perSec, id).toBeGreaterThan(4);
      expect(perSec, id).toBeLessThan(5.6);
    }
  });

  it("the boundary attack doubles fixed window throughput but not the sliding log", () => {
    const s = sim({ pattern: "boundary" });
    expect(s.state.lanes.fw.maxInWindow).toBeGreaterThanOrEqual(10);
    expect(s.state.lanes.sl.maxInWindow).toBeLessThanOrEqual(5);
    expect(s.state.lanes.sc.maxInWindow).toBeLessThan(s.state.lanes.fw.maxInWindow);
    expect(s.log.entries().some((e) => e.level === "warn")).toBe(true);
  });

  it("leaky bucket smooths a burst to R/s", () => {
    const s = sim({ pattern: "bursty", burst: 20 }, 20_000);
    expect(s.state.lanes.lb.maxIn1s).toBeLessThanOrEqual(6);
    expect(s.state.lanes.tb.maxIn1s).toBeGreaterThanOrEqual(20);
  });

  it("local limiters on 3 nodes over-admit compared with one shared bucket", () => {
    const s = sim({ traffic: 30 }, 30_000);
    expect(s.state.localAllowed).toBeGreaterThan(2.5 * s.state.lanes.tb.allowed);
  });

  it("the flood fault raises offered load but not admitted load", () => {
    const calm = sim({}, 20_000);
    const s = new Simulation(rlModel, base, 1);
    s.toggleFault("flood");
    s.runFor(20_000);
    expect(s.state.offered).toBeGreaterThan(5 * calm.state.offered);
    expect(s.state.lanes.tb.allowed).toBeLessThan(calm.state.lanes.tb.allowed * 1.2);
  });

  it("is deterministic for a seed", () => {
    expect(sim({}, 5_000).state.offered).toBe(sim({}, 5_000).state.offered);
  });

  it("challenges: boundary pattern breaks the window; B=20 R=5 passes, B=10 or R=6 fails", () => {
    expect(check("boundary-attack", { pattern: "boundary" }).passed).toBe(true);
    expect(check("boundary-attack", { pattern: "steady" }).passed).toBe(false);
    expect(check("token-burst", { burst: 20, rate: 5 }).passed).toBe(true);
    expect(check("token-burst", { burst: 10, rate: 5 }).passed).toBe(false);
    expect(check("token-burst", { burst: 20, rate: 6 }).passed).toBe(false);
  });
});
