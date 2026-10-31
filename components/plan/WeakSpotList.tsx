"use client";
import Link from "next/link";
import type { PlanSection } from "@/lib/learning/plan";
import type { WeakSpot } from "@/lib/learning/weakspots";

/** One line per weak spot, linking to where to fix it. */
export function WeakSpotList({ spots, sections, limit = 5 }: { spots: WeakSpot[]; sections: PlanSection[]; limit?: number }) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const rows = spots.filter((w) => byId.has(w.sectionId)).slice(0, limit);
  if (!rows.length) return <p className="text-ink-muted">No weak spots right now. They appear when a topic drops below 70% over your last two quiz attempts, or a past week&apos;s lesson sits untouched.</p>;
  return (
    <ul className="grid gap-2">
      {rows.map((w) => {
        const s = byId.get(w.sectionId)!;
        return (
          <li key={w.kind + w.sectionId + (w.kind === "topic" ? w.topicId : "")} className="flex flex-wrap items-baseline gap-x-3">
            {w.kind === "topic" ? (
              <>
                <span className="font-mono text-[13px] font-medium" style={{ color: "var(--status-over)" }}>{Math.round(w.accuracy * 100)}%</span>
                <Link href={`${s.href}#quiz`}>{s.topics[w.topicId] ?? w.topicId}</Link>
                <span className="fm-cap">{s.title} · {w.answered} answers</span>
              </>
            ) : (
              <>
                <span className="font-mono text-[13px] font-medium" style={{ color: "var(--status-hot)" }}>{w.daysPastWeek}d late</span>
                <Link href={`${s.href}#checkpoints`}>{s.title}</Link>
                <span className="fm-cap">Untouched since week {s.week}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
