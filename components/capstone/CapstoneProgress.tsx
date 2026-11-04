"use client";
import Link from "next/link";
import { useCheckpoints } from "@/lib/db/hooks";

export interface StageProgressInfo {
  stage: number;
  ids: string[];
}

function useDone() {
  const states = useCheckpoints();
  return { ready: !!states, done: new Set(states?.filter((c) => c.done).map((c) => c.checkpointId)) };
}

const isComplete = (s: StageProgressInfo, done: Set<string>) => s.ids.length > 0 && s.ids.every((id) => done.has(id));

/** "n/10 stages built": a build stage counts when all its checkpoints are ticked. Stage 0 (the review) is separate. */
export function CapstoneProgress({ stages }: { stages: StageProgressInfo[] }) {
  const { ready, done } = useDone();
  const build = stages.filter((s) => s.stage > 0);
  const n = build.filter((s) => isComplete(s, done)).length;
  const review = stages.find((s) => s.stage === 0);
  return (
    <div className="flex flex-wrap items-center gap-4" aria-live="polite">
      <span className="fm-mono" data-testid="capstone-progress">{ready ? `${n}/${build.length}` : `–/${build.length}`} stages built</span>
      <span className="h-2 w-40 border border-ink" aria-hidden>
        <span className="block h-full" style={{ width: `${(n / Math.max(1, build.length)) * 100}%`, background: "var(--cobalt)" }} />
      </span>
      {review && <span className="fm-mono text-ink-muted">Design review {isComplete(review, done) ? "done" : "not done"}</span>}
    </div>
  );
}

/** Per-stage "3/5" badge for the stage list. */
export function StageBadge({ ids }: { ids: string[] }) {
  const { ready, done } = useDone();
  const n = ids.filter((id) => done.has(id)).length;
  const complete = ready && n === ids.length;
  return (
    <span className={`fm-mono shrink-0 ${complete ? "fm-status fm-status--ok" : "text-ink-muted"}`}>
      {complete && <span className="g" aria-hidden>✓</span>}
      {ready ? n : "–"}/{ids.length}
    </span>
  );
}

/** Dashboard line: total capstone checkpoints ticked. */
export function CapstoneDashboardLine({ ids }: { ids: string[] }) {
  const { ready, done } = useDone();
  const n = ids.filter((id) => done.has(id)).length;
  return (
    <p className="fm-mono" data-testid="capstone-dashboard">
      <Link href="/capstone">Capstone</Link> {ready ? n : "–"}/{ids.length} checkpoints
    </p>
  );
}
