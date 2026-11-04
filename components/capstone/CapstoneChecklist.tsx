"use client";
import { useState } from "react";
import { getAdapter } from "@/lib/db/adapter";
import { useCheckpoints } from "@/lib/db/hooks";

/** Capstone checkboxes, stored as CheckpointState rows with ids like capstone-3-2 or capstone-break-5. */
export function CapstoneChecklist({ items, label }: { items: { id: string; text: string }[]; label: string }) {
  const states = useCheckpoints();
  // Clicks show at once; the stored row catches up when the IndexedDB write lands.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const stored = new Set(states?.filter((c) => c.done).map((c) => c.checkpointId));
  const isDone = (id: string) => pending[id] ?? stored.has(id);
  const count = items.filter((c) => isDone(c.id)).length;
  const toggle = async (id: string, value: boolean) => {
    setPending((p) => ({ ...p, [id]: value }));
    await getAdapter().put("checkpoints", { checkpointId: id, done: value, updatedAt: new Date().toISOString() });
    setPending((p) => { const next = { ...p }; delete next[id]; return next; });
  };

  return (
    <div className="grid gap-4">
      <span className="fm-mono" aria-live="polite">{count}/{items.length} done</span>
      <ul className="grid gap-3" aria-label={label}>
        {items.map((c) => (
          <li key={c.id}>
            <label className="fm-check">
              <input type="checkbox" data-checkpoint={c.id} checked={isDone(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} disabled={!states} />
              <span>{c.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
