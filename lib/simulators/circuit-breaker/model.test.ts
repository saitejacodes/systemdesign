import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { definition } from "./index";
import { cbModel, type CbConfig } from "./model";

const base: CbConfig = { ...definition.defaultConfig, bFault: "none" };
const sim = (patch: Partial<CbConfig> = {}, seed = 1) => new Simulation(cbModel, { ...base, ...patch }, seed);
const run = (id: string, patch: Partial<CbConfig> = {}, seed = 1) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(cbModel, { ...definition.defaultConfig, ...c.setup, ...patch }, seed);
  s.runFor(c.durationMs);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("circuit breaker", () => {
  it("stays closed on a healthy B; p99 near B's own latency", () => {
    const s = sim();
    s.runFor(10_000);
    expect(s.state.st).toBe("closed");
    expect(s.state.openCount).toBe(0);
    expect(s.latest.p99).toBeLessThan(80);
    expect(s.latest.toB).toBeGreaterThan(250);
  });

  it("opens once the window holds min calls at ≥ threshold, then rejects without calling B", () => {
    const s = sim({ timeoutMs: 100 });
    s.runFor(2_000);
    s.toggleFault("errors");
    s.runFor(300);
    expect(s.state.st).toBe("open");
    const toB = s.state.toB;
    s.runFor(1_000);
    expect(s.state.toB).toBe(toB);
    expect(s.state.rejected).toBeGreaterThan(200);
    expect(s.latest.fallbackPct).toBeGreaterThan(90);
  });

  it("never decides below the minimum number of calls", () => {
    const s = sim({ rate: 5, minCalls: 50, windowSize: 100 });
    s.toggleFault("errors");
    s.runFor(5_000); // ~25 calls, all failing
    expect(s.state.openCount).toBe(0);
    s.runFor(6_000);
    expect(s.state.openCount).toBe(1);
  });

  it("half-open lets exactly the permitted calls through, then reopens on failure or closes on success", () => {
    const s = sim({ timeoutMs: 100, waitMs: 1000, probes: 5 });
    s.toggleFault("errors");
    s.runFor(500);
    expect(s.state.st).toBe("open");
    const toB = s.state.toB;
    s.runFor(1_200); // the wait ends; 5 trials fail; open again
    expect(s.state.toB - toB).toBe(5);
    expect(s.state.openCount).toBe(2);
    s.toggleFault("errors");
    s.runFor(1_500);
    expect(s.state.st).toBe("closed");
  });

  it("a breaker reacts no faster than the timeout when B hangs", () => {
    const s = sim({ timeoutMs: 1000 });
    s.runFor(1_000);
    s.toggleFault("hang");
    s.runFor(900);
    expect(s.state.st).toBe("closed");
    s.runFor(600);
    expect(s.state.st).toBe("open");
  });

  it("time-based window counts calls in the last N seconds", () => {
    const s = sim({ windowType: "time", windowSize: 2, minCalls: 20, timeoutMs: 100 });
    s.runFor(3_000);
    s.toggleFault("errors");
    s.runFor(1_500);
    expect(s.state.st).toBe("open");
  });

  it("without a breaker, full traffic keeps knocking a cold B over (failure scenario)", () => {
    const s = sim({ breaker: false, timeoutMs: 80, bFault: "hang" });
    s.runFor(40_000);
    expect(s.state.reCrashes).toBeGreaterThan(3);
    expect(s.state.bUpAt).toBeGreaterThan(0); // still cold
  });

  it("is deterministic for a seed", () => {
    const go = (seed: number) => { const s = sim({ bFault: "hang", timeoutMs: 200 }, seed); s.runFor(20_000); return [s.state.toB, s.state.openCount, s.state.okCalls].join(); };
    expect(go(7)).toBe(go(7));
    expect(go(7)).not.toBe(go(8));
  });

  it("challenge: protect-b needs a short timeout and the breaker", () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(run("protect-b", { timeoutMs: 80 }, seed).passed).toBe(true);
    expect(run("protect-b").passed).toBe(false); // 1 s timeout: p99 blows up, and B is hammered
    expect(run("protect-b", { waitMs: 15_000 }).passed).toBe(false); // gentle on B, but slow to fail
    const off = run("protect-b", { timeoutMs: 80, breaker: false });
    expect(off.passed).toBe(false);
    expect(off.detail).toMatch(/breaker was switched off/);
  });

  it("challenge: no-false-trips needs a window sized for the traffic", () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(run("no-false-trips", { windowSize: 30, minCalls: 20 }, seed).passed).toBe(true);
    expect(run("no-false-trips").passed).toBe(false); // 100 calls = 5 s of history: too slow
    expect(run("no-false-trips", { windowSize: 10, minCalls: 5 }).passed).toBe(false); // trips on noise
  });
});
