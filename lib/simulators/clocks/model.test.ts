import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { clocksModel, hb, local, pairStats, receive, relation, send, type ClocksConfig, type ClocksState, type Ev } from "./model";

const base: ClocksConfig = { auto: true, rate: 3, delay: 60, skew1: 0, skew2: 0, skew3: 0 };
const Z = [0, 0, 0];
const blank = () => clocksModel.init(base, undefined as never);
const ch = (id: string) => challenges.find((c) => c.id === id)!;
const check = (id: string, s: ClocksState) => ch(id).winCondition({}, s);
const by = (s: ClocksState, name: string) => s.events.find((e) => e.name === name)!;

/** Ground truth from the definition: process order + message edges, transitively closed. */
function reach(s: ClocksState) {
  const n = s.events.length;
  const r = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const last: Record<number, Ev> = {};
  for (const e of s.events) { if (last[e.p]) r[last[e.p].id][e.id] = true; last[e.p] = e; }
  for (const m of s.msgs) if (m.recv !== undefined) r[m.send][m.recv] = true;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (r[i][k]) for (let j = 0; j < n; j++) if (r[k][j]) r[i][j] = true;
  return r;
}

describe("clocks", () => {
  it("follows the lesson's Lamport example", () => {
    const s = blank();
    send(s, 0, 1, Z, 10);          // a1: P1 L=1
    local(s, 2, Z);                // c1: P3 L=1
    receive(s, 1, Z);              // b1: max(0,1)+1 = 2
    send(s, 1, 2, Z, 10);          // b2: 3
    local(s, 0, Z);                // a2: 2
    receive(s, 2, Z);              // c2: max(1,3)+1 = 4
    expect(["a1", "c1", "b1", "b2", "a2", "c2"].map((n) => by(s, n).L)).toEqual([1, 1, 2, 3, 2, 4]);
    expect(by(s, "c2").V).toEqual([1, 2, 2]);
    expect(relation(by(s, "a2"), by(s, "c1"))).toBe("concurrent");
    expect(relation(by(s, "a1"), by(s, "c2"))).toBe("before");
    expect(relation(by(s, "c2"), by(s, "b1"))).toBe("after");
  });

  it("vector order equals true happens-before; Lamport is consistent with it but not the converse", () => {
    let converseFails = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = new Simulation(clocksModel, base, seed);
      sim.runFor(30_000);
      const s = sim.state, r = reach(s), E = s.events;
      expect(E.length).toBeGreaterThan(20);
      for (const a of E) for (const b of E) {
        if (a.id === b.id) continue;
        expect(hb(a, b)).toBe(r[a.id][b.id]);
        if (r[a.id][b.id]) { expect(a.L).toBeLessThan(b.L); expect(a.tru).toBeLessThan(b.tru); }
        if (a.L < b.L && !r[a.id][b.id]) converseFails++;
      }
    }
    expect(converseFails).toBeGreaterThan(0);
  });

  it("with accurate clocks wall time never contradicts causality; skew makes it", () => {
    const sim = new Simulation(clocksModel, base, 7);
    sim.runFor(30_000);
    expect(pairStats(sim.state).wallInverted).toBe(0);
    const skewed = new Simulation(clocksModel, { ...base, skew1: 300, skew3: -300 }, 7);
    skewed.runFor(30_000);
    expect(pairStats(skewed.state).wallInverted).toBeGreaterThan(0);
  });

  it("the NTP-step fault sets P2's wall clock back", () => {
    const sim = new Simulation(clocksModel, { ...base, auto: false }, 1);
    sim.act("local", { p: 1 });
    sim.toggleFault("ntp-step");
    sim.act("local", { p: 1 });
    const [x, y] = sim.state.events;
    expect(hb(x, y)).toBe(true);
    expect(y.wall).toBeLessThan(x.wall);
  });

  it("receive waits for the message delay and is refused for the wrong process", () => {
    const s = blank();
    send(s, 0, 1, Z, 100);
    expect(receive(s, 2, Z, 0)).toBeUndefined();
    expect(receive(s, 1, Z)!.tru).toBe(101); // sent at true time 1
  });

  it("is deterministic per seed", () => {
    const run = () => { const x = new Simulation(clocksModel, base, 42); x.runFor(20_000); return x.state.events; };
    expect(run()).toEqual(run());
  });

  it("challenges pass for the intended setup and fail for a naive one", () => {
    const sim = new Simulation(clocksModel, { ...base, auto: false }, 1);
    sim.act("local", { p: 0 }); sim.act("local", { p: 0 }); sim.act("local", { p: 2 });
    sim.act("pick", { id: 0 }); sim.act("pick", { id: 2 });       // a1 (L1) vs c1 (L1): tie, not misleading
    expect(check("lamport-misleads", sim.state).passed).toBe(false);
    sim.act("pick", { id: 1 });                                    // c1 vs a2 (L2): concurrent, L differs
    expect(check("lamport-misleads", sim.state).passed).toBe(true);
    expect(check("wall-clock-lies", sim.state).passed).toBe(false);

    const w = (skew1: number) => {
      const x = new Simulation(clocksModel, { ...base, auto: false }, 1);
      const skews = [skew1, 0, 0];
      x.act("send", { p: 0, to: 1, skews, delay: 60 }); x.act("receive", { p: 1, skews });
      x.act("pick", { id: 0 }); x.act("pick", { id: 1 });
      return check("wall-clock-lies", x.state).passed;
    };
    expect(w(0)).toBe(false);
    expect(w(200)).toBe(true);

    const e = new Simulation(clocksModel, { ...base, auto: false }, 1);
    for (const p of [0, 1, 2]) e.act("local", { p });
    expect(check("seen-everything", e.state).passed).toBe(false);
    e.act("send", { p: 0, to: 1 }); e.act("send", { p: 2, to: 1 });
    expect(check("seen-everything", e.state).passed).toBe(false);
    e.act("receive", { p: 1 });
    expect(check("seen-everything", e.state).passed).toBe(false);
    e.act("receive", { p: 1 });
    expect(check("seen-everything", e.state).passed).toBe(true);
  });

  it("auto runs over 5 seeds always leave a misleading concurrent pair to pick", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = new Simulation(clocksModel, base, seed);
      sim.runFor(15_000);
      expect(pairStats(sim.state).misleading).toBeGreaterThan(5);
    }
  });
});
