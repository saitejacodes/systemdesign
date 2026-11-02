import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { drained, inconsistencies, outboxModel, type OutboxConfig } from "./model";

const base: OutboxConfig = { mode: "commit-publish", orderRate: 20, crashPct: 2, relayCrashPct: 5, pollMs: 500, batch: 50, dedupe: false, maxOrders: 0 };
const sim = (patch: Partial<OutboxConfig> = {}, seed = 1) => new Simulation(outboxModel, { ...base, ...patch }, seed);
const run = (id: string, patch: Partial<OutboxConfig> = {}) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(outboxModel, { ...base, ...c.setup, ...patch }, 1);
  while (s.clock.t < c.durationMs && !c.done?.(s.state)) s.step();
  return c.winCondition(s.metrics.history(), s.state);
};

describe("outbox", () => {
  it("with no failures, every order is published once and consumed", () => {
    for (const mode of ["commit-publish", "publish-commit", "outbox"] as const) {
      const s = sim({ mode, crashPct: 0, relayCrashPct: 0, maxOrders: 200 });
      s.runFor(15_000);
      const st = s.state;
      expect(st.placed).toBe(200);
      expect(drained(st)).toBe(true);
      expect(st.consumed).toBe(200);
      expect(inconsistencies(st) + st.duplicates).toBe(0);
    }
  });

  it("commit-then-publish loses events; publish-then-commit invents orders", () => {
    const a = sim({ crashPct: 10 }); a.runFor(10_000);
    expect(a.state.missing).toBeGreaterThan(5);
    expect(a.state.phantom).toBe(0);
    expect(a.state.committed - a.state.consumed - a.state.deliveries.length).toBe(a.state.missing);
    const b = sim({ mode: "publish-commit", crashPct: 10 }); b.runFor(10_000);
    expect(b.state.phantom).toBeGreaterThan(5);
    expect(b.state.missing).toBe(0);
    expect(b.state.consumed + b.state.deliveries.length - b.state.committed).toBe(b.state.phantom);
  });

  it("a broker outage loses events only for commit-then-publish; the outbox catches up", () => {
    const run2 = (mode: OutboxConfig["mode"]) => { const s = sim({ mode, crashPct: 0, relayCrashPct: 0 }); s.runFor(1_000); s.toggleFault("broker-down"); s.runFor(2_000); const held = s.state.outbox.length; s.toggleFault("broker-down"); s.runFor(3_000); return { st: s.state, held }; };
    expect(run2("commit-publish").st.missing).toBeGreaterThan(10);
    expect(inconsistencies(run2("publish-commit").st)).toBe(0);
    const o = run2("outbox");
    expect(o.held).toBeGreaterThan(20);
    expect(inconsistencies(o.st)).toBe(0);
    expect(o.st.outbox.length).toBeLessThan(20);
  });

  it("the outbox never diverges: a crash mid-transaction rolls back both rows", () => {
    const s = sim({ mode: "outbox", crashPct: 20, relayCrashPct: 0, maxOrders: 300 });
    s.runFor(20_000);
    expect(s.state.failed).toBeGreaterThan(30);
    expect(inconsistencies(s.state)).toBe(0);
    expect(s.state.consumed).toBe(s.state.committed);
  });

  it("a relay crash republishes rows; dedupe stops double processing", () => {
    const off = sim({ mode: "outbox", crashPct: 0, relayCrashPct: 0 });
    off.runFor(1_200);
    off.toggleFault("relay-crash");
    off.runFor(3_000);
    expect(off.state.relayCrashes).toBe(1);
    expect(off.state.duplicates).toBeGreaterThan(0);
    expect(off.state.doubleProcessed).toBe(off.state.duplicates);
    const on = sim({ mode: "outbox", crashPct: 0, relayCrashPct: 20, dedupe: true });
    on.runFor(20_000);
    expect(on.state.duplicates).toBeGreaterThan(0);
    expect(on.state.deduped).toBe(on.state.duplicates);
    expect(on.state.doubleProcessed).toBe(0);
  });

  it("publish delay follows the poll interval", () => {
    const p99 = (pollMs: number) => { const s = sim({ mode: "outbox", crashPct: 0, relayCrashPct: 0, pollMs }); s.runFor(10_000); return s.latest.p99; };
    expect(p99(1000)).toBeGreaterThan(900);
    expect(p99(100)).toBeLessThan(170);
  });

  it("is deterministic per seed", () => {
    const a = sim({ mode: "outbox", crashPct: 5, relayCrashPct: 10, dedupe: true }, 7); a.runFor(8_000);
    const b = sim({ mode: "outbox", crashPct: 5, relayCrashPct: 10, dedupe: true }, 7); b.runFor(8_000);
    expect(b.latest).toEqual(a.latest);
    expect(b.state.consumed).toBe(a.state.consumed);
  });

  it("challenges pass with a good setup and fail with a bad one", () => {
    expect(run("see-dual-write").passed).toBe(true);
    expect(run("see-dual-write", { mode: "outbox" }).passed).toBe(false);
    expect(run("duplicates-harmless", { dedupe: true }).passed).toBe(true);
    expect(run("duplicates-harmless").passed).toBe(false);
    expect(run("thousand-orders", { mode: "outbox", dedupe: true }).passed).toBe(true);
    expect(run("thousand-orders", { mode: "commit-publish", dedupe: true }).passed).toBe(false);
    expect(run("thousand-orders", { mode: "outbox" }).passed).toBe(false);
    expect(run("fast-relay", { pollMs: 100, batch: 100 }).passed).toBe(true);
    expect(run("fast-relay").passed).toBe(false);
    expect(run("fast-relay", { pollMs: 50, batch: 100 }).passed).toBe(false);
  });
});
