import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { DRILLS, close, drillAnswer, estModel, estimate, fmtBytes, parseNum, type EstConfig } from "./model";

const cfg: EstConfig = { dauM: 200, peakFactor: 3, retentionYears: 5, replication: 3, cacheHit: 90, qpsPerServer: 1000, hotPct: 20 };
const get = (key: string) => estimate(cfg, DRILLS[0].rows).outs.find((o) => o.key === key)!;

describe("estimation calculator", () => {
  it("computes QPS, storage, replication and servers with formulas", () => {
    expect(get("avg").value).toBeCloseTo((200e6 * 22) / 86_400, 3);
    expect(get("peak").value).toBeCloseTo((3 * 200e6 * 22) / 86_400, 3);
    expect(get("ratio").value).toBe(10);
    expect(get("day").value).toBe(200e6 * 2 * 300);
    expect(get("total").value).toBe(200e6 * 2 * 300 * 365 * 5 * 3);
    expect(get("servers").value).toBe(Math.ceil(get("peak").value / 1000));
    expect(get("peak").formula).toMatch(/× peak factor 3/);
    expect(get("dbReads").value).toBeCloseTo(((200e6 * 20) / 86_400) * 3 * 0.1, 3);
  });

  it("checks the claims in the drill write-ups", () => {
    const year = (id: string) => drillAnswer(DRILLS.find((d) => d.id === id)!, cfg).year;
    const day = (id: string) => year(id) / 365;
    expect(day("instagram")).toBe(100e12);
    expect(day("youtube")).toBe(250e12);
    expect(day("dropbox")).toBe(100e12);
    expect(year("shortener")).toBeCloseTo(182.5e9, -6);
    expect(Math.round(year("slack") / 1e12)).toBe(274);
    expect(Math.round(drillAnswer(DRILLS.find((d) => d.id === "whatsapp")!, cfg).outs.find((o) => o.key === "avg-send")!.value / 1000)).toBe(463);
    expect(Math.round(drillAnswer(DRILLS.find((d) => d.id === "uber")!, cfg).outs.find((o) => o.key === "avg-ping")!.value / 1000)).toBe(208);
  });

  it("accepts ±50% and parses suffixes", () => {
    expect(close(150, 100)).toBe(true);
    expect(close(49, 100)).toBe(false);
    expect(close(0, 100)).toBe(false);
    expect(parseNum("2.5M")).toBe(2.5e6);
    expect(parseNum("300k")).toBe(300e3);
    expect(parseNum("1,200")).toBe(1200);
    expect(parseNum("abc")).toBeNaN();
    expect(fmtBytes(43.8e12)).toBe("43.8 TB");
  });

  it("drills: a good estimate passes, a 10× miss fails, and challenges count them", () => {
    const s = new Simulation(estModel, cfg, 1);
    const pass = (i: number) => {
      const a = drillAnswer(DRILLS[i], cfg);
      s.act("openDrill", i);
      s.runFor(30_000);
      s.act("submit", { qps: a.peak * 1.3, tb: (a.year / 1e12) * 0.8, config: cfg });
    };
    s.act("openDrill", 0);
    s.act("submit", { qps: drillAnswer(DRILLS[0], cfg).peak * 10, tb: 1, config: cfg });
    expect(s.state.results.twitter.passed).toBe(false);
    for (let i = 0; i < 5; i++) pass(i);
    expect(s.state.passedThisRun).toBe(5);
    expect(challenges[0].done!(s.state)).toBe(true);
    expect(challenges[1].winCondition(s.metrics.history(), s.state).passed).toBe(true);
  });

  it("rows can be added, edited and removed (at least one stays)", () => {
    const s = new Simulation(estModel, cfg, 1);
    s.act("addRow");
    expect(s.state.rows).toHaveLength(3);
    s.act("row", { i: 2, patch: { count: 7 } });
    expect(s.state.rows[2].count).toBe(7);
    for (let i = 0; i < 5; i++) s.act("removeRow", 0);
    expect(s.state.rows).toHaveLength(1);
  });
});
