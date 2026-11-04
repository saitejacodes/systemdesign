import { FRAMEWORK_HEADINGS } from "@/lib/studio/notes";

/** The 7 framework steps (CLAUDE.md §10); rubric criteria use the same names in `step`. */
export const STEPS = FRAMEWORK_HEADINGS;
export type Step = (typeof STEPS)[number];

export type Mode = "practice" | "mock";
export const DURATIONS = [30, 45, 60] as const;
export type DurationMin = (typeof DURATIONS)[number];

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export interface Endpoint { method: (typeof HTTP_METHODS)[number]; path: string; request: string; response: string }

export const KEY_ROLES = ["", "primary", "partition", "sort"] as const;
export interface Field { name: string; type: string; key: (typeof KEY_ROLES)[number] }
export interface Entity { name: string; fields: Field[] }

export const DB_CHOICES = ["", "Relational (SQL)", "Key-value", "Wide-column", "Document", "Graph", "Search index", "Time-series", "Object storage"] as const;

/** Inputs of the mini estimation calculator. */
export interface EstimationInput { dauM: number; actionsPerDay: number; readsPerWrite: number; itemBytes: number; retentionYears: number; peakFactor: number }
export const DEFAULT_ESTIMATION: EstimationInput = { dauM: 10, actionsPerDay: 10, readsPerWrite: 10, itemBytes: 1_000, retentionYears: 5, peakFactor: 3 };

/**
 * Everything one attempt records. Stored as the draft while the interview runs (Dexie `interviewDrafts`) and, on save,
 * serialized into InterviewAttempt.panels.session. Time is wall-clock based so a reload (or a closed tab) keeps counting
 * in Mock mode; only Practice can pause.
 */
export interface InterviewSession {
  version: 1;
  caseStudyId: string;
  /** The Design Studio design this attempt draws in (Design.panels.interviewCaseId = caseStudyId). */
  designId: string;
  mode: Mode;
  durationMin: DurationMin;
  hintsOn: boolean;
  phase: "session" | "review";
  startedAt: string;
  activeStep: Step;
  /** Time spent with each step open while the clock ran, ms (the current segment is not included until it is flushed). */
  stepMs: Record<Step, number>;
  /** Epoch ms the current running segment began; null while paused or submitted. */
  since: number | null;
  /** Elapsed ms at which the learner first opened Deep Dives; questions start then if that is before the scheduled window. */
  deepDivesOpenedAt: number | null;
  /** Extra deep-dive questions revealed on request (Practice). */
  deepDivesRequested: number;
  requirements: { functional: string[]; nonFunctional: string[]; asked: number[] };
  estimation: EstimationInput;
  api: Endpoint[];
  dataModel: { entities: Entity[]; db: (typeof DB_CHOICES)[number]; justification: string };
  /** Answer per deep-dive question index. */
  deepDiveAnswers: Record<number, string>;
  highLevel: string;
  wrapUp: string;
  /** Hints revealed per step (0–2). */
  hints: Record<Step, number>;
  selfScores: Record<string, number>;
  mistakesChecked: number[];
  submittedAt?: string;
  /** Total elapsed ms at submit. */
  elapsedAtSubmit?: number;
  /** AI interviewer (optional, Prompt 21): present when chosen at start. */
  ai?: AiInterview;
}

/** What the AI interviewer added to an attempt. Feedback never replaces self-scores; it is shown beside them. */
export interface AiInterview {
  on: boolean;
  /** Free-text clarifying questions and the interviewer's in-character answers. */
  asks: { q: string; a: string }[];
  /** Deep-dive questions generated from the learner's design, with the learner's answers. */
  followUps: { q: string; a: string }[];
  feedback?: AiScoring;
}
export interface AiScoring { scores: { id: string; score: number; justification: string }[]; improvements: string[]; model: string }

export const zeroSteps = (): Record<Step, number> => Object.fromEntries(STEPS.map((s) => [s, 0])) as Record<Step, number>;
