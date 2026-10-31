import type { StudySession } from "@/lib/db/types";
import { dayKey } from "./plan";

export const STREAK_MINUTES = 10;

/**
 * Consecutive days with ≥ 10 active minutes, ending today. Today not yet reaching 10 minutes
 * doesn't break the streak; it just isn't counted until it does.
 */
export function streak(sessions: Pick<StudySession, "date" | "minutes">[], now = new Date()) {
  const mins = new Map<string, number>();
  for (const s of sessions) mins.set(s.date, (mins.get(s.date) ?? 0) + s.minutes);
  const ok = (offset: number) => (mins.get(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset))) ?? 0) >= STREAK_MINUTES;
  let n = 0;
  let i = ok(0) ? 0 : 1;
  while (ok(i)) { n++; i++; }
  return n;
}
