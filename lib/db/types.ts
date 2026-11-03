import type { LabLang } from "@/lib/labs/schema";

// Persisted user data (CLAUDE.md §4). Ids that come from content are namespaced "<sectionId>:<localId>".

export interface CheckpointState { checkpointId: string; done: boolean; updatedAt: string }
export interface SectionCompletion { sectionId: string; completedAt: string }
export interface QuizAnswer { questionId: string; selected: string[]; correct: boolean; topicId: string }
export interface QuizAttempt { id: string; sectionId: string; score: number; total: number; answers: QuizAnswer[]; startedAt: string; finishedAt: string }
export interface CardState { cardId: string; ease: number; interval: number; repetitions: number; due: string; lapses: number; reviewedAt?: string }
/** One grading event; feeds the daily new-card limit and the dashboard. */
export interface CardReview { id: string; cardId: string; grade: number; wasNew: boolean; at: string }
export interface ChallengeResult { simulatorId: string; challengeId: string; passed: boolean; bestValue: number; attempts: number; updatedAt: string }
export interface Note { id: string; pageId: string; markdown: string; updatedAt: string }
export interface Design { id: string; title: string; caseStudyId?: string; graph: unknown; panels: Record<string, string>; createdAt: string; updatedAt: string }
export interface InterviewAttempt { id: string; caseStudyId: string; durationSec: number; panels: Record<string, string>; selfScores: Record<string, number>; aiFeedback?: string; createdAt: string }
export interface StudySession { id: string; date: string; minutes: number; pageIds: string[] }
export interface TutorConversation { id: string; pageId: string; messages: { role: "user" | "assistant"; content: string }[]; updatedAt: string }
export interface AiUsage { month: string; requests: number; inputTokens: number; outputTokens: number; estimatedCost: number }
/** A learner's code for one lab in one language. id = `${labId}:${lang}`. */
export interface LabCode { id: string; labId: string; lang: LabLang; code: string; failedRuns: number; hintsShown: number; solutionShown: boolean; updatedAt: string }
export interface Settings {
  key: "settings";
  theme: "paper" | "blueprint" | "system";
  apiKey?: string;
  aiProvider?: string;
  aiModel?: string;
  reducedMotion: boolean;
  newCardsPerDay: number;
  planStart?: string;
  hoursPerWeek?: number;
}

export const DEFAULT_SETTINGS: Settings = { key: "settings", theme: "system", reducedMotion: false, newCardsPerDay: 20 };

export interface Tables {
  checkpoints: CheckpointState;
  completions: SectionCompletion;
  quizAttempts: QuizAttempt;
  cards: CardState;
  cardReviews: CardReview;
  challengeResults: ChallengeResult;
  notes: Note;
  designs: Design;
  interviewAttempts: InterviewAttempt;
  studySessions: StudySession;
  tutorConversations: TutorConversation;
  aiUsage: AiUsage;
  labCode: LabCode;
  settings: Settings;
}
export type TableName = keyof Tables;
