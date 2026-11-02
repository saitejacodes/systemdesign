import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { EXERCISES, parsePlan, planNodes, probeWith, runSql, seed, selfCost, sqlModel, toJsonExplain, type Db } from "./model";

const fresh = async () => {
  const db = new PGlite() as unknown as Db;
  await seed(db);
  return db;
};

describe("sql sandbox helpers", () => {
  it("rewrites a single EXPLAIN into JSON format and leaves everything else alone", () => {
    expect(toJsonExplain("EXPLAIN ANALYZE SELECT 1;")).toBe("EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1");
    expect(toJsonExplain("explain (buffers) select 1")).toBe("EXPLAIN (buffers, FORMAT JSON) select 1");
    expect(toJsonExplain("EXPLAIN (FORMAT TEXT) SELECT 1")).toBeNull();
    expect(toJsonExplain("SELECT 1")).toBeNull();
    expect(toJsonExplain("CREATE INDEX i ON t (a); EXPLAIN SELECT 1")).toBeNull();
  });

  it("parses a plan tree and finds each node's own cost", () => {
    const p = parsePlan({ "Node Type": "Limit", "Startup Cost": 0, "Total Cost": 50, "Plan Rows": 20, Plans: [{ "Node Type": "Sort", "Startup Cost": 0, "Total Cost": 45, "Plan Rows": 4, "Sort Key": ["created_at DESC"], Plans: [{ "Node Type": "Seq Scan", "Relation Name": "posts", "Startup Cost": 0, "Total Cost": 40, "Plan Rows": 4, Filter: "(user_id = 42)" }] }] });
    const flat = planNodes(p);
    expect(flat.map((x) => [x.node.type, x.depth])).toEqual([["Limit", 0], ["Sort", 1], ["Seq Scan", 2]]);
    expect(selfCost(flat[2].node)).toBe(40);
    expect(selfCost(flat[1].node)).toBe(5);
    expect(flat[2].node.detail).toBe("Filter: (user_id = 42)");
  });

  it("the model records passes per track and the track challenges use them", () => {
    const sim = new Simulation(sqlModel, { track: "indexing" }, 1);
    EXERCISES.filter((e) => e.track === "indexing").forEach((e) => sim.act("pass", e.id));
    sim.act("pass", "not-an-exercise");
    expect(Object.keys(sim.state.passed)).toHaveLength(5);
    const c = challenges.find((x) => x.id === "track-indexing")!;
    expect(c.done!(sim.state)).toBe(true);
    expect(c.winCondition(sim.metrics.history(), sim.state).passed).toBe(true);
    expect(challenges.find((x) => x.id === "track-modeling")!.done!(sim.state)).toBe(false);
  });
});

// Every auto-checker against a real seeded Postgres: each solution passes, each starter fails.
describe("sql sandbox exercises (PGlite)", () => {
  let solved: Db, starters: Db;
  beforeAll(async () => { [solved, starters] = await Promise.all([fresh(), fresh()]); }, 120_000);

  it("has 5 exercises in each of 3 tracks", () => {
    for (const t of ["indexing", "modeling", "transactions"]) expect(EXERCISES.filter((e) => e.track === t)).toHaveLength(5);
  });

  it("the seed is deterministic and the right size", async () => {
    const r = await solved.query("SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM posts) p, (SELECT count(*) FROM follows) f, (SELECT count(*) FROM orders) o, (SELECT max(user_id) FROM posts WHERE id = 1) p1");
    expect(r.rows[0]).toEqual({ u: 50000, p: 200000, f: 300000, o: 100000, p1: 7920 });
  });

  for (const ex of EXERCISES) {
    it(`${ex.id}: the starter fails`, async () => {
      const last = await runSql(starters, ex.starter);
      const v = await ex.check(last, probeWith(starters));
      expect(v.pass, v.msg).toBe(false);
    }, 30_000);
  }

  for (const ex of EXERCISES) {
    it(`${ex.id}: the solution passes`, async () => {
      const last = await runSql(solved, ex.solution);
      expect(last.ok, last.error).toBe(true);
      const v = await ex.check(last, probeWith(solved));
      expect(v.pass, v.msg).toBe(true);
    }, 30_000);
  }
});
