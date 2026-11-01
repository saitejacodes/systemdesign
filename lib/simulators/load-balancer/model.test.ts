import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { lbModel, type LbConfig } from "./model";

const base: LbConfig = { servers: 4, algorithm: "rr", rps: 400, capacity: 250, latency: 50, hetero: false, checkMs: 2000, threshold: 3, killAt: 0, spikeAt: 0 };
const run = (id: string, patch: Partial<LbConfig> = {}) => {
  const c = challenges.find((x) => x.id === id)!;
  const sim = new Simulation(lbModel, { ...base, ...patch, ...c.setup }, 1);
  sim.runFor(c.durationMs);
  return c.winCondition(sim.metrics.history(), sim.state);
};

describe("load balancer", () => {
  it("round robin splits traffic evenly", () => {
    const sim = new Simulation(lbModel, base, 2);
    sim.runFor(20_000);
    const served = sim.state.servers.slice(0, 4).map((s) => s.served);
    const mean = served.reduce((a, b) => a + b) / 4;
    for (const s of served) expect(Math.abs(s - mean) / mean).toBeLessThan(0.02);
  });

  it("weighted round robin follows capacity", () => {
    const sim = new Simulation(lbModel, { ...base, algorithm: "wrr", hetero: true, capacity: 200 }, 2);
    sim.runFor(20_000);
    const [a, b] = sim.state.servers;
    expect(a.served / b.served).toBeCloseTo(2, 1);
  });

  it("health checks mark a dead server down after interval × threshold", () => {
    const sim = new Simulation(lbModel, { ...base, checkMs: 500, threshold: 2 }, 3);
    sim.runFor(1_000);
    sim.toggleFault("kill");
    sim.runFor(900);
    expect(sim.state.servers[0].up).toBe(true);
    sim.runFor(1_200);
    expect(sim.state.servers[0].up).toBe(false);
    expect(sim.log.entries().some((e) => /marked DOWN/.test(e.message))).toBe(true);
  });

  it("a slow server keeps passing health checks", () => {
    const sim = new Simulation(lbModel, base, 4);
    sim.toggleFault("slow");
    sim.runFor(10_000);
    expect(sim.state.servers[1].up).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const go = (seed: number) => { const s = new Simulation(lbModel, base, seed); s.runFor(5_000); return s.state.arrivals; };
    expect(go(5)).toBe(go(5));
    expect(go(5)).not.toBe(go(6));
  });

  it("challenge: slow health checks fail the kill test, fast ones pass", () => {
    expect(run("survive-kill").passed).toBe(false);
    expect(run("survive-kill", { checkMs: 250, threshold: 2 }).passed).toBe(true);
  });

  it("challenge: capacity-aware algorithms win on mixed servers", () => {
    expect(run("heterogeneous", { algorithm: "wrr" }).passed).toBe(true);
    expect(run("heterogeneous", { algorithm: "least" }).passed).toBe(true);
    expect(run("heterogeneous", { algorithm: "rr" }).passed).toBe(false);
    expect(run("heterogeneous", { algorithm: "random" }).passed).toBe(false);
  });

  it("challenge: 4 servers buckle under the spike, 5 ride it out", () => {
    expect(run("spike-p99", { servers: 4 }).passed).toBe(false);
    expect(run("spike-p99", { servers: 5 }).passed).toBe(true);
  });
});
