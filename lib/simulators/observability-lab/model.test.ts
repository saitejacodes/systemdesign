import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { INCIDENTS, obsModel, type CauseId, type Comp, type IncidentId, type ObsConfig, type ObsState } from "./model";

const BASE: ObsConfig = { rps: 40, infoLogs: "10%", sampling: "tail", incident: "none" };
const SEEDS = [1, 2, 3, 4, 5];
const sim = (patch: Partial<ObsConfig> = {}, seed = 1) => new Simulation(obsModel, { ...BASE, ...patch }, seed);
/** Mean of a RED field over the last n one-second points. */
const avg = (s: ObsState, c: Comp, k: "rps" | "err" | "p50" | "p99", n = 15) => { const a = s.series[c].slice(-n); return a.reduce((x, p) => x + p[k], 0) / a.length; };
/** Incident pages 15 s in (config.incident); run 45 s past the page. */
const incident = (id: IncidentId, seed: number) => { const x = sim({ incident: id }, seed); x.runFor(60_000); return x; };
const submit = (x: Simulation<ObsConfig, ObsState>, cause: CauseId, comp: Comp) => x.act("submit", { cause, comp });
const win = (id: string, s: ObsState) => challenges.find((c) => c.id === id)!.winCondition({}, s);

describe("healthy system", () => {
  it("has a quiet baseline and caps what it stores", () => {
    const x = sim();
    x.runFor(90_000);
    const s = x.state;
    expect(avg(s, "gateway", "rps")).toBeGreaterThan(30);
    expect(avg(s, "gateway", "err")).toBeLessThan(0.5);
    expect(s.hitRatio).toBeGreaterThan(0.9);
    expect(s.heap.restarts).toBe(0);
    expect(s.logs.length).toBeLessThanOrEqual(900);
    expect(s.traces.length).toBeLessThanOrEqual(60);
    expect(s.series.gateway.length).toBeLessThanOrEqual(60);
  });

  it("is deterministic per seed", () => {
    const a = sim({ incident: "psp-timeout" }, 7), b = sim({ incident: "psp-timeout" }, 7);
    a.runFor(30_000); b.runFor(30_000);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it("head sampling drops most error traces; tail sampling keeps them", () => {
    const kept = (sampling: ObsConfig["sampling"]) => { const x = sim({ incident: "users-deploy", sampling }); x.runFor(60_000); return x.state.traces.filter((t) => t.status >= 500).length; };
    expect(kept("tail")).toBeGreaterThan(30);
    expect(kept("head")).toBeLessThan(kept("tail") / 3);
  });
});

// Each incident must be diagnosable: a distinct signature across metrics, logs and traces, on every seed.
describe.each(SEEDS)("incident signatures (seed %i)", (seed) => {
  it("slow query in orders: one statement is slow, other queries are not", () => {
    const s = incident("orders-db", seed).state;
    expect(avg(s, "orders", "p99")).toBeGreaterThan(2000);
    expect(avg(s, "users", "p99")).toBeLessThan(50);
    const slow = s.logs.filter((l) => l.comp === "postgres");
    expect(slow.length).toBeGreaterThan(20);
    expect(slow.every((l) => l.msg.includes("FROM orders WHERE customer_id"))).toBe(true);
    expect(s.logs.some((l) => l.msg.includes("connection pool exhausted"))).toBe(true);
    expect(s.traces.some((t) => t.spans.some((sp) => String(sp.attrs?.plan).startsWith("Seq Scan")))).toBe(true);
  });

  it("payment provider timeouts: the deepest red span is the PSP call; orders only waits", () => {
    const s = incident("psp-timeout", seed).state;
    expect(avg(s, "psp", "err")).toBeGreaterThan(40);
    expect(avg(s, "psp", "rps")).toBeGreaterThan(avg(s, "payments", "rps") * 1.5); // retries amplify calls
    expect(avg(s, "users", "err")).toBe(0);
    const bad = s.traces.filter((t) => t.status === 502);
    expect(bad.length).toBeGreaterThan(5);
    for (const t of bad) {
      expect(t.spans.filter((sp) => sp.comp === "psp" && sp.err).length).toBe(3);
      const orders = t.spans.find((sp) => sp.comp === "orders")!;
      const kids = t.spans.filter((sp) => sp.parent === orders.id).reduce((a, sp) => a + sp.dur, 0);
      expect(orders.dur - kids).toBeLessThan(20);
    }
  });

  it("cache node down: one node fails, hit ratio drops, Postgres gets more (not slower) queries", () => {
    const base = sim({}, seed); base.runFor(60_000);
    const s = incident("cache-down", seed).state;
    expect(avg(s, "redis", "err")).toBeGreaterThan(20);
    expect(s.hitRatio).toBeLessThan(0.75);
    expect(avg(s, "postgres", "rps")).toBeGreaterThan(avg(base.state, "postgres", "rps") * 1.3);
    expect(avg(s, "postgres", "p50")).toBeLessThan(20);
    const warns = s.logs.filter((l) => l.msg.includes("ETIMEDOUT"));
    expect(warns.length).toBeGreaterThan(50);
    expect(warns.every((l) => l.msg.includes("cache-2"))).toBe(true);
  });

  it("memory leak in inventory: full GCs reclaim little, then OOMKilled and 503s with no inventory span", () => {
    const s = incident("inventory-leak", seed).state;
    expect(s.heap.restarts).toBeGreaterThanOrEqual(1);
    expect(s.logs.some((l) => l.msg.includes("OOMKilled (exit code 137"))).toBe(true);
    expect(s.logs.filter((l) => l.msg.startsWith("Full GC")).length).toBeGreaterThan(3);
    expect(s.logs.some((l) => l.msg.includes("rollout"))).toBe(false);
    expect(s.traces.some((t) => t.status === 503 && !t.spans.some((sp) => sp.comp === "inventory"))).toBe(true);
  });

  it("bad deploy of users: fast 500s from v2.14.0 right after the rollout line", () => {
    const s = incident("users-deploy", seed).state;
    expect(avg(s, "users", "err")).toBeGreaterThan(5);
    expect(avg(s, "users", "p99")).toBeLessThan(50);
    expect(avg(s, "orders", "err")).toBe(0);
    const roll = s.logs.findIndex((l) => l.msg.startsWith("rollout complete: users v2.14.0"));
    const first = s.logs.findIndex((l) => l.msg.startsWith("TypeError"));
    expect(roll).toBeGreaterThanOrEqual(0);
    expect(first).toBeGreaterThan(roll);
    expect(s.traces.filter((t) => t.status === 500).every((t) => t.spans.some((sp) => sp.comp === "users" && sp.err && sp.attrs?.version === "v2.14.0"))).toBe(true);
  });
});

describe("root-cause submission", () => {
  it("a plausible wrong answer costs points and gets a nudge; the right one resolves the incident", () => {
    const x = incident("cache-down", 1);
    submit(x, "db-overload", "postgres");
    expect(x.state.inc!.wrong).toBe(1);
    expect(x.state.inc!.feedback[0]).toMatch(/Both wrong\. The database is busier/);
    submit(x, "cache-down", "postgres");
    expect(x.state.inc!.feedback[0]).toMatch(/^Cause right, component wrong\. Postgres is getting more queries/);
    submit(x, "cache-down", "redis");
    const r = x.state.solved["cache-down"]!;
    expect(r.wrong).toBe(2);
    expect(r.score).toBe(Math.round(100 * 0.75 ** 2)); // solved 45 s after the page: no time penalty yet
    expect(x.state.inc).toBeUndefined();
    x.runFor(20_000);
    expect(avg(x.state, "redis", "err", 10)).toBe(0);
  });

  it("can't submit before the page; slow answers score less", () => {
    const x = sim({ incident: "users-deploy" });
    x.runFor(5_000);
    submit(x, "bad-deploy", "users");
    expect(x.state.solved["users-deploy"]).toBeUndefined();
    x.runFor(10_000 + 400_000);
    submit(x, "bad-deploy", "users");
    expect(x.state.solved["users-deploy"]!.score).toBeLessThan(60);
  });

  it("a Break-it fault applies the same condition openly", () => {
    const x = sim();
    x.runFor(10_000);
    x.toggleFault("users-deploy");
    x.runFor(20_000);
    expect(avg(x.state, "users", "err", 10)).toBeGreaterThan(5);
    x.toggleFault("users-deploy");
    x.runFor(15_000);
    expect(avg(x.state, "users", "err", 10)).toBe(0);
  });
});

describe("challenges", () => {
  const run = (id: string, answers: [CauseId, Comp][], seed = 1) => {
    const c = challenges.find((y) => y.id === id)!;
    const x = sim(c.setup, seed);
    x.runFor(45_000);
    for (const [cause, comp] of answers) submit(x, cause, comp);
    return win(id, x.state);
  };

  it.each(SEEDS)("slow-checkout passes on a first-try diagnosis and fails after blaming Postgres (seed %i)", (seed) => {
    expect(run("slow-checkout", [["slow-query", "orders"]], seed).passed).toBe(true);
    expect(run("slow-checkout", [["db-overload", "postgres"], ["slow-query", "orders"]], seed).passed).toBe(false);
    expect(run("slow-checkout", [], seed).passed).toBe(false);
  });

  it("cache-or-db passes for the cache node, fails for the database", () => {
    expect(run("cache-or-db", [["cache-down", "redis"]]).passed).toBe(true);
    expect(run("cache-or-db", [["slow-query", "postgres"], ["cache-down", "redis"]]).passed).toBe(false);
  });

  it("all-five needs every incident solved; revealing one doesn't count", () => {
    const x = sim();
    const answers = Object.fromEntries(INCIDENTS.map((d) => [d.id, [d.cause, d.comps[0]] as const]));
    for (const d of INCIDENTS) {
      x.act("start", { id: d.id });
      x.runFor(30_000);
      if (d.id === "users-deploy") x.act("reveal");
      else submit(x, ...answers[d.id]);
    }
    expect(win("all-five", x.state).passed).toBe(false);
    expect(win("all-five", x.state).detail).toMatch(/4 of 5/);
    x.act("start", { id: "users-deploy" });
    x.runFor(30_000);
    submit(x, "bad-deploy", "users");
    const out = win("all-five", x.state);
    expect(out.passed).toBe(true);
    expect(out.value).toBe(500);
    expect(challenges.find((c) => c.id === "all-five")!.done!(x.state)).toBe(true);
  });

  it("random start picks an unsolved incident", () => {
    const x = sim();
    x.act("start", { id: "orders-db" }); x.runFor(10_000); submit(x, "slow-query", "orders");
    x.act("start");
    expect(x.state.inc!.id).not.toBe("orders-db");
  });
});
