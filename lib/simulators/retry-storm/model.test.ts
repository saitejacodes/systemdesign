import { describe, expect, it } from "vitest";
import { Simulation, createRng } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { definition } from "./index";
import { BINS, backoff, retryModel, type RetryConfig } from "./model";

const base: RetryConfig = definition.defaultConfig;
const sim = (patch: Partial<RetryConfig> = {}, seed = 1) => new Simulation(retryModel, { ...base, ...patch }, seed);
const run = (id: string, patch: Partial<RetryConfig> = {}, seed = 1) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(retryModel, { ...base, ...c.setup, ...patch }, seed);
  s.runFor(c.durationMs);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("retry storm", () => {
  it("full jitter draws uniformly from [0, min(cap, base·2^attempt)]", () => {
    const rng = createRng(3);
    const c = { policy: "jitter" as const, baseMs: 100, capMs: 5000 };
    const xs = Array.from({ length: 4000 }, () => backoff(c, 3, rng));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(800);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(400, -1.5);
    expect(backoff({ ...c, policy: "backoff" }, 3, rng)).toBe(800);
    expect(backoff({ ...c, policy: "backoff" }, 9, rng)).toBe(5000);
    expect(backoff({ ...c, policy: "immediate" }, 2, rng)).toBe(0);
  });

  it("healthy below capacity: no retries, short queue, everyone served", () => {
    const s = sim({ fault: "none" });
    s.runFor(10_000);
    expect(s.state.retries).toBe(0);
    expect(s.latest.success).toBe(100);
    expect(s.latest.queue).toBeLessThan(50);
    expect(s.latest.goodput).toBeGreaterThan(850);
  });

  it("immediate retries turn a 10 s bad deploy into a metastable failure", () => {
    const s = sim();
    s.runFor(30_000);
    const st = s.state;
    expect(st.healAt).toBe(15_000);
    expect(st.recoveredAt).toBe(-1);
    expect(s.latest.amp).toBeGreaterThan(3);
    expect(s.latest.offered).toBeGreaterThan(3000);
    expect(s.latest.success).toBeLessThan(50);
    expect(st.wasted).toBeGreaterThan(10_000); // work done for clients that had already left
  });

  it("the retry budget caps retries near 10% and lets the service recover", () => {
    const s = sim({ policy: "jitter", budget: true });
    s.runFor(30_000);
    const st = s.state;
    expect(st.recoveredAt - st.healAt).toBeLessThan(2_000);
    expect(st.faultAttempts / st.faultFirst).toBeLessThan(1.1);
    expect(st.denied).toBeGreaterThan(1000);
    expect(st.wasted).toBe(0);
  });

  it("dropping expired work or a short queue breaks the loop from the server side", () => {
    for (const p of [{ dropExpired: true }, { queueLimit: 300 }]) {
      const s = sim(p);
      s.runFor(30_000);
      expect(s.state.recoveredAt).toBeGreaterThan(0);
    }
  });

  it("a restart sends synchronised retry waves; full jitter spreads them", () => {
    const peak = (policy: RetryConfig["policy"]) => {
      const s = sim({ policy, fault: "none" });
      s.runFor(5_000); s.toggleFault("brownout"); s.runFor(5_000); s.toggleFault("brownout");
      s.toggleFault("restart");
      s.runFor(300); // the first wave is narrow either way (window 0–100 ms); the later ones show the difference
      let max = 0;
      for (let i = 0; i < 34; i++) { s.runFor(50); max = Math.max(max, s.state.sent[(s.state.binIdx + BINS - 1) % BINS]); }
      return max;
    };
    expect(peak("backoff")).toBeGreaterThan(2 * peak("jitter"));
  });

  it("is deterministic for a seed", () => {
    const go = (seed: number) => { const s = sim({ policy: "jitter" }, seed); s.runFor(8_000); return [s.state.attempts, s.state.ok, s.state.timeouts].join(); };
    expect(go(4)).toBe(go(4));
    expect(go(4)).not.toBe(go(5));
  });

  it("challenge: recover-5s needs the budget; backoff and jitter alone stay down", () => {
    for (const seed of [1, 2, 3]) {
      expect(run("recover-5s", { policy: "jitter", budget: true }, seed).passed).toBe(true);
      expect(run("recover-5s", { policy: "jitter" }, seed).passed).toBe(false);
    }
    expect(run("recover-5s", { policy: "backoff" }).passed).toBe(false);
    expect(run("recover-5s", { policy: "none" }).passed).toBe(false);
  });

  it("challenge: amplification passes with a budget, fails without", () => {
    expect(run("amplification", { policy: "jitter", budget: true }).passed).toBe(true);
    expect(run("amplification", { policy: "jitter" }).passed).toBe(false);
    expect(run("amplification", { maxRetries: 1 }).passed).toBe(false);
  });

  it("challenge: shed-the-storm passes with server-side shedding only", () => {
    expect(run("shed-the-storm").passed).toBe(false);
    expect(run("shed-the-storm", { dropExpired: true }).passed).toBe(true);
    expect(run("shed-the-storm", { queueLimit: 300 }).passed).toBe(true);
    expect(run("shed-the-storm", { budget: true }).passed).toBe(false);
  });
});
