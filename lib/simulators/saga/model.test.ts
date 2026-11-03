import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { sagaModel, type SagaConfig } from "./model";

const base: SagaConfig = { mode: "orchestration", orderRate: 20, failPct: 0, lossPct: 0, compensate: true, retry: false, idempotent: false, hopMs: 20, maxOrders: 0 };
const sim = (patch: Partial<SagaConfig> = {}, seed = 1) => new Simulation(sagaModel, { ...base, ...patch }, seed);
const run = (id: string, patch: Partial<SagaConfig> = {}, crashAt = -1, seed = 1) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(sagaModel, { ...base, ...c.setup, ...patch }, seed);
  while (s.clock.t < c.durationMs && !c.done?.(s.state)) { if (s.clock.t === crashAt) s.toggleFault("coordinator-crash"); s.step(); }
  return c.winCondition(s.metrics.history(), s.state);
};
const settled = (st: { completed: number; compensated: number; failed: number; stuck: number }) => st.completed + st.compensated + st.failed + st.stuck;

describe("saga", () => {
  it("with no failures every order completes in all three modes, with one charge, reservation and shipment each", () => {
    for (const mode of ["orchestration", "choreography", "2pc"] as const) {
      const s = sim({ mode, maxOrders: 100 });
      s.runFor(15_000);
      const st = s.state;
      expect(st.completed).toBe(100);
      expect(st.open).toBe(0);
      expect(st.inconsistent).toBe(0);
      if (mode !== "2pc") expect(st.agg).toMatchObject({ confirmed: 100, charged: 100, reserved: 100, shipped: 100, pending: 0 });
      else expect(st.locks).toBe(0);
    }
  });

  it("compensates in reverse order: release stock, refund, cancel", () => {
    for (const mode of ["orchestration", "choreography"] as const) {
      const s = sim({ mode, orderRate: 2 });
      s.act("failNext", { step: 3 });
      s.runFor(5_000);
      const lines = s.state.trace!.lines.map((l) => l.text);
      const at = (p: string) => lines.findIndex((l) => l.startsWith(p) && l.endsWith("done"));
      expect(lines.some((l) => l.includes("T4 schedule shipment: FAILED"))).toBe(true);
      expect(at("C3")).toBeGreaterThan(-1);
      expect(at("C3")).toBeLessThan(at("C2"));
      expect(at("C2")).toBeLessThan(at("C1"));
      expect(s.state.compensated).toBeGreaterThanOrEqual(1);
      expect(s.state.inconsistent).toBe(0);
      expect(s.state.agg.charged).toBe(s.state.agg.confirmed + s.state.live.filter((g) => !g.settled && g.charged > 0).length);
    }
  });

  it("without compensations a failed order keeps the money and the stock", () => {
    const s = sim({ failPct: 30, compensate: false, maxOrders: 100 });
    s.runFor(15_000);
    expect(s.state.failed).toBeGreaterThan(10);
    expect(s.state.kinds.paidNoOrder).toBeGreaterThan(5);
    expect(s.state.kinds.stockLeak).toBeGreaterThan(0);
  });

  it("lost messages: no retry gets stuck, retry without idempotency duplicates, both together are clean", () => {
    for (const mode of ["orchestration", "choreography"] as const) {
      const p = { mode, failPct: 10, lossPct: 10, maxOrders: 200 };
      const a = sim(p); a.runFor(30_000);
      expect(a.state.stuck).toBeGreaterThan(10);
      expect(a.state.retries).toBe(0);
      const b = sim({ ...p, retry: true }); b.runFor(30_000);
      expect(b.state.stuck).toBe(0);
      expect(b.state.dupApplied).toBeGreaterThan(5);
      expect(b.state.kinds.duplicate).toBeGreaterThan(5);
      const c = sim({ ...p, retry: true, idempotent: true }); c.runFor(30_000);
      expect(settled(c.state)).toBe(200);
      expect(c.state.deduped).toBeGreaterThan(5);
      expect(c.state.inconsistent + c.state.stuck + c.state.dupApplied).toBe(0);
      expect(c.state.compensated).toBeGreaterThan(5);
    }
  });

  it("a payment outage strands sagas without retries; with retries they resume when it returns", () => {
    const go = (retry: boolean) => { const s = sim({ retry, idempotent: true }); s.runFor(1_000); s.toggleFault("payment-down"); s.runFor(2_000); s.toggleFault("payment-down"); s.runFor(6_000); return s.state; };
    const no = go(false);
    expect(no.stuck).toBeGreaterThan(20);
    const yes = go(true);
    expect(yes.stuck).toBe(0);
    expect(yes.inconsistent).toBe(0);
    expect(yes.retries).toBeGreaterThan(20);
  });

  it("2PC holds the stock row for ~3 fsyncs + a round trip, capping throughput near 125/s at 1 ms hops", () => {
    const ok = sim({ mode: "2pc", hopMs: 1, orderRate: 100 }); ok.runFor(10_000);
    expect(ok.latest.lockP99).toBeGreaterThan(7);
    expect(ok.latest.lockP99).toBeLessThan(15);
    expect(ok.state.hot.queue.length).toBeLessThan(20);
    const over = sim({ mode: "2pc", hopMs: 1, orderRate: 150 }); over.runFor(10_000);
    expect(over.state.hot.queue.length).toBeGreaterThan(150);
    const saga = sim({ hopMs: 1, orderRate: 150 }); saga.runFor(10_000);
    expect(saga.latest.lockP99).toBe(2);
  });

  it("a NO vote aborts the 2PC transaction everywhere", () => {
    const s = sim({ mode: "2pc", failPct: 30, maxOrders: 100 });
    s.runFor(10_000);
    expect(s.state.compensated).toBeGreaterThan(15);
    expect(s.state.completed + s.state.compensated).toBe(100);
    expect(s.state.locks).toBe(0);
  });

  it("2PC coordinator crash after PREPARE blocks with locks held until it recovers and aborts", () => {
    const s = sim({ mode: "2pc", hopMs: 5 });
    s.runFor(1_000);
    s.toggleFault("coordinator-crash");
    s.runFor(4_000);
    const st = s.state;
    expect(st.doubt).toHaveLength(1);
    expect(st.doubt[0].lockAt.every((a) => a >= 0)).toBe(true);
    expect(s.latest.doubtMs).toBeGreaterThan(3_000);
    expect(st.hot.queue.length).toBeGreaterThan(40);
    const done = st.completed;
    s.runFor(1_000);
    expect(s.state.completed).toBe(done); // nothing gets past the locked stock row
    s.toggleFault("coordinator-crash");
    s.runFor(10_000);
    expect(s.state.doubt).toHaveLength(0);
    expect(s.state.hot.queue.length).toBeLessThan(5);
    expect(s.state.completed).toBeGreaterThan(done + 50);
    expect(s.state.trace!.lines.some((l) => l.text.includes("ABORT"))).toBe(true);
  });

  it("is deterministic per seed", () => {
    const p = { mode: "choreography" as const, failPct: 10, lossPct: 5, retry: true };
    const a = sim(p, 7); a.runFor(8_000);
    const b = sim(p, 7); b.runFor(8_000);
    expect(b.latest).toEqual(a.latest);
    expect(b.state.kinds).toEqual(a.state.kinds);
  });

  it("challenges pass with a good setup and fail with a bad one", () => {
    expect(run("hundred-orders", { retry: true, idempotent: true }).passed).toBe(true);
    expect(run("hundred-orders", { mode: "choreography", retry: true, idempotent: true }).passed).toBe(true);
    expect(run("hundred-orders").passed).toBe(false);
    expect(run("hundred-orders", { retry: true }).passed).toBe(false);
    expect(run("hundred-orders", { retry: true, idempotent: true, compensate: false }).passed).toBe(false);
    expect(run("hundred-orders", { mode: "2pc" }).passed).toBe(false);
    expect(run("two-pc-blocking", {}, 1_000).passed).toBe(true);
    expect(run("two-pc-blocking").passed).toBe(false);
    expect(run("hot-row", { mode: "orchestration" }).passed).toBe(true);
    expect(run("hot-row", { mode: "choreography" }).passed).toBe(true);
    expect(run("hot-row").passed).toBe(false);
    expect(run("hot-row", { mode: "orchestration", orderRate: 100 }).passed).toBe(false);
  });
});
