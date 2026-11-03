import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { capModel, divergent, KEYS, type CapConfig } from "./model";

const base: CapConfig = { nodes: 3, mode: "cp", resolve: "lww", delay: 40, rate: 5, readPct: 50 };
const sim = (patch: Partial<CapConfig> = {}, seed = 1) => new Simulation(capModel, { ...base, ...patch }, seed);
/** Runs a challenge's setup with a scripted user: `play` acts on the sim, then the run is judged. */
function judge(id: string, play: (s: Simulation<CapConfig, ReturnType<typeof capModel.init>>) => void, patch: Partial<CapConfig> = {}, seed = 1) {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(capModel, { ...base, ...c.setup, ...patch }, seed);
  play(s);
  return { out: c.winCondition(s.metrics.history(), s.state), done: c.done?.(s.state) ?? false };
}
const isolate3 = (s: Simulation<CapConfig, ReturnType<typeof capModel.init>>) => { s.act("toggleLink", { a: 0, b: 2 }); s.act("toggleLink", { a: 1, b: 2 }); };

describe("cap", () => {
  it("CP with every link up: no stale reads, no rejections, writes pay a majority round trip", () => {
    const s = sim();
    s.runFor(10_000);
    expect(s.state.rejected).toBe(0);
    expect(s.state.stale).toBe(0);
    expect(s.state.acked).toBeGreaterThan(50);
    expect(s.latest.wP50).toBeGreaterThan(65);
    expect(s.latest.wP50).toBeLessThan(100);
  });

  it("AP with every link up answers in ~1 ms but can read stale while replication is in flight (PACELC else)", () => {
    const s = sim({ mode: "ap", rate: 15 });
    s.runFor(20_000);
    expect(s.latest.wP99).toBeLessThanOrEqual(1);
    expect(s.state.stale).toBeGreaterThan(0);
    expect(s.state.stalePart).toBe(0);
    expect(s.state.rejected).toBe(0); // conflicts can still happen: two nodes writing one cart within the replication delay
  });

  it("CP partition: the minority refuses, the majority commits, nobody reads stale", () => {
    const s = sim();
    s.runFor(1_000);
    s.act("split");
    s.runFor(10_000);
    expect(s.state.rejected).toBeGreaterThan(20);
    expect(s.state.cutCommits).toBeGreaterThan(10);
    expect(s.state.stale).toBe(0);
    expect(s.state.notes.slice(0, 3).some((n) => n?.text.startsWith("REJECTED"))).toBe(true);
  });

  it("cutting every link leaves no majority anywhere", () => {
    const s = sim();
    s.act("isolate", { node: 0 });
    s.act("toggleLink", { a: 1, b: 2 });
    s.runFor(5_000);
    expect(s.state.acked).toBe(0);
    expect(s.state.rejected).toBeGreaterThan(30);
  });

  it("AP partition then heal with LWW: conflicts are detected and acknowledged writes are lost", () => {
    const s = sim({ mode: "ap" });
    s.act("split");
    s.runFor(8_000);
    expect(s.state.stalePart).toBeGreaterThan(0);
    expect(s.state.rejected).toBe(0);
    s.act("healAll");
    s.runFor(3_000);
    expect(s.state.conflicts).toBeGreaterThan(0);
    expect(s.state.lost).toBeGreaterThan(0);
    expect(s.state.lostList.length).toBeGreaterThan(0);
  });

  it("AP partition then heal with siblings: nothing lost, every acknowledged item survives, replicas converge", () => {
    const s = sim({ mode: "ap", resolve: "siblings", readPct: 50 });
    s.act("split");
    s.runFor(8_000);
    const writtenBefore = s.state.nextId;
    s.act("healAll");
    s.setConfig({ rate: 0.0001 }); // stop traffic after one last round so replicas settle
    s.runFor(2_000);
    expect(s.state.conflicts).toBeGreaterThan(0);
    expect(s.state.lost).toBe(0);
    expect(divergent(s.state)).toBe(0);
    // Every write made during the partition is still in the carts: siblings were merged by union, not overwritten.
    const held = new Set(KEYS.flatMap((_, k) => s.state.stores[0][k].flatMap((v) => v.items)));
    for (let id = 1; id <= writtenBefore; id++) expect(held.has(id)).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const go = () => { const s = sim({ mode: "ap" }, 7); s.act("split"); s.runFor(4_000); s.act("healAll"); s.runFor(2_000); return JSON.stringify([s.state.acked, s.state.stale, s.state.conflicts, s.state.lost, s.latest]); };
    expect(go()).toBe(go());
  });

  describe("challenges", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      it(`seed ${seed}: each passes with the intended move and fails without it`, () => {
        const wait = (s: Simulation<CapConfig, ReturnType<typeof capModel.init>>) => s.runFor(20_000);
        expect(judge("ap-stale-read", (s) => { s.runFor(1_000); isolate3(s); s.runFor(5_000); }, {}, seed).done).toBe(true);
        expect(judge("ap-stale-read", wait, {}, seed).out.passed).toBe(false);

        expect(judge("cp-unavailable", (s) => { s.runFor(1_000); isolate3(s); s.runFor(5_000); }, {}, seed).done).toBe(true);
        expect(judge("cp-unavailable", wait, {}, seed).out.passed).toBe(false);
        expect(judge("cp-unavailable", (s) => { s.act("split"); s.act("toggleLink", { a: 0, b: 1 }); s.runFor(10_000); }, {}, seed).out.passed).toBe(false);

        const heal = (s: Simulation<CapConfig, ReturnType<typeof capModel.init>>) => { s.runFor(1_000); s.act("split"); s.runFor(6_000); s.act("healAll"); s.runFor(6_000); };
        const good = judge("heal-siblings", heal, { resolve: "siblings" }, seed);
        expect(good.out.passed).toBe(true);
        expect(good.done).toBe(true);
        expect(judge("heal-siblings", heal, { resolve: "lww" }, seed).out.passed).toBe(false);

        const both = (s: Simulation<CapConfig, ReturnType<typeof capModel.init>>) => { s.runFor(8_000); s.setConfig({ mode: "ap" }); s.runFor(8_000); };
        const e = judge("else-latency", both, {}, seed);
        expect(e.out.passed).toBe(true);
        expect(e.out.value).toBeGreaterThan(60);
        expect(judge("else-latency", wait, {}, seed).out.passed).toBe(false);
        expect(judge("else-latency", (s) => { s.runFor(8_000); s.act("split"); s.act("healAll"); s.setConfig({ mode: "ap" }); s.runFor(8_000); }, {}, seed).out.passed).toBe(false);
      });
    }
  });
});
