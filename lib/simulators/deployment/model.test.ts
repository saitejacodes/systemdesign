import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { definition } from "./index";
import { MIG_STEPS, N, deployModel, isReady, type DeployConfig } from "./model";

const base = definition.defaultConfig;
const GOOD = ["add", "dual", "backfill", "readNew", "newOnly", "drop"];
const sim = (patch: Partial<DeployConfig> = {}, seed = 1) => new Simulation(deployModel, { ...base, ...patch }, seed);
const deploy = (patch: Partial<DeployConfig> = {}, ms = 40_000, seed = 1) => { const s = sim(patch, seed); s.act("deploy", { strategy: s.config.strategy }); s.runFor(ms); return s; };
const migrate = (order: string[], seed = 1) => { const s = sim({ mode: "migration" }, seed); s.act("migOrder", order); s.act("migRun"); s.runFor(25_000); return s.state.mig; };
const run = (id: string, patch: Partial<DeployConfig> = {}, seed = 1, order?: string[]) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = sim({ ...c.setup, ...patch }, seed);
  if (order) { s.act("migOrder", order); s.act("migRun"); } else if (s.config.mode === "release") s.act("deploy", { strategy: s.config.strategy });
  while (s.clock.t < c.durationMs && !c.done?.(s.state)) s.step();
  return c.winCondition(s.metrics.history(), s.state);
};

describe("deployment", () => {
  it("rolling update respects maxSurge and maxUnavailable at every tick", () => {
    const s = sim({ build: "good", maxSurge: 2, maxUnavailable: 1 });
    s.act("deploy", { strategy: "rolling" });
    s.runFor(100); // the first reconcile may drop old pods before new ones exist
    let minReady = N;
    for (let i = 0; i < 3000 && s.state.deploy?.end === undefined; i++) {
      s.step();
      expect(s.state.pods.length).toBeLessThanOrEqual(N + 2);
      minReady = Math.min(minReady, s.state.pods.filter((p) => isReady(p, s.state.t)).length);
    }
    expect(minReady).toBe(N - 1);
    expect(s.state.deploy?.outcome).toBe("promoted");
    expect(s.state.pods.every((p) => p.ver === 2)).toBe(true);
    expect(s.state.errors).toBe(0);
  });

  it("a bad build sails through a rolling update: readiness passes, users get errors", () => {
    const s = deploy({ build: "bad" });
    expect(s.state.deploy?.outcome).toBe("promoted");
    expect(s.state.bugErrors).toBeGreaterThan(500);
  });

  it("maxUnavailable below capacity causes 503s even with a good build", () => {
    const s = deploy({ build: "good", maxSurge: 0, maxUnavailable: 4 });
    expect(s.state.overloadErrors).toBeGreaterThan(100);
    expect(s.state.bugErrors).toBe(0);
  });

  it("blue-green needs a full second fleet and rolls back instantly", () => {
    const good = deploy({ build: "good", strategy: "bluegreen" });
    expect(good.state.peakExtra).toBe(N);
    expect(good.state.deploy?.outcome).toBe("promoted");
    const bad = deploy({ build: "bad", strategy: "bluegreen" });
    expect(bad.state.deploy?.outcome).toBe("rolledBack");
    expect(bad.latest.rollbackS).toBeLessThan(0.1);
  });

  it("canary analysis aborts a bad build at the first step and limits the blast radius", () => {
    const s = deploy({ build: "bad", strategy: "canary", canarySteps: "10,25,50,100" });
    const d = s.state.deploy!;
    expect(d.outcome).toBe("rolledBack");
    expect(d.step).toBe(0);
    expect(d.last?.verdict).toBe("fail");
    expect(s.state.affected).toBeLessThan(50);
    expect(s.state.pods.every((p) => p.ver === 1)).toBe(true);
  });

  it("a 1% canary waits for enough samples before judging", () => {
    const s = sim({ build: "bad", strategy: "canary", canarySteps: "1,5,25,50,100" });
    s.act("deploy", { strategy: "canary" });
    s.runFor(9_000);
    expect(s.state.deploy?.last?.verdict).toBe("inconclusive");
    s.runFor(20_000);
    expect(s.state.deploy?.outcome).toBe("rolledBack");
  });

  it("manual rollback works for a rolling update", () => {
    const s = sim({ build: "bad", maxSurge: 1, maxUnavailable: 0 });
    s.act("deploy", { strategy: "rolling" });
    s.runFor(4_000);
    s.act("rollback");
    s.runFor(10_000);
    expect(s.state.deploy?.outcome).toBe("rolledBack");
    expect(s.state.pods.filter((p) => p.ver === 1).length).toBe(N);
  });

  it("without a readiness probe, new pods take traffic while still booting", () => {
    const s = sim({ build: "good" });
    s.toggleFault("no-readiness");
    s.act("deploy", { strategy: "rolling" });
    s.runFor(10_000);
    expect(s.state.coldErrors).toBeGreaterThan(50);
  });

  it("expand/contract in the right order is clean; each wrong order fails in its own way", () => {
    expect(migrate(GOOD).cleanRuns).toBe(1);
    const dropEarly = migrate(["add", "dual", "backfill", "readNew", "drop", "newOnly"]);
    expect(dropEarly.failed).toBeGreaterThan(0);
    const readBeforeBackfill = migrate(["add", "dual", "readNew", "backfill", "newOnly", "drop"]);
    expect(readBeforeBackfill.bad).toBeGreaterThan(0);
    const writeBeforeAdd = migrate(["dual", "add", "backfill", "readNew", "newOnly", "drop"]);
    expect(writeBeforeAdd.reasons.some((r) => /full_name → ERROR column does not exist/.test(r))).toBe(true);
    const backfillTooEarly = migrate(["add", "backfill", "dual", "readNew", "newOnly", "drop"]);
    expect(backfillTooEarly.bad).toBeGreaterThan(0);
  });

  it("migMove swaps neighbours and is ignored while running", () => {
    const s = sim({ mode: "migration" });
    const first = s.state.mig.order[0];
    s.act("migMove", { id: first, dir: 1 });
    expect(s.state.mig.order[1]).toBe(first);
    s.act("migRun");
    s.act("migMove", { id: first, dir: 1 });
    expect(s.state.mig.order[1]).toBe(first);
    expect(MIG_STEPS.every((x) => s.state.mig.order.includes(x.id))).toBe(true);
  });

  it("is deterministic per seed", () => {
    const a = deploy({ strategy: "canary" }, 30_000, 7), b = deploy({ strategy: "canary" }, 30_000, 7);
    expect(a.state.requests).toBe(b.state.requests);
    expect(a.state.affected).toBe(b.state.affected);
    expect(a.state.deploy).toEqual(b.state.deploy);
  });

  it("challenges: the intended fix passes, the naive setup fails", () => {
    expect(run("bad-under-1pct", { strategy: "canary" }).passed).toBe(true);
    expect(run("bad-under-1pct").passed).toBe(false);
    expect(run("bad-under-1pct", { strategy: "bluegreen" }).passed).toBe(false);
    expect(run("bad-under-1pct", { strategy: "canary", analysis: false }).passed).toBe(false);
    expect(run("cheap-rollout", { maxSurge: 2, maxUnavailable: 0 }).passed).toBe(true);
    expect(run("cheap-rollout").passed).toBe(false);
    expect(run("cheap-rollout", { strategy: "bluegreen" }).passed).toBe(false);
    expect(run("cheap-rollout", { maxSurge: 0, maxUnavailable: 3 }).passed).toBe(false);
    expect(run("zero-downtime-rename", {}, 1, GOOD).passed).toBe(true);
    expect(run("zero-downtime-rename", {}, 1, ["add", "readNew", "dual", "backfill", "drop", "newOnly"]).passed).toBe(false);
  });
});
