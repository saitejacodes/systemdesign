"use client";
import Link from "next/link";
import { PHASES } from "@/lib/curriculum";
import { usePlan } from "@/components/plan/usePlan";
import { WeakSpotList } from "@/components/plan/WeakSpotList";
import { useCardReviews, useInterviewAttempts, useStudySessions } from "@/lib/db/hooks";
import type { PlanWeek } from "@/lib/content/schemas";
import type { InterviewAttempt } from "@/lib/db/types";
import { attemptScore } from "@/lib/interview/session";
import { dayKey, humanize, lastDays, type PlanSection } from "@/lib/learning/plan";
import { overallProgress, phaseProgress } from "@/lib/learning/progress";
import { streak } from "@/lib/learning/streaks";
import { weakSpots } from "@/lib/learning/weakspots";
import { SIM_CHALLENGES } from "@/lib/simulators/challenge-index";
import { AccuracyLine, DailyBars, Figure } from "./Charts";

const short = (k: string) => k.slice(5).replace("-", "/");

/**
 * Self-score % per attempt (after the Mock hint penalty, as on the save screen), oldest first, grouped by case and most
 * recent case first.
 */
function interviewTrends(attempts: InterviewAttempt[]) {
  const by = new Map<string, InterviewAttempt[]>();
  for (const a of attempts) by.set(a.caseStudyId, [...(by.get(a.caseStudyId) ?? []), a]);
  return [...by.entries()].map(([caseId, list]) => {
    const sorted = list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const pcts = sorted.map((a) => attemptScore(a).pct);
    return { caseId, pcts, last: sorted[sorted.length - 1].createdAt };
  }).sort((a, b) => b.last.localeCompare(a.last));
}

export function DashboardView({ weeks, sections }: { weeks: PlanWeek[]; sections: PlanSection[] }) {
  const { data, planStart, week } = usePlan(weeks, sections);
  const reviews = useCardReviews() ?? [];
  const sessions = useStudySessions() ?? [];
  const interviews = useInterviewAttempts() ?? [];

  const overall = overallProgress(sections, data, SIM_CHALLENGES);
  const phases = phaseProgress(sections, data, SIM_CHALLENGES);
  const titles = new Map(sections.map((s) => [s.id, s.title]));
  const days = lastDays(30);
  const reviewsByDay = new Map<string, number>();
  for (const r of reviews) { const k = dayKey(new Date(r.at)); reviewsByDay.set(k, (reviewsByDay.get(k) ?? 0) + 1); }
  const minutesByDay = new Map(sessions.map((s) => [s.date, s.minutes]));
  const accuracy = [...data.attempts].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)).slice(-30)
    .map((a, i) => ({ n: i + 1, pct: Math.round((a.score / a.total) * 100), label: `${titles.get(a.sectionId) ?? a.sectionId} · ${new Date(a.finishedAt).toLocaleDateString()}` }));
  const totalMinutes = sessions.reduce((a, s) => a + s.minutes, 0);

  const stats = [
    ["Overall", `${overall}%`],
    ["Week", `${week}/16`],
    ["Streak", `${streak(sessions)}d`],
    ["Study time", `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`],
    ["Quizzes", String(data.attempts.length)],
    ["Cards reviewed", String(reviews.length)],
  ];

  return (
    <div className="grid gap-8 px-4 py-8 sm:px-8">
      <dl className="grid grid-cols-2 border border-ink sm:grid-cols-3 lg:grid-cols-6" style={{ borderRadius: 2 }}>
        {stats.map(([k, v]) => (
          <div key={k} className="border-b border-r border-line p-4 last:border-r-0">
            <dt className="fm-cap">{k}</dt>
            <dd className="fm-metric mt-2 text-[28px]">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="phases-h" className="grid gap-3">
        <h2 id="phases-h" className="fm-cap border-b border-ink pb-1">Progress by phase</h2>
        <ul className="grid gap-2">
          {PHASES.map((p) => (
            <li key={p.n} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 max-sm:grid-cols-[minmax(0,7rem)_1fr_3rem]">
              <Link href={`/phase/${p.n}`} className="truncate text-[15px] max-lg:py-[11px]">{p.n}. {p.short}</Link>
              <div className="h-3 border border-ink" role="progressbar" aria-label={`Phase ${p.n} progress`} aria-valuenow={phases[p.n]} aria-valuemin={0} aria-valuemax={100} style={{ borderRadius: 2 }}>
                <div className="h-full" style={{ width: `${phases[p.n]}%`, background: `var(--phase-${p.n})` }} />
              </div>
              <span className="text-right font-mono text-[13px] tabular-nums">{phases[p.n]}%</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Figure title="Quiz accuracy, last 30 attempts" empty={accuracy.length ? undefined : "Finish a quiz to start this graph."}><AccuracyLine data={accuracy} /></Figure>
        <Figure title="Cards reviewed per day" empty={reviews.length ? undefined : "Review flashcards to fill this in."}><DailyBars data={days.map((d) => ({ day: short(d), v: reviewsByDay.get(d) ?? 0 }))} color="var(--phase-5)" label="Cards" /></Figure>
        <Figure title="Study minutes per day" empty={sessions.length ? undefined : "Minutes appear after time on lessons and simulators."}><DailyBars data={days.map((d) => ({ day: short(d), v: minutesByDay.get(d) ?? 0 }))} color="var(--phase-1)" label="Minutes" /></Figure>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="weak-h" className="grid content-start gap-3">
          <h2 id="weak-h" className="fm-cap border-b border-ink pb-1">Weak spots</h2>
          <WeakSpotList spots={weakSpots(sections, data.attempts, data.checkpoints, { planStart })} sections={sections} />
        </section>
        <section aria-labelledby="int-h" className="grid content-start gap-3">
          <h2 id="int-h" className="fm-cap border-b border-ink pb-1">Interview attempts · {interviews.length}</h2>
          {interviews.length === 0 ? <p className="text-ink-muted">No mock interviews yet. They are part of week 14; to try one now, open a <Link href="/case-studies">case study</Link> and press Mock interview.</p> : (
            <ul className="grid gap-2" aria-label="Score trend per case">
              {interviewTrends(interviews).map((t) => (
                <li key={t.caseId} className="grid gap-0.5">
                  <Link href={`/interview/${t.caseId}`} className="font-medium">{humanize(t.caseId)}</Link>
                  <span className="font-mono text-[13px] tabular-nums" aria-label={`Scores oldest to newest: ${t.pcts.join(", ")} percent`}>
                    {t.pcts.map((p) => `${p}%`).join(" → ")}
                    {t.pcts.length > 1 && <span className="fm-cap"> · {t.pcts[t.pcts.length - 1] >= t.pcts[0] ? "▲" : "▼"} {Math.abs(t.pcts[t.pcts.length - 1] - t.pcts[0])} pts</span>}
                  </span>
                  <span className="fm-cap">Last {new Date(t.last).toLocaleDateString()} · {t.pcts.length} attempt{t.pcts.length === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
