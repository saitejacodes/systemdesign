import { z } from "zod";
import type { InterviewAttempt } from "@/lib/db/types";
import { StudioGraph } from "@/lib/studio/types";
import { DB_CHOICES, DEFAULT_ESTIMATION, DURATIONS, HTTP_METHODS, KEY_ROLES, STEPS, zeroSteps, type DurationMin, type InterviewSession, type Mode } from "./types";
import { elapsedMs, flush } from "./timing";

const steps = <T extends z.ZodType>(v: T) => z.object(Object.fromEntries(STEPS.map((s) => [s, v])) as Record<(typeof STEPS)[number], T>);
const nn = z.number().finite().min(0);

/** Validates a stored session (draft or attempt), so corrupted or older rows show an error instead of crashing. */
export const SessionSchema = z.object({
  version: z.literal(1),
  caseStudyId: z.string().min(1),
  designId: z.string().min(1),
  mode: z.enum(["practice", "mock"]),
  durationMin: z.union(DURATIONS.map((d) => z.literal(d)) as [z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>]),
  hintsOn: z.boolean(),
  phase: z.enum(["session", "review"]),
  startedAt: z.string(),
  activeStep: z.enum(STEPS),
  stepMs: steps(nn),
  since: nn.nullable(),
  deepDivesOpenedAt: nn.nullable(),
  deepDivesRequested: z.number().int().min(0),
  requirements: z.object({ functional: z.array(z.string()), nonFunctional: z.array(z.string()), asked: z.array(z.number().int().min(0)) }),
  estimation: z.object({ dauM: nn, actionsPerDay: nn, readsPerWrite: nn, itemBytes: nn, retentionYears: nn, peakFactor: nn }),
  api: z.array(z.object({ method: z.enum(HTTP_METHODS), path: z.string(), request: z.string(), response: z.string() })),
  dataModel: z.object({
    entities: z.array(z.object({ name: z.string(), fields: z.array(z.object({ name: z.string(), type: z.string(), key: z.enum(KEY_ROLES) })) })),
    db: z.enum(DB_CHOICES),
    justification: z.string(),
  }),
  deepDiveAnswers: z.record(z.string(), z.string()),
  highLevel: z.string(),
  wrapUp: z.string(),
  hints: steps(z.number().int().min(0).max(2)),
  selfScores: z.record(z.string(), z.number().int().min(0).max(2)),
  mistakesChecked: z.array(z.number().int().min(0)),
  submittedAt: z.string().optional(),
  elapsedAtSubmit: nn.optional(),
});

export function parseSession(v: unknown): InterviewSession | null {
  const r = SessionSchema.safeParse(v);
  return r.success ? (r.data as unknown as InterviewSession) : null;
}

export function newSession(o: { caseStudyId: string; designId: string; mode: Mode; durationMin: DurationMin; hintsOn: boolean }, now = Date.now()): InterviewSession {
  return {
    version: 1,
    ...o,
    phase: "session",
    startedAt: new Date(now).toISOString(),
    activeStep: "Requirements",
    stepMs: zeroSteps(),
    since: now,
    deepDivesOpenedAt: null,
    deepDivesRequested: 0,
    requirements: { functional: [], nonFunctional: [], asked: [] },
    estimation: { ...DEFAULT_ESTIMATION },
    api: [],
    dataModel: { entities: [], db: "", justification: "" },
    deepDiveAnswers: {},
    highLevel: "",
    wrapUp: "",
    hints: zeroSteps(),
    selfScores: {},
    mistakesChecked: [],
  };
}

/** Stops the clock and moves to self-review. */
export function submit(s: InterviewSession, now = Date.now()): InterviewSession {
  if (s.phase === "review") return s;
  const elapsed = elapsedMs(s, now);
  return { ...flush(s, now, true), phase: "review", submittedAt: new Date(now).toISOString(), elapsedAtSubmit: elapsed };
}

/** The saved attempt. panels: session = every step's data as JSON, graph = the learner's design, notes = its Notes tab. */
export function toAttempt(s: InterviewSession, design: { graph: unknown; notes: string }, id: string, now = new Date()): InterviewAttempt {
  return {
    id,
    caseStudyId: s.caseStudyId,
    durationSec: Math.round((s.elapsedAtSubmit ?? STEPS.reduce((a, k) => a + s.stepMs[k], 0)) / 1000),
    panels: { session: JSON.stringify(s), graph: JSON.stringify(design.graph), notes: design.notes, mode: s.mode },
    selfScores: { ...s.selfScores },
    createdAt: now.toISOString(),
  };
}

export interface AttemptView { session: InterviewSession; graph: StudioGraph | null; notes: string }

/** Reads an attempt back for the read-only review; null if its session JSON is unreadable. */
export function fromAttempt(a: InterviewAttempt): AttemptView | null {
  const json = (t: string | undefined) => { try { return t ? JSON.parse(t) : undefined; } catch { return undefined; } };
  const session = parseSession(json(a.panels.session));
  if (!session) return null;
  const g = StudioGraph.safeParse(json(a.panels.graph));
  return { session: { ...session, selfScores: { ...session.selfScores, ...a.selfScores } }, graph: g.success ? g.data : null, notes: a.panels.notes ?? "" };
}
