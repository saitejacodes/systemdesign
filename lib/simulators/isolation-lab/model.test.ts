import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { isoModel, lostUpdateFixes, runAll, seenBy, type IsoState, type Level, type ScenarioId, type Technique } from "./model";

const RC: Level = "READ COMMITTED", RR: Level = "REPEATABLE READ", SER: Level = "SERIALIZABLE";

function run(scenario: ScenarioId, l1: Level, l2: Level = l1, technique: Technique = "naive") {
  const sim = new Simulation(isoModel, { stepSeconds: 1 }, 1);
  sim.act("load", { scenario, technique, level1: l1, level2: l2 });
  sim.act("run");
  return sim;
}
const results = (st: IsoState, s: 1 | 2) => st.sessions[s].lines.map((l) => l.result);

// Expected behaviour follows the PostgreSQL docs, "Transaction Isolation" (13.2).
describe("isolation lab matches Postgres", () => {
  it.each([RC, RR, SER])("dirty read never happens (%s)", (l) => {
    const st = run("dirty-read", l).state;
    expect(st.sessions[2].reads).toEqual([100, 100]);
    expect(st.outcome!.anomaly).toBe(false);
  });

  it("non-repeatable read happens under READ COMMITTED only", () => {
    expect(run("non-repeatable", RC).state.sessions[1].reads).toEqual([100, 70]);
    for (const l of [RR, SER]) {
      const st = run("non-repeatable", l).state;
      expect(st.sessions[1].reads).toEqual([100, 100]);
      expect(results(st, 1).at(-1)).toBe("COMMIT");
    }
  });

  it("phantoms appear under READ COMMITTED; Postgres REPEATABLE READ already prevents them", () => {
    expect(run("phantom", RC).state.sessions[1].reads).toEqual([2, 3]);
    expect(run("phantom", RR).state.sessions[1].reads).toEqual([2, 2]);
    const ser = run("phantom", SER).state;
    expect(ser.sessions[1].reads).toEqual([2, 2]);
    expect(ser.outcome!.anomaly).toBe(false);
    expect(results(ser, 1).at(-1)).toBe("COMMIT"); // T1 then T2 is a valid serial order
  });

  it("naive read-modify-write loses an update under READ COMMITTED after a lock wait", () => {
    const sim = run("lost-update", RC);
    const st = sim.state;
    expect(st.waits).toBe(1);
    expect(results(st, 2)).toContain("UPDATE 1 (after waiting)");
    expect(st.outcome!.anomaly).toBe(true);
    expect(st.outcome!.title).toMatch(/11 likes, expected 12/);
    expect(sim.latest.anomalies).toBe(1);
  });

  it.each([RR, SER])("first updater wins under %s: the second writer gets 40001 and nothing is lost", (l) => {
    const st = run("lost-update", l).state;
    expect(results(st, 2)).toContain("ERROR 40001: could not serialize access due to concurrent update (after waiting)");
    expect(results(st, 2).at(-1)).toBe("ROLLBACK (the transaction had failed)");
    expect(st.outcome!.anomaly).toBe(false);
  });

  it("atomic UPDATE and SELECT … FOR UPDATE both reach 12 under READ COMMITTED", () => {
    for (const t of ["atomic", "for-update"] as const) {
      const st = run("lost-update", RC, RC, t).state;
      expect(st.outcome!.title, t).toBe("No lost update: 12 likes");
    }
    expect(run("lost-update", RC, RC, "for-update").state.sessions[2].reads).toEqual([11]);
  });

  it("FOR UPDATE under REPEATABLE READ still fails after the wait (snapshot taken before the lock)", () => {
    const st = run("lost-update", RR, RR, "for-update").state;
    expect(results(st, 2).some((r) => r.includes("40001"))).toBe(true);
    expect(st.outcome!.anomaly).toBe(false);
  });

  it("the version column makes the second UPDATE match 0 rows", () => {
    const st = run("lost-update", RC, RC, "version").state;
    expect(results(st, 2)).toContain("UPDATE 0 (after waiting)");
    expect(st.outcome!.anomaly).toBe(false);
  });

  it("write skew slips through READ COMMITTED and REPEATABLE READ", () => {
    for (const l of [RC, RR]) {
      const st = run("write-skew", l).state;
      expect(results(st, 1).at(-1)).toBe("COMMIT");
      expect(results(st, 2).at(-1)).toBe("COMMIT");
      expect(st.outcome!.anomaly).toBe(true);
    }
  });

  it("SERIALIZABLE aborts the second committer of a write skew with 40001", () => {
    const st = run("write-skew", SER).state;
    expect(results(st, 1).at(-1)).toBe("COMMIT");
    expect(results(st, 2).at(-1)).toBe("ERROR 40001: could not serialize access due to read/write dependencies among transactions");
    expect(st.outcome!.anomaly).toBe(false);
    expect(st.failures).toBe(1);
  });

  it("SSI only protects transactions that are both SERIALIZABLE", () => {
    expect(run("write-skew", SER, RC).state.outcome!.anomaly).toBe(true);
  });

  it("a failed transaction ignores further statements until it ends", () => {
    const sim = new Simulation(isoModel, { stepSeconds: 1 }, 1);
    sim.act("load", { scenario: "lost-update", technique: "for-update", level1: RR, level2: RR });
    sim.act("run");
    // T2's UPDATE after its failed SELECT … FOR UPDATE is rejected with 25P02.
    expect(results(sim.state, 2)).toContain("ERROR 25P02: current transaction is aborted, commands ignored until end of transaction block");
  });

  it("an uncommitted version is visible only to its writer", () => {
    const sim = new Simulation(isoModel, { stepSeconds: 1 }, 1);
    sim.act("load", { scenario: "dirty-read" });
    sim.act("step"); sim.act("step"); // T1: BEGIN; UPDATE … balance = 0
    const v = sim.state.versions.find((x) => x.data.balance === 0)!;
    expect(seenBy(sim.state, 1, v)).toBe(true);
    expect(seenBy(sim.state, 2, v)).toBe(false);
  });

  it("autoplay steps once per stepSeconds and stops at the end", () => {
    const sim = new Simulation(isoModel, { stepSeconds: 0.5 }, 1);
    sim.runFor(2_100);
    expect(sim.state.cursor).toBe(4);
    sim.runFor(20_000);
    expect(sim.state.outcome).toBeDefined();
    expect(sim.state.runs).toHaveLength(1);
  });
});

describe("isolation lab challenges", () => {
  const get = (id: string) => challenges.find((c) => c.id === id)!;

  it("two lost-update fixes are needed, and the naive run doesn't count", () => {
    const sim = new Simulation(isoModel, { stepSeconds: 1 }, 1);
    const c = get("two-fixes");
    sim.act("run"); // naive, READ COMMITTED: loses an update
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(false);
    sim.act("load", { technique: "atomic" }); sim.act("run");
    expect(c.done!(sim.state)).toBe(false);
    sim.act("load", { technique: "naive", level2: SER }); sim.act("run"); // isolation level as the fix
    expect(lostUpdateFixes(sim.state)).toEqual(["atomic", "isolation"]);
    expect(c.done!(sim.state)).toBe(true);
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(true);
  });

  it("write skew is only beaten by a run with no anomaly", () => {
    const c = get("stop-write-skew");
    expect(c.done!(run("write-skew", RR).state)).toBe(false);
    const sim = run("write-skew", RR);
    sim.act("load", { level1: SER, level2: SER }); sim.act("run");
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(true);
  });

  it("the tour challenge needs all five scenarios", () => {
    const c = get("all-anomalies");
    const sim = new Simulation(isoModel, { stepSeconds: 1 }, 1);
    for (const s of ["dirty-read", "non-repeatable", "phantom", "lost-update"] as const) { sim.act("load", { scenario: s }); runAll(sim.state); }
    expect(c.winCondition(sim.metrics.history(), sim.state)).toMatchObject({ passed: false, value: 4 });
    sim.act("load", { scenario: "write-skew" }); sim.act("run");
    expect(c.done!(sim.state)).toBe(true);
  });
});
