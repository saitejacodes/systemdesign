import type { CardState } from "@/lib/db/types";

/** Buttons → SM-2 quality grades (Prompt 03). */
export const GRADES = { again: 1, hard: 3, good: 4, easy: 5 } as const;
export type Grade = (typeof GRADES)[keyof typeof GRADES];

export const MIN_EASE = 1.3;
const DAY = 86_400_000;

export function newCard(cardId: string, now = new Date()): CardState {
  return { cardId, ease: 2.5, interval: 0, repetitions: 0, due: now.toISOString(), lapses: 0 };
}

/**
 * Classic SM-2 (Wozniak 1987). On q < 3 the card restarts (repetitions 0, interval 1 day) and,
 * as in the original algorithm, the ease factor is left unchanged.
 */
export function review(card: CardState, q: number, now = new Date()): CardState {
  if (q < 3) {
    return { ...card, repetitions: 0, interval: 1, lapses: card.lapses + 1, due: new Date(now.getTime() + DAY).toISOString(), reviewedAt: now.toISOString() };
  }
  const ease = Math.max(MIN_EASE, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const repetitions = card.repetitions + 1;
  const interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(card.interval * ease);
  return { ...card, ease, repetitions, interval, due: new Date(now.getTime() + interval * DAY).toISOString(), reviewedAt: now.toISOString() };
}

export const endOfDay = (d = new Date()) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };
export const isDue = (c: CardState, now = new Date()) => new Date(c.due) <= endOfDay(now);

/** new = never graded; learning = graded, interval ≤ 6 days; review = longer intervals. */
export function cardStage(c: CardState): "new" | "learning" | "review" {
  if (!c.reviewedAt) return "new";
  return c.interval <= 6 ? "learning" : "review";
}
