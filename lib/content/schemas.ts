import { z } from "zod";
import { FRAMEWORK_HEADINGS } from "@/lib/studio/notes";
import { RunChallenge, TrafficProfile } from "@/lib/studio/sim/types";

// Zod versions of the CLAUDE.md §4 content types.
export const Depth = z.enum(["deep", "tradeoffs", "awareness"]);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase-kebab id");

export const SectionMeta = z.strictObject({
  id,
  phase: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
  slug: id,
  title: z.string().min(1),
  order: z.number().int().positive(),
  week: z.number().int().min(1).max(16),
  estimatedMinutes: z.number().int().positive(),
  topics: z.array(z.strictObject({ id, title: z.string().min(1), depth: Depth })).min(1),
  simulatorIds: z.array(id),
  practiceCaseStudyIds: z.array(id),
  prerequisites: z.array(id),
});

export const QuizQuestion = z
  .strictObject({
    id,
    type: z.enum(["single", "multi", "scenario"]),
    prompt: z.string().min(1),
    scenario: z.string().optional(),
    options: z.array(z.strictObject({ id: z.string().min(1), text: z.string().min(1) })).min(2),
    correct: z.array(z.string()).min(1),
    explanation: z.string().min(20),
    topicId: id,
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .superRefine((q, ctx) => {
    const ids = new Set(q.options.map((o) => o.id));
    for (const c of q.correct) if (!ids.has(c)) ctx.addIssue({ code: "custom", path: ["correct"], message: `"${c}" is not an option id` });
    if (q.type !== "multi" && q.correct.length !== 1) ctx.addIssue({ code: "custom", path: ["correct"], message: `${q.type} questions need exactly one correct option` });
    if (q.type === "scenario" && !q.scenario) ctx.addIssue({ code: "custom", path: ["scenario"], message: "scenario questions need a scenario" });
  });
export const Quiz = z.array(QuizQuestion);

export const Flashcard = z.strictObject({ id, front: z.string().min(1), back: z.string().min(1), topicId: id });
export const Flashcards = z.array(Flashcard);

export const Checkpoint = z.strictObject({ id, text: z.string().min(1), topicId: id });
export const Checkpoints = z.array(Checkpoint);

export const Resource = z.strictObject({
  id,
  title: z.string().min(1),
  author: z.string().optional(),
  kind: z.enum(["book", "free-book", "docs", "blog", "paper", "video", "repo"]),
  url: z.url(),
  why: z.string().min(1),
  topicIds: z.array(id),
  free: z.boolean(),
});
export const Resources = z.array(Resource);

export const GlossaryTerm = z.strictObject({ term: z.string().min(1), slug: id, definition: z.string().min(1), sectionId: id });
export const Glossary = z.array(GlossaryTerm);

export const PlanWeek = z.strictObject({
  week: z.number().int().min(1).max(16),
  title: z.string().min(1),
  focus: z.string().min(1),
  sectionIds: z.array(id),
  simulatorChallengeIds: z.array(z.string()),
  caseStudyIds: z.array(id),
  deliverable: z.string().min(1),
  estimatedHours: z.number().positive(),
});
export const Plan = z.array(PlanWeek);

export const CaseStudyMeta = z.strictObject({
  id,
  title: z.string().min(1),
  /** One line for lists and search. */
  summary: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  weekRecommended: z.number().int().min(1).max(16),
  relatedSectionIds: z.array(id).min(1),
  /** 2–4 sentences, deliberately underspecified like a real interview. */
  interviewerPrompt: z.string().min(1),
  clarifyingQuestions: z.array(z.strictObject({ question: z.string().min(1), answer: z.string().min(1) })).min(8).max(12),
  deepDiveQuestions: z.array(z.string().min(1)).min(3).max(5),
  trafficProfile: TrafficProfile,
  runChallenge: RunChallenge,
  commonMistakes: z.array(z.string().min(1)).min(5).max(8),
});

/** Self-review rubric (Interview Mode): 10–14 criteria grouped by framework step, each scored 0 / 1 / 2. */
export const Rubric = z.strictObject({
  criteria: z.array(z.strictObject({
    id,
    step: z.enum(FRAMEWORK_HEADINGS),
    title: z.string().min(1),
    levels: z.strictObject({ "0": z.string().min(1), "1": z.string().min(1), "2": z.string().min(1) }),
  })).min(10).max(14),
});
export type Rubric = z.infer<typeof Rubric>;

export type SectionMeta = z.infer<typeof SectionMeta>;
export type QuizQuestion = z.infer<typeof QuizQuestion>;
export type Flashcard = z.infer<typeof Flashcard>;
export type Checkpoint = z.infer<typeof Checkpoint>;
export type Resource = z.infer<typeof Resource>;
export type GlossaryTerm = z.infer<typeof GlossaryTerm>;
export type PlanWeek = z.infer<typeof PlanWeek>;
export type CaseStudyMeta = z.infer<typeof CaseStudyMeta>;
export type Depth = z.infer<typeof Depth>;
