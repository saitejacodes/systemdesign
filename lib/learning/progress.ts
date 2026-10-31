import type { ChallengeResult, CheckpointState, QuizAttempt, SectionCompletion } from "@/lib/db/types";

/** What the client needs to know about a section to compute progress. */
export interface SectionInfo { id: string; phase: number; checkpointIds: string[]; simulatorIds: string[] }

export interface UserData {
  checkpoints: CheckpointState[];
  attempts: QuizAttempt[];
  challenges: ChallengeResult[];
  completions: SectionCompletion[];
}

/** simulatorId → its challenge ids, only for simulators that are actually registered. */
export type SimRegistry = Record<string, string[]>;

export interface SectionProgress {
  percent: number;
  checkpointsDone: number;
  checkpointsTotal: number;
  bestQuiz: number; // 0–1
  complete: boolean;
  newSimulator: boolean; // completed before its simulator existed and its challenges aren't done
}

export const cpKey = (sectionId: string, id: string) => `${sectionId}:${id}`;
export const COMPLETE_QUIZ = 0.8;

export function bestQuizScore(attempts: QuizAttempt[], sectionId: string) {
  return attempts.filter((a) => a.sectionId === sectionId && a.total > 0).reduce((m, a) => Math.max(m, a.score / a.total), 0);
}

/** Section is complete when all checkpoints are done and the best quiz is ≥ 80%. */
export function meetsCompletion(s: SectionInfo, data: Pick<UserData, "checkpoints" | "attempts">) {
  const done = new Set(data.checkpoints.filter((c) => c.done).map((c) => c.checkpointId));
  return s.checkpointIds.every((id) => done.has(cpKey(s.id, id))) && bestQuizScore(data.attempts, s.id) >= COMPLETE_QUIZ;
}

export function sectionProgress(s: SectionInfo, data: UserData, sims: SimRegistry): SectionProgress {
  const done = new Set(data.checkpoints.filter((c) => c.done).map((c) => c.checkpointId));
  const checkpointsDone = s.checkpointIds.filter((id) => done.has(cpKey(s.id, id))).length;
  const cp = s.checkpointIds.length ? checkpointsDone / s.checkpointIds.length : 1;
  const bestQuiz = bestQuizScore(data.attempts, s.id);

  // Simulator weight applies only once at least one of the section's simulators is registered.
  const challengeIds = s.simulatorIds.filter((id) => sims[id]).flatMap((id) => sims[id].map((c) => `${id}:${c}`));
  const passed = new Set(data.challenges.filter((c) => c.passed).map((c) => `${c.simulatorId}:${c.challengeId}`));
  const sim = challengeIds.length ? challengeIds.filter((k) => passed.has(k)).length / challengeIds.length : 0;

  const complete = data.completions.some((c) => c.sectionId === s.id);
  let percent: number;
  let newSimulator = false;
  if (challengeIds.length && !(complete && sim < 1)) {
    percent = cp * 0.4 + bestQuiz * 0.4 + sim * 0.2;
  } else {
    percent = cp * 0.5 + bestQuiz * 0.5;
    // Completed before the simulator existed: keep the old percentage, flag the new challenge.
    newSimulator = challengeIds.length > 0 && complete;
  }
  return { percent: Math.round(percent * 100), checkpointsDone, checkpointsTotal: s.checkpointIds.length, bestQuiz, complete, newSimulator };
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export function phaseProgress(sections: SectionInfo[], data: UserData, sims: SimRegistry) {
  const byPhase: Record<number, number> = {};
  for (let p = 1; p <= 7; p++) byPhase[p] = avg(sections.filter((s) => s.phase === p).map((s) => sectionProgress(s, data, sims).percent));
  return byPhase;
}

export const overallProgress = (sections: SectionInfo[], data: UserData, sims: SimRegistry) =>
  avg(sections.map((s) => sectionProgress(s, data, sims).percent));
