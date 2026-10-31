import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { queueModel } from "./model";

describe("single-server queue (M/M/1)", () => {
  it("mean latency matches 1/(μ−λ) within 15% at λ=50, μ=100", () => {
    const sim = new Simulation(queueModel, { lambda: 50, mu: 100 }, 7);
    sim.runFor(2_000_000); // 2000 s ≈ 100k requests
    const mean = sim.metrics.histogram("latency")!.mean;
    const expected = 1000 / (100 - 50); // 20 ms
    expect(Math.abs(mean - expected) / expected).toBeLessThan(0.15);
    expect(sim.latest.utilization).toBeGreaterThan(0.3);
    expect(sim.latest.utilization).toBeLessThan(0.7);
  });

  it("is deterministic for a seed", () => {
    const run = (seed: number) => { const s = new Simulation(queueModel, { lambda: 80, mu: 100 }, seed); s.runFor(20_000); return s.metrics.counters.get("served"); };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it("the slow-server fault makes the queue grow without bound (λ > μ/3)", () => {
    const sim = new Simulation(queueModel, { lambda: 50, mu: 100 }, 1);
    sim.runFor(5_000);
    sim.toggleFault("slow-server");
    sim.runFor(30_000);
    expect(sim.latest.queue).toBeGreaterThan(200);
    expect(sim.log.entries().some((e) => e.level === "error")).toBe(true);
    sim.toggleFault("slow-server");
    expect(sim.state.slow).toBe(1);
  });

  it("challenge: μ=150 passes, μ=95 fails, μ=400 is over budget", () => {
    const c = challenges[0];
    const run = (mu: number) => {
      const sim = new Simulation(queueModel, { lambda: 80, mu, ...c.setup }, 1);
      sim.runFor(c.durationMs);
      return c.winCondition(sim.metrics.history(), sim.state);
    };
    expect(run(150).passed).toBe(true);
    expect(run(95).passed).toBe(false);
    const big = run(400);
    expect(big.passed).toBe(false);
    expect(big.detail).toMatch(/budget/);
  });
});
