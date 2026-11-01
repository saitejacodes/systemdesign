import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { chModel, counts, lookup, spread, type ChConfig } from "./model";

const sim = (c: Partial<ChConfig> = {}) => new Simulation(chModel, { vnodes: 100, keys: 10_000, ...c }, 1);

describe("consistent hashing", () => {
  it("lookup walks clockwise and wraps past the top of the ring", () => {
    const ring = [{ pos: 10, id: 1 }, { pos: 20, id: 2 }];
    expect(lookup(ring, 5)).toBe(1);
    expect(lookup(ring, 15)).toBe(2);
    expect(lookup(ring, 20)).toBe(2);
    expect(lookup(ring, 4_000_000_000)).toBe(1);
  });

  it("adding a 5th node moves about 1/5 of keys; modulo moves about 4/5", () => {
    const s = sim();
    s.act("add");
    expect(s.state.last!.movedC).toBeGreaterThan(0.12);
    expect(s.state.last!.movedC).toBeLessThan(0.28);
    expect(s.state.last!.movedM).toBeGreaterThan(0.75);
  });

  it("every moved key moves to the new node when one is added", () => {
    const s = sim();
    s.act("add");
    const added = s.state.ids.at(-1)!;
    s.state.last!.moved.forEach((m, i) => { if (m) expect(s.state.ownerC[i]).toBe(added); });
  });

  it("more virtual nodes give a more even spread", () => {
    const few = sim({ vnodes: 1 }).state, many = sim({ vnodes: 300 }).state;
    expect(spread(counts(many, many.ownerC))).toBeLessThan(spread(counts(few, few.ownerC)));
    expect(spread(counts(many, many.ownerC))).toBeLessThan(0.1);
  });

  it("changing V in the config re-hashes on the next tick", () => {
    const s = sim({ vnodes: 1 });
    s.setConfig({ vnodes: 50 });
    s.step();
    expect(s.state.ring.length).toBe(4 * 50);
    expect(s.state.last?.kind).toBe("vnodes");
  });

  it("a node crash sends only the dead node's keys elsewhere", () => {
    const s = sim();
    const before = s.state.ownerC.slice();
    const dead = s.state.ids.at(-1)!;
    s.toggleFault("node-crash");
    before.forEach((o, i) => { if (o !== dead) expect(s.state.ownerC[i]).toBe(o); });
  });

  it("challenges: V=300 balances 5 nodes, V=1 does not; growing 4→5 passes with V=100", () => {
    const [even, grow] = challenges;
    const check = (v: number) => { const s = sim({ vnodes: v }); s.act("add"); return even.winCondition(s.metrics.history(), s.state).passed; };
    expect(check(300)).toBe(true);
    expect(check(1)).toBe(false);
    const g = sim();
    expect(grow.done!(g.state)).toBe(false);
    g.act("add");
    expect(grow.done!(g.state)).toBe(true);
    expect(grow.winCondition(g.metrics.history(), g.state).passed).toBe(true);
  });
});
