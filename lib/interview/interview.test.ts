import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DexieAdapter, LabDb } from "@/lib/db/adapter";
import type { StudioGraph } from "@/lib/studio/types";
import { runDesign } from "./compare";
import { miniEstimate } from "./estimate";
import { stepHints } from "./hints";
import { groupByStep, scoreTotal } from "./scoring";
import { fromAttempt, newSession, parseSession, submit, toAttempt } from "./session";
import { discardDraft, loadDraft, saveAttempt, saveDraft, startAttempt } from "./store";
import { elapsedMs, formatClock, minuteMark, pause, resume, revealedCount, revealSchedule, splitTime, stepElapsed, stepWindows, switchStep } from "./timing";
import { STEPS, zeroSteps } from "./types";

vi.mock("server-only", () => ({}));

const MIN = 60_000;

describe("time split", () => {
  it("uses 5/5/5/5/10/10/5 for 45 minutes and scales to exact totals", () => {
    expect(Object.values(splitTime(45))).toEqual([5, 5, 5, 5, 10, 10, 5]);
    expect(Object.values(splitTime(30))).toEqual([4, 3, 3, 3, 7, 7, 3]);
    expect(Object.values(splitTime(60))).toEqual([7, 7, 7, 7, 13, 13, 6]);
    for (const d of [30, 45, 60]) expect(Object.values(splitTime(d)).reduce((a, b) => a + b, 0)).toBe(d);
  });

  it("lays the steps end to end", () => {
    const w = stepWindows(45);
    expect(w.Requirements).toEqual({ startMs: 0, endMs: 5 * MIN });
    expect(w["Deep Dives"]).toEqual({ startMs: 30 * MIN, endMs: 40 * MIN });
    expect(w["Wrap-up"].endMs).toBe(45 * MIN);
  });
});

describe("deep-dive reveal schedule", () => {
  it("spaces questions evenly over the Deep Dives window, the first at its start", () => {
    expect(revealSchedule(4, 45)).toEqual([30, 32.5, 35, 37.5].map((m) => m * MIN));
    expect(revealedCount(4, 45, 29 * MIN, null)).toBe(0);
    expect(revealedCount(4, 45, 30 * MIN, null)).toBe(1);
    expect(revealedCount(4, 45, 36 * MIN, null)).toBe(3);
    expect(revealedCount(4, 45, 44 * MIN, null)).toBe(4);
  });

  it("starts early if Deep Dives is opened early, and honours requests up to the total", () => {
    expect(revealSchedule(3, 30, 10 * MIN)[0]).toBe(10 * MIN);
    expect(revealedCount(3, 30, 10 * MIN, 10 * MIN)).toBe(1);
    expect(revealedCount(3, 30, 0, null, 2)).toBe(2);
    expect(revealedCount(3, 30, 0, null, 9)).toBe(3);
  });
});

describe("clock", () => {
  const start = { activeStep: "Requirements" as const, stepMs: zeroSteps(), since: 1_000 };
  it("accumulates time per step and stops while paused", () => {
    let c = switchStep(start, "Estimation", 61_000);
    expect(c.stepMs.Requirements).toBe(60_000);
    expect(stepElapsed(c, "Estimation", 91_000)).toBe(30_000);
    c = pause(c, 91_000);
    expect(elapsedMs(c, 500_000)).toBe(90_000);
    c = resume(c, 500_000);
    expect(elapsedMs(c, 510_000)).toBe(100_000);
  });

  it("formats the countdown and overtime, and summarises once a minute", () => {
    expect(formatClock(45 * MIN)).toBe("45:00");
    expect(formatClock(249_100)).toBe("04:10");
    expect(formatClock(-133_400)).toBe("+02:13");
    expect(minuteMark(4 * MIN + 1)).toBe("5 minutes remaining.");
    expect(minuteMark(59_000)).toBe("1 minute remaining.");
    expect(minuteMark(-61_000)).toMatch(/Time is up/);
  });
});

const rubric = {
  criteria: [
    { id: "a", step: "Requirements" as const, title: "A", levels: { "0": "x", "1": "y", "2": "z" } },
    { id: "b", step: "API" as const, title: "B", levels: { "0": "x", "1": "y", "2": "z" } },
    { id: "c", step: "Requirements" as const, title: "C", levels: { "0": "x", "1": "y", "2": "z" } },
  ],
};

describe("score totals", () => {
  it("sums 0–2 scores, ignores unknown ids, and charges hints only in Mock", () => {
    const hints = { ...zeroSteps(), API: 2 };
    expect(scoreTotal(rubric, { a: 2, b: 1, zz: 2 }, "practice", hints)).toEqual({ raw: 3, max: 6, scored: 2, hintPenalty: 0, pct: 50 });
    expect(scoreTotal(rubric, { a: 2, b: 1 }, "mock", hints)).toMatchObject({ hintPenalty: 2, pct: 17 });
    expect(scoreTotal(rubric, {}, "mock", { ...zeroSteps(), API: 2 }).pct).toBe(0);
    expect(scoreTotal(null, {}, "practice", zeroSteps()).pct).toBe(0);
  });

  it("groups criteria by step in framework order", () => {
    expect(groupByStep(rubric).map((g) => [g.step, g.criteria.map((c) => c.id)])).toEqual([["Requirements", ["a", "c"]], ["API", ["b"]]]);
  });
});

describe("attempt serialization", () => {
  it("round-trips every step's data through InterviewAttempt", () => {
    let s = newSession({ caseStudyId: "fixture-kv-store", designId: "d-1", mode: "mock", durationMin: 30, hintsOn: true }, 0);
    s = { ...s, requirements: { functional: ["read a session"], nonFunctional: ["p99 < 10 ms"], asked: [0, 3] }, api: [{ method: "GET", path: "/sessions/current", request: "token header", response: "200" }], hints: { ...s.hints, API: 1 }, selfScores: { a: 2 } };
    s = submit(s, 12 * MIN);
    expect(s.phase).toBe("review");
    expect(s.since).toBeNull();
    expect(s.elapsedAtSubmit).toBe(12 * MIN);
    expect(s.stepMs.Requirements).toBe(12 * MIN);
    const graph = { version: 1, nodes: [], edges: [] };
    const a = toAttempt(s, { graph, notes: "## Notes" }, "ia-1", new Date("2026-11-04T10:00:00Z"));
    expect(a).toMatchObject({ id: "ia-1", caseStudyId: "fixture-kv-store", durationSec: 720, selfScores: { a: 2 }, createdAt: "2026-11-04T10:00:00.000Z" });
    expect(Object.values(a.panels).every((v) => typeof v === "string")).toBe(true);
    const back = fromAttempt(JSON.parse(JSON.stringify(a)));
    expect(back?.session).toEqual(s);
    expect(back?.graph).toEqual(graph);
    expect(back?.notes).toBe("## Notes");
  });

  it("rejects a corrupted session", () => {
    expect(parseSession({ version: 1 })).toBeNull();
    expect(fromAttempt({ id: "x", caseStudyId: "c", durationSec: 1, panels: { session: "{oops" }, selfScores: {}, createdAt: "" })).toBeNull();
  });
});

describe("persistence", () => {
  let db: DexieAdapter;
  beforeEach(() => { db = new DexieAdapter(new LabDb(`iv-${Math.random()}`)); });

  it("starts an attempt with a design marked for the case, resumes the draft, and saves the attempt", async () => {
    const s = await startAttempt({ caseStudyId: "url-shortener", caseTitle: "URL shortener", interviewerPrompt: "Design a URL shortener.", mode: "practice", durationMin: 45, hintsOn: true }, db);
    const design = await db.get("designs", s.designId);
    expect(design?.panels.interviewCaseId).toBe("url-shortener");
    expect(design?.panels.templateId).toBe("url-shortener");
    expect(design?.panels.notes).toMatch(/^Design a URL shortener\.\n\n## Requirements/);
    expect((design?.graph as { nodes: unknown[] }).nodes.length).toBeGreaterThan(0);
    expect(await loadDraft("url-shortener", db)).toEqual(s);
    await saveDraft({ ...s, wrapUp: "cache first" }, db);
    expect((await loadDraft("url-shortener", db))?.wrapUp).toBe("cache first");
    const a = await saveAttempt(submit(s), db);
    expect(await db.get("interviewAttempts", a.id)).toBeTruthy();
    expect(await loadDraft("url-shortener", db)).toBeNull();
    await discardDraft("none", db);
  });

  it("starts from a blank canvas when the case has no Studio template", async () => {
    const s = await startAttempt({ caseStudyId: "fixture-kv-store", caseTitle: "KV", interviewerPrompt: "P", mode: "mock", durationMin: 30, hintsOn: false }, db);
    expect((await db.get("designs", s.designId))?.graph).toEqual({ version: 1, nodes: [], edges: [] });
  });
});

describe("fixture case (SDL_FIXTURE_CASES=1)", () => {
  beforeEach(() => { vi.stubEnv("SDL_FIXTURE_CASES", "1"); vi.resetModules(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("loads meta, solution, rubric and design, and is hidden without the flag", async () => {
    const { getCaseStudy } = await import("@/lib/content");
    const c = getCaseStudy("fixture-kv-store");
    expect(c?.meta.title).toBe("Session key-value store");
    expect(c?.solution).toMatch(/## Requirements/);
    expect(c?.rubric?.criteria.length).toBeGreaterThanOrEqual(10);
    expect(new Set(c?.rubric?.criteria.map((x) => x.step))).toEqual(new Set(STEPS));
    expect(c?.design?.nodes.length).toBe(5);
    vi.stubEnv("SDL_FIXTURE_CASES", "");
    expect(getCaseStudy("fixture-kv-store")).toBeUndefined();
  });

  it("its reference design passes its run challenge and beats a single-server design", async () => {
    const { getCaseStudy } = await import("@/lib/content");
    const c = getCaseStudy("fixture-kv-store")!;
    const ref = runDesign(c.design!, c.meta.trafficProfile, c.meta.runChallenge);
    expect(ref.challenge.passed).toBe(true);
    expect(ref.peak.spofs).toBe(0);
    const weak: StudioGraph = {
      version: 1,
      nodes: [
        { id: "u", kind: "client", x: 0, y: 0, label: "Users", props: { users: 5_000_000, platform: "web" } },
        { id: "s", kind: "service", x: 200, y: 0, label: "API", props: { instances: 1, capacityQps: 500, latencyMs: 20 } },
        { id: "k", kind: "nosql-db", x: 400, y: 0, label: "KV", props: { nodes: 1, capacityQps: 10_000, latencyMs: 5 } },
      ],
      edges: [{ id: "e1", source: "u", target: "s", kind: "sync", direction: "forward" }, { id: "e2", source: "s", target: "k", kind: "sync", direction: "forward" }],
    };
    const w = runDesign(weak, c.meta.trafficProfile, c.meta.runChallenge);
    expect(w.challenge.passed).toBe(false);
    expect(w.peak.errorRatePct).toBeGreaterThan(ref.peak.errorRatePct);
  });

  it("derives two hints per step from the case meta", async () => {
    const { getCaseStudy } = await import("@/lib/content");
    const meta = getCaseStudy("fixture-kv-store")!.meta;
    for (const step of STEPS) {
      const h = stepHints(meta, step);
      expect(h).toHaveLength(2);
      for (const t of h) expect(t.length).toBeGreaterThan(20);
    }
    expect(stepHints(meta, "Requirements", [0, 1])[0]).toContain(meta.clarifyingQuestions[2].question);
  });
});

describe("mini estimate", () => {
  it("splits actions by the read:write ratio and reuses the estimation calculator", () => {
    const r = miniEstimate({ dauM: 8.64, actionsPerDay: 11, readsPerWrite: 10, itemBytes: 1_000, retentionYears: 1, peakFactor: 3 });
    expect(r.avgQps).toBeCloseTo(1_100);
    expect(r.peakQps).toBeCloseTo(3_300);
    expect(r.totalBytes).toBeCloseTo(8.64e6 * 1 * 1_000 * 365);
  });
});
