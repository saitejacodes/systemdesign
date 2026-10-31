"use client";
import { getAdapter } from "@/lib/db/adapter";
import { useCheckpoints, useCompletions } from "@/lib/db/hooks";
import type { Checkpoint } from "@/lib/content/schemas";
import { checkCompletion } from "@/lib/learning/completion";
import { cpKey, type SectionInfo } from "@/lib/learning/progress";

export function CheckpointList({ section, items }: { section: SectionInfo; items: Checkpoint[] }) {
  const states = useCheckpoints();
  const completions = useCompletions();
  const done = new Set(states?.filter((c) => c.done).map((c) => c.checkpointId));
  const count = items.filter((c) => done.has(cpKey(section.id, c.id))).length;
  const complete = completions?.some((c) => c.sectionId === section.id);

  const toggle = async (id: string, value: boolean) => {
    await getAdapter().put("checkpoints", { checkpointId: cpKey(section.id, id), done: value, updatedAt: new Date().toISOString() });
    await checkCompletion(section);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="fm-mono" aria-live="polite">{count}/{items.length} done</span>
        {complete && <span className="fm-status fm-status--ok"><span className="g" aria-hidden>✓</span>Section complete</span>}
      </div>
      <ul className="grid gap-3">
        {items.map((c) => (
          <li key={c.id}>
            <label className="fm-check">
              <input type="checkbox" checked={done.has(cpKey(section.id, c.id))} onChange={(e) => toggle(c.id, e.target.checked)} disabled={!states} />
              <span>{c.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {!complete && <p className="fm-help">The section is marked complete when every checkpoint is ticked and your best quiz score is 80% or more.</p>}
    </div>
  );
}
