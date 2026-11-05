"use client";
import { useCompletions } from "@/lib/db/hooks";
import { PhasePath } from "./index";

/**
 * The landing page's path, with the learner's current phase lit: the phase of the first section (in course order)
 * they have not completed. A new learner sees Phase 1; someone who finished everything sees Phase 7.
 */
export function CurrentPhasePath({ sections }: { sections: { id: string; phase: number }[] }) {
  const done = new Set((useCompletions() ?? []).map((c) => c.sectionId));
  const next = sections.find((s) => !done.has(s.id));
  return <PhasePath active={next?.phase ?? 7} />;
}
