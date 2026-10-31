"use client";
import Link from "next/link";
import { useMemo } from "react";
import { SetHud } from "@/components/layout/SetHud";
import { phaseOfWeek } from "@/lib/curriculum";
import { useCardReviews, useCards, useStudySessions } from "@/lib/db/hooks";
import type { PlanWeek } from "@/lib/content/schemas";
import { dayKey, type PlanSection } from "@/lib/learning/plan";
import { cardStage, isDue } from "@/lib/learning/sm2";
import { streak } from "@/lib/learning/streaks";
import { weakSpots } from "@/lib/learning/weakspots";
import { usePlan } from "./usePlan";
import { WeakSpotList } from "./WeakSpotList";

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="fm-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4">
      <span className="font-mono text-[28px] font-medium leading-none text-cobalt" aria-hidden>{n}</span>
      <div className="grid gap-2">
        <h2 className="fm-cap" style={{ color: "var(--ink)" }}>{title}</h2>
        {children}
      </div>
    </li>
  );
}

export function TodayView({ weeks, sections }: { weeks: PlanWeek[]; sections: PlanSection[] }) {
  const { week, weekView, behind, data, settings, planStart } = usePlan(weeks, sections);
  const cards = useCards();
  const reviews = useCardReviews();
  const sessions = useStudySessions() ?? [];

  const due = useMemo(() => {
    if (!cards || !reviews) return null;
    const newToday = reviews.filter((r) => r.wasNew && new Date(r.at).toDateString() === new Date().toDateString()).length;
    const d = cards.filter((c) => isDue(c));
    const fresh = d.filter((c) => cardStage(c) === "new").length;
    return d.length - fresh + Math.min(fresh, Math.max(0, settings.newCardsPerDay - newToday));
  }, [cards, reviews, settings.newCardsPerDay]);

  const w = weekView.find((x) => x.week === week)!;
  const nextLesson = w.items.find((i) => i.kind === "lesson" && i.href && !i.done)
    ?? weekView.flatMap((x) => x.items).find((i) => i.kind === "lesson" && i.href && !i.done);
  const nextSim = w.items.find((i) => i.kind === "simulator" && i.href && !i.done)
    ?? weekView.filter((x) => x.week >= week).flatMap((x) => x.items).find((i) => i.kind === "simulator" && i.href && !i.done);
  const spots = weakSpots(sections, data.attempts, data.checkpoints, { planStart });
  const minutesToday = sessions.find((s) => s.date === dayKey())?.minutes ?? 0;
  const days = streak(sessions);

  return (
    <div className="grid max-w-3xl gap-6 px-4 py-8 sm:px-8">
      <SetHud live={`Today · Week ${week}`} items={[{ k: "Due", v: String(due ?? "—") }, { k: "Min", v: String(minutesToday) }, { k: "Streak", v: `${days}d` }]} right={`Phase ${phaseOfWeek(week).n} · ${phaseOfWeek(week).short}`} />
      <p className="fm-cap">Week {week} of 16 · {w.title} · {settings.hoursPerWeek ?? 8} h planned</p>

      {behind.length > 0 && (
        <div role="status" className="border border-ink p-4" style={{ background: "var(--status-hot-fill)", color: "#121212", borderRadius: 2 }}>
          <p className="font-semibold">You&apos;re {behind.length} lesson{behind.length > 1 ? "s" : ""} behind. That&apos;s fine. Catch up in this order:</p>
          <ol className="mt-2 list-decimal pl-5">
            {behind.slice(0, 3).map((s) => <li key={s.id}><Link href={s.href} style={{ color: "#121212" }}>{s.title}</Link> <span className="font-mono text-[11px] uppercase tracking-wider">· week {s.week}</span></li>)}
          </ol>
          <p className="mt-2 text-[15px]">Do the checkpoints and the quiz first; skip re-reading what you already know.</p>
        </div>
      )}

      <ol className="grid gap-3">
        <Step n="01" title="Flashcards due">
          <div className="flex flex-wrap items-center gap-4">
            <span className="fm-metric">{due ?? "—"}</span>
            {due ? <Link href="/flashcards" className="fm-btn fm-btn--primary no-underline">Review <span className="arr">→</span></Link> : <span className="text-ink-muted">Nothing due. Add cards from any lesson&apos;s flashcard deck.</span>}
          </div>
        </Step>
        <Step n="02" title="Next lesson">
          {nextLesson ? <Link href={nextLesson.href!} className="text-[18px] font-semibold">{nextLesson.title} <span className="fm-cap">· {nextLesson.percent ?? 0}% done</span></Link> : <p className="text-ink-muted">Every written lesson is complete. More arrive as the curriculum grows.</p>}
        </Step>
        <Step n="03" title="Next simulator challenge">
          {nextSim ? <Link href={nextSim.href!} className="text-[18px] font-semibold">{nextSim.title}</Link> : <p className="text-ink-muted">No open simulator challenges in your plan right now.</p>}
        </Step>
        <Step n="04" title="Weak spot">
          <WeakSpotList spots={spots} sections={sections} limit={1} />
        </Step>
        <Step n="05" title="This week's deliverable">
          <p>{w.deliverable}</p>
          <Link href="/plan" className="fm-cap">See the whole week →</Link>
        </Step>
      </ol>
    </div>
  );
}
