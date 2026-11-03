import { describe, expect, it } from "vitest";
import { Simulation, createRng, type TickContext } from "@/lib/sim/engine";
import { MetricsRegistry } from "@/lib/sim/engine/metrics";
import { challenges } from "./challenges";
import { N, advanceCommit, leaderOf, raftModel, type RaftConfig, type RaftState } from "./model";

const base: RaftConfig = { timeoutMin: 150, timeoutMax: 300, heartbeat: 50, delay: 20, writeRate: 5 };
const sim = (patch: Partial<RaftConfig> = {}, seed = 1) => new Simulation(raftModel, { ...base, ...patch }, seed);
const ids = (s: RaftState, i: number) => s.nodes[i].log.slice(0, s.nodes[i].commit).map((e) => `${e.term}:${e.id}`);
const strand = (s: Simulation<RaftConfig, RaftState>) => {
  const L = leaderOf(s.state);
  s.act("move", { node: L, group: 1 });
  s.act("move", { node: (L + 1) % N, group: 1 });
  return L;
};
/** Every pair of nodes agrees on the entries both have committed (State Machine Safety). */
function committedPrefixesAgree(s: RaftState) {
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const x = ids(s, a), y = ids(s, b);
    const k = Math.min(x.length, y.length);
    expect(x.slice(0, k)).toEqual(y.slice(0, k));
  }
}

describe("raft", () => {
  it("elects one leader, which replicates and commits client writes on every node", () => {
    const s = sim();
    s.runFor(5_000);
    const st = s.state;
    expect(st.nodes.filter((n) => n.role === "leader")).toHaveLength(1);
    expect(st.acked).toBeGreaterThan(15);
    const L = leaderOf(st);
    for (const n of st.nodes) expect(n.commit).toBeGreaterThan(st.nodes[L].commit - 5);
    expect(st.spurious).toBe(0);
  });

  it("at most one leader per term and no committed entry ever changes, across 40 seeds of chaos", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = sim({ timeoutMin: 100, timeoutMax: 200, writeRate: 10 }, seed);
      const chaos = createRng(seed * 7919);
      if (seed % 3 === 0) s.toggleFault("loss");
      for (let k = 0; k < 40; k++) {
        s.runFor(chaos.int(50, 400));
        const i = chaos.int(0, N - 1);
        const r = chaos.next();
        if (r < 0.3) s.act("toggleCrash", { node: i });
        else if (r < 0.6) s.act("move", { node: i, group: chaos.int(0, 1) });
        else if (r < 0.7) s.act("toggleSlow", { node: i });
        else if (r < 0.8) s.act("heal");
      }
      s.state.nodes.forEach((n, i) => { if (n.down) s.act("restart", { node: i }); });
      s.act("heal");
      s.runFor(3_000);
      expect(s.state.splitBrain).toBe(0);
      expect(s.state.violations).toBe(0);
      committedPrefixesAgree(s.state);
    }
  });

  it("committed entries survive a leader crash: the new leader holds all of them", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = sim({}, seed);
      s.runFor(3_000);
      const L = leaderOf(s.state);
      const before = ids(s.state, L);
      expect(before.length).toBeGreaterThan(5);
      s.act("crash", { node: L });
      s.runFor(2_000);
      const L2 = leaderOf(s.state);
      expect(L2).not.toBe(L);
      expect(s.state.nodes[L2].term).toBeGreaterThan(s.state.nodes[L].term);
      expect(ids(s.state, L2).slice(0, before.length)).toEqual(before);
      s.act("restart", { node: L });
      s.runFor(2_000);
      expect(ids(s.state, L).slice(0, before.length)).toEqual(before);
      expect(s.state.violations).toBe(0);
    }
  });

  it("a leader on the minority side cannot commit; the majority elects a new leader that can", () => {
    const s = sim();
    s.runFor(3_000);
    const L = strand(s);
    const commit = s.state.nodes[L].commit;
    s.runFor(4_000);
    const st = s.state;
    expect(st.nodes[L].role).toBe("leader"); // it doesn't know yet
    expect(st.nodes[L].log.length).toBeGreaterThan(commit + 3);
    expect(st.nodes[L].commit).toBe(commit);
    const L2 = leaderOf(st);
    expect(L2).not.toBe(L);
    expect(st.nodes[L2].commit).toBeGreaterThan(commit + 3);
    expect(st.minorityWrites).toBeGreaterThan(3);
    expect(st.minorityCommitted).toBe(0);
    expect(st.failed).toBe(0); // its clients are still waiting, not told OK
  });

  it("after the heal the stale leader steps down and every log reconciles to the majority's", () => {
    const s = sim();
    s.runFor(3_000);
    const L = strand(s);
    s.runFor(3_000);
    s.act("heal");
    s.runFor(2_000);
    const st = s.state;
    expect(st.nodes[L].role).toBe("follower");
    expect(st.truncated).toBeGreaterThan(0);
    expect(st.failed).toBeGreaterThan(0); // the stranded writes were answered with an error
    expect(st.reconciles.some((r) => r.repaired > 0)).toBe(true);
    committedPrefixesAgree(st);
    expect(st.violations + st.splitBrain).toBe(0);
  });

  it("the election restriction: a node missing committed entries cannot win", () => {
    const s = sim();
    s.runFor(2_000);
    const L = leaderOf(s.state);
    const lag = (L + 1) % N;
    s.act("crash", { node: lag });
    s.runFor(2_000); // lag misses ~10 committed writes
    s.act("restart", { node: lag });
    s.act("crash", { node: L });
    for (let k = 0; k < 300; k++) { s.step(); if (s.state.nodes[lag].role === "leader") break; }
    s.runFor(1_000);
    const L2 = leaderOf(s.state);
    expect(s.state.nodes[L2].commit).toBeGreaterThan(0);
    expect(s.state.violations).toBe(0);
    // Whoever won, it had every committed entry: State Machine Safety held.
    committedPrefixesAgree(s.state);
  });

  it("commits only current-term entries by counting replicas (§5.4.2)", () => {
    const st = raftModel.init(base, createRng(1));
    const n = st.nodes[0];
    Object.assign(n, { role: "leader", term: 3, log: [{ term: 1, id: 1 }, { term: 2, id: 2 }], next: Array(N).fill(3), match: [0, 2, 2, 0, 0] });
    const ctx: TickContext<RaftConfig> = { t: 0, dt: 10, rng: createRng(1), config: base, metrics: new MetricsRegistry(), log: () => {} };
    advanceCommit(st, 0, ctx);
    expect(n.commit).toBe(0); // index 2 is on a majority but from term 2
    n.log.push({ term: 3, id: 3 });
    n.match = [0, 3, 3, 0, 0];
    advanceCommit(st, 0, ctx);
    expect(n.commit).toBe(3); // committing #3 commits everything below it
  });

  it("a slow follower doesn't slow commits; a too-short timeout causes false elections", () => {
    const s = sim();
    s.runFor(1_000);
    s.act("toggleSlow", { node: (leaderOf(s.state) + 1) % N });
    s.runFor(5_000);
    expect(s.latest.p99).toBeLessThan(100);
    const twitchy = sim({ timeoutMin: 40, timeoutMax: 60 });
    twitchy.runFor(5_000);
    expect(twitchy.state.spurious).toBeGreaterThan(5);
    expect(twitchy.state.violations + twitchy.state.splitBrain).toBe(0);
  });

  it("is deterministic for a seed", () => {
    const go = (seed: number) => { const s = sim({}, seed); s.runFor(2_000); s.act("crash", { node: leaderOf(s.state) }); s.runFor(2_000); return JSON.stringify([s.state.nodes.map((n) => [n.term, n.log.length]), s.state.acked]); };
    expect(go(5)).toBe(go(5));
    expect(go(5)).not.toBe(go(6));
  });
});

describe("raft challenges", () => {
  const start = (id: string, patch: Partial<RaftConfig> = {}, seed = 1) => {
    const c = challenges.find((x) => x.id === id)!;
    return { c, s: new Simulation(raftModel, { ...base, writeRate: 2, ...c.setup, ...patch }, seed) };
  };
  const judge = ({ c, s }: ReturnType<typeof start>) => c.winCondition(s.metrics.history(), s.state);
  const seeds = [1, 2, 3, 4, 5];

  it("fast-failover: tuned timeouts pass; the slow setup and a twitchy timeout fail", () => {
    for (const seed of seeds) {
      const run = (patch: Partial<RaftConfig>) => { const r = start("fast-failover", patch, seed); r.s.runFor(8_000); r.s.act("crash", { node: leaderOf(r.s.state) }); r.s.runFor(6_000); return judge(r); };
      expect(run({}).passed).toBe(false);
      expect(run({ timeoutMin: 150, timeoutMax: 300 }).passed).toBe(true);
      expect(run({ timeoutMin: 40, timeoutMax: 80 }).passed).toBe(false);
    }
  });

  it("minority-leader: stranding the leader passes; cutting off two followers fails", () => {
    for (const seed of seeds) {
      const good = start("minority-leader", {}, seed);
      good.s.runFor(3_000);
      strand(good.s);
      good.s.runFor(8_000);
      expect(judge(good).passed).toBe(true);
      const bad = start("minority-leader", {}, seed);
      bad.s.runFor(3_000);
      const L = leaderOf(bad.s.state);
      bad.s.act("move", { node: (L + 1) % N, group: 1 });
      bad.s.act("move", { node: (L + 2) % N, group: 1 });
      bad.s.runFor(8_000);
      expect(judge(bad).passed).toBe(false);
    }
  });

  it("reconcile: a healed minority-leader partition passes; a harmless one fails", () => {
    for (const seed of seeds) {
      const good = start("reconcile", {}, seed);
      good.s.runFor(3_000);
      strand(good.s);
      good.s.runFor(6_000);
      good.s.act("heal");
      good.s.runFor(5_000);
      expect(judge(good).passed).toBe(true);
      const bad = start("reconcile", {}, seed);
      bad.s.runFor(3_000);
      bad.s.act("move", { node: (leaderOf(bad.s.state) + 1) % N, group: 1 });
      bad.s.runFor(3_000);
      bad.s.act("heal");
      bad.s.runFor(5_000);
      expect(judge(bad).passed).toBe(false);
    }
  });
});
