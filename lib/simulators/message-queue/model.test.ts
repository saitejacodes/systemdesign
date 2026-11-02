import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { mqModel, totalLag, type MqConfig } from "./model";

const base: MqConfig = { mode: "log", rate: 200, keys: 20, keyDist: "uniform", partitions: 4, consumers: 3, procMs: 8, failPct: 0, commit: "after", idempotent: false, maxAttempts: 5, visibilityMs: 1000, groups: false, backlog: 0, crashAt: 0, poisonAt: 0 };
const sim = (patch: Partial<MqConfig> = {}, seed = 1) => new Simulation(mqModel, { ...base, ...patch }, seed);
const run = (id: string, patch: Partial<MqConfig> = {}) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(mqModel, { ...base, ...c.setup, ...patch }, 1);
  for (let t = 0; t < c.durationMs && !c.done?.(s.state); t += 250) s.runFor(250);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("message queue", () => {
  it("log mode keeps up, keeps per-key order and loses nothing", () => {
    const s = sim();
    s.runFor(10_000);
    const g = s.state.groups[0];
    expect(g.processed).toBeGreaterThan(1800);
    expect(totalLag(s.state)).toBeLessThan(300); // committed-offset lag trails by up to one commit interval
    expect(g.ooo + g.dups + g.lost).toBe(0);
  });

  it("consumers beyond the partition count get no partitions", () => {
    const s = sim({ partitions: 2, consumers: 4 });
    s.runFor(3_000);
    const owners = new Set(s.state.groups[0].parts.map((p) => p.owner));
    expect(owners.size).toBe(2);
  });

  it("commit-before-process + crash loses messages; commit-after duplicates them instead", () => {
    const before = sim({ commit: "before", crashAt: 3_000 }); before.runFor(8_000);
    const after = sim({ commit: "after", crashAt: 3_000 }); after.runFor(8_000);
    expect(before.state.groups[0].lost).toBeGreaterThan(0);
    expect(after.state.groups[0].lost).toBe(0);
    expect(after.state.groups[0].dups).toBeGreaterThan(0);
    expect(after.log.entries().some((e) => /rebalancing/.test(e.message))).toBe(true);
  });

  it("idempotent consumer turns duplicates into deduped no-ops", () => {
    const s = sim({ crashAt: 3_000, idempotent: true });
    s.runFor(8_000);
    expect(s.state.groups[0].dups).toBe(0);
    expect(s.state.groups[0].deduped).toBeGreaterThan(0);
  });

  it("queue mode: parallel consumers break per-key order; log mode doesn't", () => {
    const q = sim({ mode: "queue", consumers: 4, procMs: 10 }); q.runFor(10_000);
    const l = sim({ consumers: 4, procMs: 10 }); l.runFor(10_000);
    expect(q.state.groups[0].ooo).toBeGreaterThan(0);
    expect(l.state.groups[0].ooo).toBe(0);
  });

  it("queue mode: visibility timeout shorter than a batch causes duplicate processing", () => {
    const s = sim({ mode: "queue", consumers: 2, rate: 150, procMs: 10, visibilityMs: 50 });
    s.runFor(5_000);
    expect(s.state.groups[0].dups).toBeGreaterThan(0);
  });

  it("queue mode: auto-ack + crash loses the held batch; ack-after redelivers it", () => {
    const auto = sim({ mode: "queue", commit: "before", crashAt: 2_000, procMs: 20 }); auto.runFor(5_000);
    const ack = sim({ mode: "queue", commit: "after", crashAt: 2_000, procMs: 20 }); ack.runFor(5_000);
    expect(auto.state.groups[0].lost).toBeGreaterThan(0);
    expect(ack.state.groups[0].lost).toBe(0);
  });

  it("poison: unlimited retries block the partition; a limit dead-letters it", () => {
    const stuck = sim({ maxAttempts: 0, poisonAt: 1_000 }); stuck.runFor(10_000);
    expect(totalLag(stuck.state)).toBeGreaterThan(300);
    expect(stuck.state.dlqCount).toBe(0);
    const ok = sim({ maxAttempts: 3, poisonAt: 1_000 }); ok.runFor(10_000);
    expect(ok.state.dlq.some((d) => d.poison && d.tries === 3)).toBe(true);
    const q = sim({ mode: "queue", maxAttempts: 3, poisonAt: 1_000, visibilityMs: 200 }); q.runFor(5_000);
    expect(q.state.dlq.some((d) => d.poison)).toBe(true);
  });

  it("a second group reads independently, and replay reprocesses", () => {
    const s = sim({ groups: true });
    s.runFor(5_000);
    const [a, b] = s.state.groups;
    expect(b.processed).toBeGreaterThan(500);
    expect(a.processed).toBeGreaterThan(500);
    s.act("replay", { group: 0 });
    s.runFor(3_000);
    expect(s.state.groups[0].dups).toBeGreaterThan(100);
  });

  it("adding a consumer pauses the group for a rebalance", () => {
    const s = sim();
    s.runFor(2_000);
    s.setConfig({ consumers: 4 });
    s.runFor(500);
    const p = s.state.groups[0].processed;
    s.runFor(400);
    expect(s.state.groups[0].processed).toBe(p);
    s.runFor(1_000);
    expect(s.state.groups[0].processed).toBeGreaterThan(p);
  });

  it("is deterministic for a seed", () => {
    const go = (seed: number) => { const s = sim({ crashAt: 2_000, failPct: 5 }, seed); s.runFor(5_000); const g = s.state.groups[0]; return [g.processed, g.dups, s.state.dlqCount].join(); };
    expect(go(5)).toBe(go(5));
    expect(go(5)).not.toBe(go(6));
  });

  it("challenge: zero-loss-crash", () => {
    expect(run("zero-loss-crash").passed).toBe(false);
    expect(run("zero-loss-crash", { commit: "after" }).passed).toBe(true);
  });

  it("challenge: per-key-order", () => {
    expect(run("per-key-order").passed).toBe(false);
    expect(run("per-key-order", { mode: "log" }).passed).toBe(true);
  });

  it("challenge: clear-lag", () => {
    expect(run("clear-lag").passed).toBe(false);
    expect(run("clear-lag", { consumers: 8 }).passed).toBe(true);
    expect(run("clear-lag", { consumers: 4 }).passed).toBe(true);
  });

  it("challenge: poison-dlq", () => {
    expect(run("poison-dlq").passed).toBe(false);
    expect(run("poison-dlq", { maxAttempts: 5 }).passed).toBe(true);
  });
});
