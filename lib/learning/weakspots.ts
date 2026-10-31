import type { CheckpointState, QuizAttempt } from "@/lib/db/types";
import { cpKey, type SectionInfo } from "./progress";

export type WeakSpot =
  | { kind: "topic"; sectionId: string; topicId: string; accuracy: number; answered: number }
  | { kind: "stale-section"; sectionId: string; daysPastWeek: number };

const DAY = 86_400_000;

/**
 * Topics with < 70% accuracy over a section's last 2 quiz attempts, and sections whose
 * checkpoints are untouched 14+ days after their plan week ended (needs a plan start date).
 */
export function weakSpots(
  sections: (SectionInfo & { week: number })[],
  attempts: QuizAttempt[],
  checkpoints: CheckpointState[],
  opts: { planStart?: Date; now?: Date } = {},
): WeakSpot[] {
  const out: WeakSpot[] = [];
  for (const s of sections) {
    const last2 = attempts.filter((a) => a.sectionId === s.id).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, 2);
    const byTopic = new Map<string, { right: number; n: number }>();
    for (const ans of last2.flatMap((a) => a.answers)) {
      const t = byTopic.get(ans.topicId) ?? { right: 0, n: 0 };
      t.n++;
      if (ans.correct) t.right++;
      byTopic.set(ans.topicId, t);
    }
    for (const [topicId, { right, n }] of byTopic) if (right / n < 0.7) out.push({ kind: "topic", sectionId: s.id, topicId, accuracy: right / n, answered: n });
  }

  if (opts.planStart) {
    const now = opts.now ?? new Date();
    const touched = new Set(checkpoints.map((c) => c.checkpointId));
    for (const s of sections) {
      const weekEnd = opts.planStart.getTime() + s.week * 7 * DAY;
      const daysPastWeek = Math.floor((now.getTime() - weekEnd) / DAY);
      if (daysPastWeek >= 14 && s.checkpointIds.length && !s.checkpointIds.some((id) => touched.has(cpKey(s.id, id)))) out.push({ kind: "stale-section", sectionId: s.id, daysPastWeek });
    }
  }
  return out.sort((a, b) => (a.kind === "topic" ? a.accuracy : 1) - (b.kind === "topic" ? b.accuracy : 1));
}
