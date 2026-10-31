"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { phaseOfWeek } from "@/lib/curriculum";
import type { PlanWeek } from "@/lib/content/schemas";
import type { PlanSection } from "@/lib/learning/plan";
import { usePlan, type PlanItem } from "./usePlan";

const KIND = { lesson: "Lesson", simulator: "Simulator", case: "Case study" } as const;

export function ItemRow({ item }: { item: PlanItem }) {
  const live = item.kind === "case" ? false : !!item.href;
  return (
    <li className="flex items-start gap-3 border-t border-line py-2 first:border-t-0">
      <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center border border-ink ${item.done ? "bg-ink text-paper" : ""}`} style={{ borderRadius: 2 }}>
        {item.done && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="fm-cap mr-2">{KIND[item.kind]}</span>
        {live ? <Link href={item.href!} className="font-medium">{item.title}</Link> : <span className={item.kind === "case" ? "font-medium" : "text-ink-muted"}>{item.title}</span>}
        {!live && item.kind !== "case" && <span className="fm-cap ml-2">· Coming soon</span>}
        {item.done && <span className="sr-only"> (done)</span>}
      </span>
      {item.percent !== undefined && <span className="fm-cap tabular-nums">{item.percent}%</span>}
    </li>
  );
}

export function PlanTimeline({ weeks, sections }: { weeks: PlanWeek[]; sections: PlanSection[] }) {
  const { week, weekView, planStart } = usePlan(weeks, sections);
  return (
    <div className="grid gap-4 px-4 py-8 sm:px-8">
      <p className="fm-cap">
        {planStart ? <>Started {planStart.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · You are in week {week} · </> : null}
        <Link href="/settings">Change start date</Link>
      </p>
      <ol className="relative grid gap-3 before:absolute before:bottom-0 before:left-[19px] before:top-0 before:w-px before:bg-ink max-sm:before:hidden">
        {weekView.map((w) => {
          const p = phaseOfWeek(w.week);
          const now = w.week === week;
          return (
            <li key={w.week} className="relative sm:pl-12">
              <span aria-hidden className="absolute left-0 top-3 hidden size-10 place-items-center border border-ink font-mono text-[13px] font-medium sm:grid" style={{ background: `var(--phase-${p.n})`, color: `var(--on-phase-${p.n})`, borderRadius: 2 }}>
                {String(w.week).padStart(2, "0")}
              </span>
              <details open={now} className={`fm-card group ${now ? "fm-card--raised outline-2 outline-cobalt" : ""}`}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="fm-cap w-full sm:w-auto">Wk {String(w.week).padStart(2, "0")} · Phase {p.n}{now && <strong className="ml-2 text-cobalt">· This week</strong>}</span>
                  <span className="min-w-0 flex-1 text-[17px] font-semibold">{w.title}</span>
                  <span className="fm-cap tabular-nums">{w.percent === null ? "—" : `${w.percent}%`} · {w.estimatedHours} h</span>
                  <span aria-hidden className="font-mono transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="grid gap-3 border-t border-ink px-4 py-3">
                  <div className="h-1.5 bg-line" role="progressbar" aria-label={`Week ${w.week} progress`} aria-valuenow={w.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full" style={{ width: `${w.percent ?? 0}%`, background: `var(--phase-${p.n})` }} />
                  </div>
                  <p className="text-ink-muted">{w.focus}</p>
                  <ul>{w.items.map((i) => <ItemRow key={i.kind + i.id} item={i} />)}</ul>
                  <p className="border-l-2 border-cobalt pl-3"><span className="fm-cap block">Deliverable</span>{w.deliverable}</p>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
