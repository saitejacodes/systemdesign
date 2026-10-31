import { describe, expect, it } from "vitest";
import type { QuizAttempt } from "@/lib/db/types";
import { overallProgress, phaseProgress, sectionProgress, type SectionInfo, type UserData } from "./progress";
import { weakSpots } from "./weakspots";

const s: SectionInfo = { id: "p1-a", phase: 1, checkpointIds: ["c1", "c2", "c3", "c4"], simulatorIds: ["lb"] };
const t = "2026-01-01T00:00:00.000Z";
const empty: UserData = { checkpoints: [], attempts: [], challenges: [], completions: [] };
const attempt = (score: number, total = 10, finishedAt = t, answers: QuizAttempt["answers"] = []): QuizAttempt => ({ id: finishedAt + score, sectionId: "p1-a", score, total, answers, startedAt: t, finishedAt });
const cps = (n: number) => Array.from({ length: n }, (_, i) => ({ checkpointId: `p1-a:c${i + 1}`, done: true, updatedAt: t }));

describe("progress", () => {
  it("splits 50/50 when no simulator is registered", () => {
    const p = sectionProgress(s, { ...empty, checkpoints: cps(2), attempts: [attempt(6)] }, {});
    expect(p.percent).toBe(Math.round(0.5 * 50 + 0.6 * 50));
    expect(p.checkpointsDone).toBe(2);
  });

  it("uses 40/40/20 once a simulator is registered", () => {
    const data = { ...empty, checkpoints: cps(4), attempts: [attempt(10)], challenges: [{ simulatorId: "lb", challengeId: "x", passed: true, bestValue: 1, attempts: 1, updatedAt: t }] };
    expect(sectionProgress(s, data, { lb: ["x", "y"] }).percent).toBe(90);
  });

  it("keeps a completed section complete when a simulator is added later, with a badge", () => {
    const data = { ...empty, checkpoints: cps(4), attempts: [attempt(9)], completions: [{ sectionId: "p1-a", completedAt: t }] };
    const before = sectionProgress(s, data, {});
    const after = sectionProgress(s, data, { lb: ["x", "y"] });
    expect(after.complete).toBe(true);
    expect(after.newSimulator).toBe(true);
    expect(after.percent).toBe(before.percent);
    // Once its challenges are passed, the badge goes and the full weighting applies.
    const passedAll = { ...data, challenges: ["x", "y"].map((c) => ({ simulatorId: "lb", challengeId: c, passed: true, bestValue: 1, attempts: 1, updatedAt: t })) };
    expect(sectionProgress(s, passedAll, { lb: ["x", "y"] })).toMatchObject({ newSimulator: false, percent: 96 });
  });

  it("averages per phase and overall", () => {
    const other: SectionInfo = { id: "p2-b", phase: 2, checkpointIds: ["c1"], simulatorIds: [] };
    const data = { ...empty, checkpoints: cps(4), attempts: [attempt(10)] };
    expect(phaseProgress([s, other], data, {})).toMatchObject({ 1: 100, 2: 0, 3: 0 });
    expect(overallProgress([s, other], data, {})).toBe(50);
  });
});

describe("weak spots", () => {
  const sec = { ...s, week: 1 };
  const ans = (topicId: string, correct: boolean) => ({ questionId: "q", selected: ["a"], correct, topicId });

  it("flags topics under 70% across the last two attempts only", () => {
    const old = attempt(0, 2, "2026-01-01T00:00:00Z", [ans("dns", false), ans("dns", false)]);
    const a1 = attempt(1, 2, "2026-01-02T00:00:00Z", [ans("dns", true), ans("tcp", false)]);
    const a2 = attempt(1, 2, "2026-01-03T00:00:00Z", [ans("dns", true), ans("tcp", true)]);
    const ws = weakSpots([sec], [old, a1, a2], []);
    expect(ws).toEqual([{ kind: "topic", sectionId: "p1-a", topicId: "tcp", accuracy: 0.5, answered: 2 }]);
  });

  it("flags untouched sections 14+ days after their week", () => {
    const planStart = new Date("2026-01-01T00:00:00Z");
    expect(weakSpots([sec], [], [], { planStart, now: new Date("2026-01-20T00:00:00Z") })).toEqual([]);
    expect(weakSpots([sec], [], [], { planStart, now: new Date("2026-01-22T00:00:00Z") })).toEqual([{ kind: "stale-section", sectionId: "p1-a", daysPastWeek: 14 }]);
    expect(weakSpots([sec], [], [{ checkpointId: "p1-a:c1", done: false, updatedAt: t }], { planStart, now: new Date("2026-02-22T00:00:00Z") })).toEqual([]);
  });
});
