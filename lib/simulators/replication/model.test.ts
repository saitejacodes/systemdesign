import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { replModel, type ReplConfig } from "./model";

const base: ReplConfig = { followers: 3, mode: "async", delay: 50, slowFollower: 1, writeRate: 20, readRate: 100, readFrom: "follower", ryw: false, rywMs: 1000, monotonic: false, failoverMs: 2000, crashAt: 0 };
const sim = (patch: Partial<ReplConfig> = {}, seed = 1) => new Simulation(replModel, { ...base, ...patch }, seed);
const crashRun = (mode: ReplConfig["mode"]) => { const s = sim({ mode, writeRate: 100, crashAt: 5_000 }); s.runFor(10_000); return s.state; };
const run = (id: string, patch: Partial<ReplConfig> = {}) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(replModel, { ...base, ...c.setup, ...patch }, 1);
  s.runFor(c.durationMs);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("replication", () => {
  it("followers apply the leader's log, lagging by about one delay", () => {
    const s = sim();
    s.runFor(10_000);
    const st = s.state;
    expect(st.nodes[0].applied).toBeGreaterThan(150);
    for (const i of [1, 2, 3]) expect(st.nodes[0].applied - st.nodes[i].applied).toBeLessThan(10);
    expect(s.latest.maxLag).toBeLessThan(200);
  });

  it("write latency: async is local, semi-sync ≈ one round trip, sync waits for the slowest", () => {
    const p99 = (mode: ReplConfig["mode"]) => { const s = sim({ mode, slowFollower: 4 }); s.runFor(10_000); return s.latest.p99; };
    expect(p99("async")).toBeLessThan(5);
    expect(p99("semisync")).toBeGreaterThan(90);
    expect(p99("semisync")).toBeLessThan(150);
    expect(p99("sync")).toBeGreaterThan(380);
  });

  it("async + leader crash loses acknowledged writes and lists them", () => {
    const st = crashRun("async");
    expect(st.leader).not.toBe(0);
    expect(st.lostCount).toBeGreaterThan(0);
    expect(st.lost.length).toBe(Math.min(st.lostCount, 40));
    expect(st.lost.every((l) => l.seq > st.nodes[0].truncTo)).toBe(true);
  });

  it("sync and semi-sync lose nothing on failover", () => {
    for (const mode of ["sync", "semisync"] as const) {
      const st = crashRun(mode);
      expect(st.leader).not.toBe(0);
      expect(st.lostCount).toBe(0);
      expect(st.acked).toBeGreaterThan(500);
    }
  });

  it("writes fail while the leader is down, then resume on the new leader", () => {
    const s = sim({ crashAt: 2_000 });
    s.runFor(3_000);
    expect(s.state.failedWrites).toBeGreaterThan(5);
    const acked = s.state.acked;
    s.runFor(3_000);
    expect(s.state.acked).toBeGreaterThan(acked + 20);
    expect(s.log.entries().some((e) => /Failover/.test(e.message))).toBe(true);
  });

  it("a partition stalls sync writes until it heals", () => {
    const s = sim({ mode: "sync" });
    s.runFor(2_000);
    s.toggleFault("partition");
    const acked = s.state.acked;
    s.runFor(2_000);
    expect(s.state.acked).toBe(acked);
    expect(s.state.pending.length).toBeGreaterThan(20);
    s.toggleFault("partition");
    s.runFor(1_000);
    expect(s.state.pending.length).toBeLessThan(10);
    expect(s.latest.p99).toBeGreaterThan(1_000);
  });

  it("read-your-writes removes the writer's stale reads", () => {
    const off = sim(); off.runFor(20_000);
    const on = sim({ ryw: true }); on.runFor(20_000);
    expect(off.state.ownStale).toBeGreaterThan(10);
    expect(on.state.ownStale).toBe(0);
  });

  it("monotonic reads stop users going back in time", () => {
    const off = sim({ followers: 4, slowFollower: 6 }); off.runFor(20_000);
    const on = sim({ followers: 4, slowFollower: 6, monotonic: true }); on.runFor(20_000);
    expect(off.state.backwards).toBeGreaterThan(10);
    expect(on.state.backwards).toBe(0);
  });

  it("lag spike makes one follower fall behind", () => {
    const s = sim();
    s.toggleFault("lag");
    s.runFor(5_000);
    expect(s.latest.lag1).toBeGreaterThan(300);
    expect(s.latest.lag2).toBeLessThan(200);
  });

  it("is deterministic for a seed", () => {
    const go = (seed: number) => { const s = sim({ crashAt: 3_000 }, seed); s.runFor(6_000); return [s.state.acked, s.state.staleReads, s.state.lostCount].join(); };
    expect(go(5)).toBe(go(5));
    expect(go(5)).not.toBe(go(6));
  });

  it("challenge: read-your-writes passes, plain async or leader reads fail", () => {
    expect(run("read-your-writes").passed).toBe(false);
    expect(run("read-your-writes", { monotonic: true }).passed).toBe(false);
    expect(run("read-your-writes", { readFrom: "leader" }).passed).toBe(false);
    expect(run("read-your-writes", { ryw: true }).passed).toBe(true);
  });

  it("challenge: semi-sync wins; async loses writes, sync blows the p99 limit", () => {
    expect(run("no-lost-writes", { mode: "async" }).passed).toBe(false);
    const sync = run("no-lost-writes", { mode: "sync" });
    expect(sync.passed).toBe(false);
    expect(sync.detail).toMatch(/p99/);
    expect(run("no-lost-writes", { mode: "semisync" }).passed).toBe(true);
  });
});
