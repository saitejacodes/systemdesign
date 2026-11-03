import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { RULES, budgetLeft, budgetMinutes, ebModel, threshold, type EbConfig, type EbState } from "./model";

const CFG: EbConfig = { slo: "99.9", windowDays: "30", scenario: "quiet", baseErrPct: 0.02, minutesPerSecond: 100 }; // 1 sim minute per 10 ms tick
const DAY = 1440;
const sim = (patch: Partial<EbConfig> = {}, seed = 1) => new Simulation(ebModel, { ...CFG, ...patch }, seed);
/** Runs until the sim minute reaches m (or a release review stops the clock). */
const runTo = (s: Simulation<EbConfig, EbState>, m: number) => { while (s.state.minute < m && s.state.minute < s.state.windowMin) s.step(); };
const runMonth = (s: Simulation<EbConfig, EbState>) => runTo(s, Infinity);
const check = (id: string, s: Simulation<EbConfig, EbState>) => challenges.find((c) => c.id === id)!.winCondition(s.metrics.history(), s.state);

describe("error budget arithmetic", () => {
  it("99.9% over 30 days is 43.2 minutes; thresholds are the workbook's 14.4×, 6× and 1×", () => {
    const s = sim();
    expect(budgetMinutes(s.state)).toBeCloseTo(43.2, 6);
    expect(RULES.map((r) => threshold(r, 30 * DAY))).toEqual([14.4, 6, 1].map((x) => expect.closeTo(x, 9)));
    // Thresholds scale with the window: 2% of a 28-day budget in 1 h is 13.44×.
    expect(threshold(RULES[0], 28 * DAY)).toBeCloseTo(13.44, 9);
  });

  it("a 43.2-minute full outage spends the whole budget", () => {
    const s = sim({ baseErrPct: 0 });
    s.act("inject", { minutes: 43.2, errPct: 100 }); // rounds to 43 whole minutes
    runTo(s, 120);
    expect(budgetLeft(s.state)).toBeCloseTo(1 - 43 / 43.2, 6);
  });

  it("is deterministic per seed", () => {
    const a = sim({ scenario: "random" }, 7), b = sim({ scenario: "random" }, 7);
    a.runFor(20_000); b.runFor(20_000);
    expect(a.state.incidents).toEqual(b.state.incidents);
    expect(a.state.cum[a.state.minute]).toBe(b.state.cum[b.state.minute]);
  });
});

describe("multiwindow burn-rate alerts", () => {
  it("a hard outage pages within minutes and resolves soon after the fix (the 5 m short window)", () => {
    const s = sim();
    runTo(s, DAY);
    s.act("inject", { minutes: 20, errPct: 100 });
    runTo(s, DAY + 300);
    const f = s.state.firings.find((x) => x.rule === "page-fast")!;
    // 5 m window needs 1.44% errors: one minute at 100% is already 20×; the 1 h window needs 0.864 min.
    expect(f.start - DAY).toBe(1);
    expect(f.end! - (DAY + 20)).toBeLessThanOrEqual(5);
    expect(s.state.pages).toBeGreaterThanOrEqual(1);
  });

  it("a 3× slow burn never pages but raises a ticket (failure the pager can't see)", () => {
    const s = sim();
    s.act("inject", { minutes: 2 * DAY, errPct: 0.3 });
    runTo(s, 3 * DAY);
    expect(s.state.pages).toBe(0);
    expect(s.state.tickets).toBe(1);
  });

  it("both windows must agree: an old outage doesn't keep the 1 h page firing once the 5 m window is clean", () => {
    const s = sim();
    s.act("inject", { minutes: 10, errPct: 100 });
    runTo(s, 30);
    // 1 h window still burns 10/60/0.001 ≈ 167×, but the 5 m window is back to baseline.
    expect(s.state.firing["page-fast"]).toBe(false);
    // The 6 h & 30 m rule is still firing: its short window still holds the outage.
    expect(s.state.firing["page-slow"]).toBe(true);
  });

  it("the month stops at a release review until the board decides", () => {
    const s = sim({ scenario: "release-month" });
    runTo(s, 8 * DAY);
    s.runFor(5_000);
    expect(s.state.minute).toBe(8 * DAY);
    expect(s.state.reviews[0].expected).toBe("ship");
    expect(s.state.reviews[0].ticket).toBe(true);
    s.act("decide", { id: 1, verdict: "ship" });
    s.runFor(1_000);
    expect(s.state.minute).toBeGreaterThan(8 * DAY);
  });

  it("changing the SLO starts a fresh window", () => {
    const s = sim();
    s.runFor(5_000);
    s.setConfig({ slo: "99.99" });
    s.step();
    expect(s.state.minute).toBe(0);
    expect(budgetMinutes(s.state)).toBeCloseTo(4.32, 6);
  });
});

describe("challenges", () => {
  function board(seed: number, answers?: ("ship" | "hold")[]) {
    const s = sim(challenges[0].setup, seed);
    for (let k = 0; k < 3; k++) {
      while (!s.state.reviews[k].expected) s.step();
      s.act("decide", { id: k + 1, verdict: answers ? answers[k] : s.state.reviews[k].expected });
    }
    return s;
  }
  it.each([1, 2, 3, 4, 5])("release board: the policy answers ship, hold, hold (seed %i)", (seed) => {
    const s = board(seed);
    expect(s.state.reviews.map((r) => r.expected)).toEqual(["ship", "hold", "hold"]);
    expect(s.state.reviews[1].paging).toBe(true);
    expect(s.state.reviews[2].paging).toBe(false);
    expect(s.state.reviews[2].budgetLeft!).toBeLessThan(-0.05);
    expect(s.state.reviews[0].budgetLeft!).toBeGreaterThan(0.6);
    expect(check("release-board", s).passed).toBe(true);
    expect(check("release-board", board(seed, ["ship", "ship", "ship"])).passed).toBe(false);
    expect(check("release-board", board(seed, ["hold", "hold", "hold"])).passed).toBe(false);
  });

  it.each([1, 2, 3, 4, 5])("slow burn passes for a long low-rate incident, fails for an outage (seed %i)", (seed) => {
    const good = sim(challenges[1].setup, seed);
    good.act("inject", { minutes: DAY, errPct: 0.4 });
    while (!challenges[1].done!(good.state)) good.step();
    expect(check("slow-burn", good).passed).toBe(true);
    const bad = sim(challenges[1].setup, seed);
    bad.act("inject", { minutes: 15, errPct: 100 });
    while (!challenges[1].done!(bad.state)) bad.step();
    expect(check("slow-burn", bad).passed).toBe(false);
  });

  it.each([1, 2, 3, 4, 5])("spend the budget: two 15-min outages pass, doing nothing or three fail (seed %i)", (seed) => {
    const run = (n: number) => {
      const s = sim(challenges[2].setup, seed);
      for (let k = 0; k < n; k++) { runTo(s, (k + 1) * 5 * DAY); s.act("inject", { minutes: 15, errPct: 100 }); }
      runMonth(s);
      return check("spend-budget", s);
    };
    const two = run(2);
    expect(two.passed).toBe(true);
    expect(two.value).toBeGreaterThan(5);
    expect(two.value).toBeLessThan(20);
    expect(run(0).passed).toBe(false);
    expect(run(3).passed).toBe(false);
  });
});
