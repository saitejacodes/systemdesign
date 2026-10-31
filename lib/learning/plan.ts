const DAY = 86_400_000;
export const PLAN_WEEKS = 16;

/** Local-midnight timestamp, so the week flips at midnight, not at the hour the plan started. */
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Plan week (1–16) for `now`, given the plan start date; before the start it is week 1. */
export function currentWeek(planStart: Date, now = new Date()) {
  const days = Math.round((midnight(now) - midnight(planStart)) / DAY);
  return Math.min(PLAN_WEEKS, Math.max(1, Math.floor(days / 7) + 1));
}

/** "YYYY-MM-DD" in local time. */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parses a "YYYY-MM-DD" key as local midnight. */
export const fromDayKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

/** The last `n` day keys, oldest first, ending today. */
export function lastDays(n: number, now = new Date()) {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i))));
}

/** A written section as the plan, today and dashboard pages see it. */
export interface PlanSection { id: string; phase: number; week: number; title: string; href: string; checkpointIds: string[]; simulatorIds: string[]; topics: Record<string, string> }

/** "p2-api-gateway" → "Api gateway"; used for sections and case studies that aren't written yet. */
export const humanize = (id: string) => { const s = id.replace(/^p\d-/, "").replace(/-/g, " "); return s[0].toUpperCase() + s.slice(1); };
