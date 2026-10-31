"use client";
import { useMemo } from "react";
import { useChallengeResults, useInterviewAttempts, useSettings, useUserData } from "@/lib/db/hooks";
import type { PlanWeek } from "@/lib/content/schemas";
import { currentWeek, fromDayKey, humanize, type PlanSection } from "@/lib/learning/plan";
import { sectionProgress } from "@/lib/learning/progress";
import { SIM_CHALLENGES } from "@/lib/simulators/challenge-index";
import { SIM_TITLES } from "@/lib/simulators/titles";

export interface PlanItem { kind: "lesson" | "simulator" | "case"; id: string; title: string; href?: string; done: boolean; percent?: number }

/** Everything the plan, today and dashboard pages derive from the plan + the learner's data. */
export function usePlan(weeks: PlanWeek[], sections: PlanSection[]) {
  const settings = useSettings();
  const data = useUserData();
  const challenges = useChallengeResults();
  const interviews = useInterviewAttempts();
  const planStart = settings.planStart ? fromDayKey(settings.planStart) : undefined;
  const week = planStart ? currentWeek(planStart) : 1;

  const view = useMemo(() => {
    const byId = new Map(sections.map((s) => [s.id, s]));
    const progress = new Map(sections.map((s) => [s.id, sectionProgress(s, data, SIM_CHALLENGES)]));
    const passed = new Set((challenges ?? []).filter((c) => c.passed).map((c) => `${c.simulatorId}:${c.challengeId}`));
    const practised = new Set((interviews ?? []).map((i) => i.caseStudyId));

    const items = (w: PlanWeek): PlanItem[] => [
      ...w.sectionIds.map((id): PlanItem => {
        const s = byId.get(id);
        const p = progress.get(id);
        return s ? { kind: "lesson", id, title: s.title, href: s.href, done: !!p?.complete, percent: p?.percent } : { kind: "lesson", id, title: humanize(id), done: false };
      }),
      // An entry is "simulatorId" (all its challenges) or "simulatorId:challengeId".
      ...w.simulatorChallengeIds.map((entry): PlanItem => {
        const [sim, one] = entry.split(":");
        const ids = SIM_CHALLENGES[sim] ? (one ? [one] : SIM_CHALLENGES[sim]) : [];
        return { kind: "simulator", id: entry, title: SIM_TITLES[sim] ?? humanize(sim), href: ids.length ? `/simulators/${sim}` : undefined, done: ids.length > 0 && ids.every((c) => passed.has(`${sim}:${c}`)) };
      }),
      ...w.caseStudyIds.map((id): PlanItem => ({ kind: "case", id, title: humanize(id), done: practised.has(id) })),
    ];

    const weekView = weeks.map((w) => {
      const its = items(w);
      const live = its.filter((i) => i.href);
      const pct = live.length ? Math.round(live.reduce((a, i) => a + (i.kind === "lesson" ? i.percent ?? 0 : i.done ? 100 : 0), 0) / live.length) : null;
      return { ...w, items: its, percent: pct };
    });

    // Behind = written lessons from earlier weeks that aren't complete.
    const behind = sections.filter((s) => s.week < week && !progress.get(s.id)?.complete).sort((a, b) => a.week - b.week);
    return { weekView, progress, behind };
  }, [weeks, sections, data, challenges, interviews, week]);

  return { settings, planStart, week, data, ...view };
}
