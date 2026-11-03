import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { effective, quorumModel, type Op, type QuorumConfig } from "./model";

const base: QuorumConfig = { preset: "custom", n: 3, r: 2, w: 2, opsRate: 100, readPct: 50, latency: 1, crashAt: 0 };
const sim = (patch: Partial<QuorumConfig> = {}, seed = 1) => new Simulation(quorumModel, { ...base, ...patch }, seed);
const run = (id: string, patch: Partial<QuorumConfig>, seed = 1) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(quorumModel, { ...base, ...c.setup, ...patch }, seed);
  s.runFor(c.durationMs);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("quorum", () => {
  it("R + W > N: no read ever returns less than an acknowledged version, even as replicas crash and restart", () => {
    for (const [n, r, w] of [[1, 1, 1], [3, 2, 2], [3, 1, 3], [3, 3, 1], [5, 3, 3], [5, 2, 4], [7, 4, 4]]) {
      const s = sim({ n, r, w, opsRate: 300 }, n * 10 + r);
      for (let k = 0; k < 20; k++) {
        s.runFor(500);
        if (n > 1) s.act("toggle", k % n); // each replica alternates down/up, so restarted ones carry old versions
      }
      expect(s.state.totalReads).toBeGreaterThan(1000);
      expect(s.state.totalStale).toBe(0);
    }
  });

  it("R + W ≤ N returns stale reads (and the guard records it)", () => {
    const s = sim({ r: 1, w: 1 });
    s.runFor(30_000);
    expect(s.state.totalStale).toBeGreaterThan(10);
    expect(s.state.weakMs).toBeGreaterThan(29_000);
    expect(s.latest.staleProb).toBeGreaterThan(0);
  });

  it("a stale read really is older than an acknowledged write", () => {
    const s = sim({ r: 1, w: 1, opsRate: 300 });
    let seen: Op | null = null;
    for (let k = 0; k < 3000 && !seen; k++) { s.step(); if (s.state.lastRead?.status === "stale") seen = s.state.lastRead; }
    expect(seen).not.toBeNull();
    expect(seen!.ver).toBeLessThan(seen!.floor);
    expect(seen!.replies[0].ver).toBe(seen!.ver);
  });

  it("availability: reads survive N − R failures, writes N − W", () => {
    const s = sim({ n: 5, r: 3, w: 3 });
    s.act("toggle", 0); s.act("toggle", 1);
    s.runFor(5_000);
    expect(s.state.totalReadFails + s.state.totalWriteFails).toBe(0);
    s.act("toggle", 2);
    s.runFor(5_000);
    expect(s.latest.readAvail).toBe(0);
    expect(s.latest.writeAvail).toBe(0);
    expect(s.state.lastRead?.status).toBe("unavailable");
    const t = sim({ n: 3, r: 1, w: 3 });
    t.act("toggle", 2);
    t.runFor(5_000);
    expect(t.state.totalReadFails).toBe(0);
    expect(t.state.totalWriteFails).toBeGreaterThan(100);
  });

  it("latency is the R-th / W-th fastest reply", () => {
    const s = sim({ n: 5, r: 2, w: 4, opsRate: 200 });
    let checked = 0;
    for (let k = 0; k < 2000; k++) {
      s.step();
      for (const op of [s.state.lastRead, s.state.lastWrite]) {
        if (!op || (op.status !== "ok" && op.status !== "stale")) continue;
        const sorted = op.replies.map((p) => p.at).sort((a, b) => a - b);
        expect(op.doneAt - op.start).toBeCloseTo(sorted[op.need - 1], 9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    const p99 = (r: number) => { const x = sim({ n: 5, r, w: 1, readPct: 100 }); x.runFor(10_000); return x.latest.readP99; };
    expect(p99(1)).toBeLessThan(1);
    expect(p99(3)).toBeGreaterThan(p99(2));
    expect(p99(5)).toBeGreaterThan(p99(3));
  });

  it("a slow replica only hurts quorums that must wait for it", () => {
    // Median: when N2 itself coordinates (1 in 3 requests) every link is slow, so p99 suffers either way.
    const p50 = (w: number, slow: boolean) => { const x = sim({ n: 3, r: 1, w, readPct: 0 }); if (slow) x.toggleFault("slow"); x.runFor(10_000); return x.latest.writeP50; };
    expect(p50(3, true)).toBeGreaterThan(3 * p50(3, false));
    expect(p50(2, true)).toBeLessThan(p50(3, true) / 2);
  });

  it("presets override the sliders; sliders clamp to N", () => {
    expect(effective({ preset: "5-3-3", n: 1, r: 1, w: 1 })).toEqual({ n: 5, r: 3, w: 3 });
    expect(effective({ preset: "3-1-3", n: 7, r: 7, w: 7 })).toEqual({ n: 3, r: 1, w: 3 });
    expect(effective({ preset: "custom", n: 3, r: 7, w: 5 })).toEqual({ n: 3, r: 3, w: 3 });
  });

  it("a joining replica streams existing data, so growing N keeps the overlap", () => {
    const s = sim({ n: 3, r: 2, w: 2 });
    s.runFor(5_000);
    s.setConfig({ n: 5, r: 3, w: 3 });
    s.runFor(5_000);
    expect(s.state.totalStale).toBe(0);
  });

  it("is deterministic per seed", () => {
    const a = sim({}, 7), b = sim({}, 7);
    a.runFor(5_000); b.runFor(5_000);
    expect(a.latest).toEqual(b.latest);
  });

  it("strong-and-tolerant: only R = 2, W = 2 passes", () => {
    for (let seed = 1; seed <= 5; seed++) expect(run("strong-and-tolerant", { r: 2, w: 2 }, seed).passed).toBe(true);
    for (const [r, w] of [[1, 1], [2, 1], [1, 3], [3, 1], [2, 3], [3, 3]]) expect(run("strong-and-tolerant", { r, w }).passed).toBe(false);
  });

  it("fast-consistent-reads: R = 2, W = 4 passes; slower or unsafe settings fail", () => {
    for (let seed = 1; seed <= 5; seed++) expect(run("fast-consistent-reads", { r: 2, w: 4 }, seed).passed).toBe(true);
    for (const [r, w] of [[3, 3], [4, 2], [1, 5], [2, 3], [1, 1]]) for (let seed = 1; seed <= 5; seed++) expect(run("fast-consistent-reads", { r, w }, seed).passed).toBe(false);
  });
});
