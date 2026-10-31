import { getAdapter } from "@/lib/db/adapter";
import { meetsCompletion, type SectionInfo } from "./progress";

/** Writes a SectionCompletion the first time a section meets the bar; never removes one. */
export async function checkCompletion(s: SectionInfo) {
  const db = getAdapter();
  if (await db.get("completions", s.id)) return;
  const [checkpoints, attempts] = await Promise.all([db.all("checkpoints"), db.where("quizAttempts", "sectionId", s.id)]);
  if (meetsCompletion(s, { checkpoints, attempts })) await db.put("completions", { sectionId: s.id, completedAt: new Date().toISOString() });
}
