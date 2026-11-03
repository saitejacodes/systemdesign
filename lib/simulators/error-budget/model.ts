import type { SimModel } from "@/lib/sim/engine";
import type { Rng } from "@/lib/sim/engine/rng";

/*
 * One SLO window, minute by minute. Each minute has an error ratio (baseline noise + incidents +
 * faults); a prefix sum makes any window's average O(1). Burn rate = window error ratio / (1 − SLO).
 * Alerts are the SRE workbook's multiwindow, multi-burn-rate rules (ch. 5, "Alerting on SLOs"):
 * a rule fires when BOTH its long and its short (1/12) window burn faster than the rate that would
 * spend its share of the budget in the long window. For a 30-day window that is 14.4× (2% in 1 h),
 * 6× (5% in 6 h) and 1× (10% in 3 d).
 */

export type SloTarget = "99" | "99.5" | "99.9" | "99.95" | "99.99";
export type Scenario = "release-month" | "random" | "quiet";
export interface EbConfig { slo: SloTarget; windowDays: "7" | "28" | "30"; scenario: Scenario; baseErrPct: number; minutesPerSecond: number }

export type RuleId = "page-fast" | "page-slow" | "ticket";
export interface Rule { id: RuleId; severity: "page" | "ticket"; longMin: number; shortMin: number; budgetFrac: number; label: string }
export const RULES: Rule[] = [
  { id: "page-fast", severity: "page", longMin: 60, shortMin: 5, budgetFrac: 0.02, label: "PAGE · 1 h & 5 m" },
  { id: "page-slow", severity: "page", longMin: 360, shortMin: 30, budgetFrac: 0.05, label: "PAGE · 6 h & 30 m" },
  { id: "ticket", severity: "ticket", longMin: 4320, shortMin: 360, budgetFrac: 0.1, label: "TICKET · 3 d & 6 h" },
];
/** The burn rate that spends `budgetFrac` of the whole window's budget within the rule's long window. */
export const threshold = (r: Rule, windowMin: number) => (r.budgetFrac * windowMin) / r.longMin;

export interface Incident { id: number; start: number; minutes: number; err: number; source: "script" | "random" | "you" }
export interface Firing { rule: RuleId; start: number; end?: number }
export type Verdict = "ship" | "hold";
export interface Review { id: number; minute: number; name: string; decision?: Verdict; expected?: Verdict; budgetLeft?: number; paging?: boolean; ticket?: boolean }

export interface EbState {
  key: string; slo: number; windowMin: number;
  minute: number; acc: number;
  /** cum[m] = sum of per-minute error ratios over minutes [0, m): "full-outage minutes" so far. */
  cum: Float64Array;
  /** Error-minutes caused by incidents and faults, not baseline noise. */
  extra: number;
  incidents: Incident[]; nextId: number;
  faults: { outage: boolean; leak: boolean };
  firing: Record<RuleId, boolean>; firings: Firing[]; pages: number; tickets: number;
  reviews: Review[];
}

const DAY = 1440;
const MAX_FIRINGS = 300;
const LEAK_ERR = 0.005;
export const keyOf = (c: EbConfig) => `${c.slo}|${c.windowDays}|${c.scenario}`;

// The scripted month behind the release-board challenge (days are for 30 days, scaled otherwise).
// Day 8: a slow burn has a ticket open but most budget is left. Day 16: an outage is paging.
// Day 25: nothing is firing, but the window's budget is gone.
const SCRIPT: { day: number; minutes: number; err: number }[] = [
  { day: 3, minutes: 120, err: 0.05 },
  { day: 6.5, minutes: 2880, err: 0.003 },
  { day: 16 - 10 / DAY, minutes: 25, err: 1 },
];
const REVIEWS = [{ day: 8, name: "checkout-v42 · new payment SDK" }, { day: 16, name: "search-v7 · index migration" }, { day: 25, name: "profile-v3 · schema change" }];

export function fresh(c: EbConfig, rng: Rng): EbState {
  const windowMin = Number(c.windowDays) * DAY;
  const scale = windowMin / (30 * DAY);
  const incidents: Incident[] = [];
  if (c.scenario === "release-month") SCRIPT.forEach((s, i) => incidents.push({ id: i + 1, start: Math.round(s.day * DAY * scale), minutes: s.minutes, err: s.err, source: "script" }));
  if (c.scenario === "random") {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      const kind = rng.pick(["outage", "partial", "slow"] as const);
      const [minutes, err] = kind === "outage" ? [rng.int(5, 40), 1] : kind === "partial" ? [rng.int(30, 180), rng.uniform(0.02, 0.2)] : [rng.int(360, 2160), rng.uniform(0.002, 0.006)];
      incidents.push({ id: i + 1, start: rng.int(0, windowMin - minutes), minutes, err, source: "random" });
    }
    incidents.sort((a, b) => a.start - b.start);
  }
  return {
    key: keyOf(c), slo: Number(c.slo) / 100, windowMin, minute: 0, acc: 0,
    cum: new Float64Array(windowMin + 1), extra: 0,
    incidents, nextId: incidents.length + 1, faults: { outage: false, leak: false },
    firing: { "page-fast": false, "page-slow": false, ticket: false }, firings: [], pages: 0, tickets: 0,
    reviews: c.scenario === "quiet" ? [] : REVIEWS.map((r, i) => ({ id: i + 1, minute: Math.round(r.day * DAY * scale), name: r.name })),
  };
}

/** Average error ratio over the last `w` minutes before minute m; minutes before day 0 count as error-free. */
export const windowErr = (s: EbState, w: number, m = s.minute) => (s.cum[m] - s.cum[Math.max(0, m - w)]) / w;
export const burn = (s: EbState, w: number, m = s.minute) => windowErr(s, w, m) / (1 - s.slo);
/** Full-outage minutes the whole window allows: 43.2 for 99.9% over 30 days. */
export const budgetMinutes = (s: EbState) => (1 - s.slo) * s.windowMin;
export const budgetLeft = (s: EbState, m = s.minute) => 1 - s.cum[m] / budgetMinutes(s);
export const monthDone = (s: EbState) => s.minute >= s.windowMin;
export const pendingReview = (s: EbState) => s.reviews.find((r) => !r.decision && s.minute >= r.minute);
const paging = (s: EbState) => s.firing["page-fast"] || s.firing["page-slow"];
/** The release policy: SRE workbook example (freeze when the budget is spent) plus "never ship into an active page". */
export const policy = (budget: number, page: boolean): Verdict => (budget <= 0 || page ? "hold" : "ship");
export const incidentErrMinutes = (i: Incident) => i.err * i.minutes;

function advance(s: EbState, rng: Rng, baseErr: number, log: (lvl: "info" | "warn" | "error", m: string) => void) {
  const m = s.minute;
  const base = baseErr * (0.5 + rng.next());
  let x = s.faults.outage ? 1 : s.faults.leak ? LEAK_ERR : 0;
  for (const i of s.incidents) if (m >= i.start && m < i.start + i.minutes) x += i.err;
  const e = Math.min(1, base + x);
  s.extra += e - Math.min(1, base);
  s.cum[m + 1] = s.cum[m] + e;
  s.minute = m + 1;
  for (const r of RULES) {
    const thr = threshold(r, s.windowMin);
    const on = burn(s, r.longMin) >= thr && burn(s, r.shortMin) >= thr;
    if (on === s.firing[r.id]) continue;
    s.firing[r.id] = on;
    if (on) {
      s.firings.push({ rule: r.id, start: s.minute });
      if (s.firings.length > MAX_FIRINGS) s.firings.shift();
      if (r.severity === "page") s.pages++; else s.tickets++;
      log(r.severity === "page" ? "error" : "warn", `${r.label} fired at ${fmtMinute(s.minute)}: burn ${burn(s, r.longMin).toFixed(1)}× ≥ ${thr.toFixed(1)}×`);
    } else {
      const f = [...s.firings].reverse().find((x) => x.rule === r.id && x.end === undefined);
      if (f) f.end = s.minute;
      log("info", `${r.label} resolved at ${fmtMinute(s.minute)}`);
    }
  }
}

export const fmtMinute = (m: number) => `day ${Math.floor(m / DAY)} ${String(Math.floor((m % DAY) / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

export const ebModel: SimModel<EbConfig, EbState> = {
  init: (c, rng) => fresh(c, rng),
  tick(s, ctx) {
    // setConfig doesn't re-init; a new SLO, window or scenario starts a new month.
    if (s.key !== keyOf(ctx.config)) { ctx.log("info", "New SLO settings: starting a fresh window"); return fresh(ctx.config, ctx.rng); }
    if (monthDone(s)) return s;
    s.acc += (ctx.dt * ctx.config.minutesPerSecond) / 1000;
    while (s.acc >= 1 && !monthDone(s)) {
      const r = pendingReview(s);
      if (r) {
        // The month waits for the release board: the learner must decide before time moves on.
        if (r.expected === undefined) {
          r.budgetLeft = budgetLeft(s); r.paging = paging(s); r.ticket = s.firing.ticket;
          r.expected = policy(r.budgetLeft, r.paging);
          ctx.log("warn", `Release review at ${fmtMinute(s.minute)}: ${r.name}. Ship or hold?`);
        }
        s.acc = 0;
        return s;
      }
      s.acc -= 1;
      advance(s, ctx.rng, ctx.config.baseErrPct / 100, ctx.log);
      if (monthDone(s)) ctx.log(budgetLeft(s) > 0 ? "info" : "error", `Window complete: ${(budgetLeft(s) * 100).toFixed(1)}% of the error budget left`);
    }
    return s;
  },
  actions: {
    /** Learner incident starting now: { minutes, errPct }. */
    inject: (st, p) => {
      const q = (p ?? {}) as { minutes?: number; errPct?: number };
      const minutes = Math.max(1, Math.round(q.minutes ?? 15)), err = Math.min(1, Math.max(0.0001, (q.errPct ?? 100) / 100));
      const s = structuredClone(st);
      s.incidents.push({ id: s.nextId++, start: s.minute, minutes, err, source: "you" });
      return s;
    },
    decide: (st, p) => {
      const q = (p ?? {}) as { id?: number; verdict?: Verdict };
      const s = structuredClone(st);
      const r = s.reviews.find((x) => x.id === q.id);
      if (r && !r.decision && r.expected && (q.verdict === "ship" || q.verdict === "hold")) r.decision = q.verdict;
      return s;
    },
  },
  faults: [
    { id: "outage", label: "Hard outage (100% errors)", description: "Every request fails while this is on. At 99.9% over 30 days the whole budget lasts 43.2 minutes.", apply: (s) => ({ ...s, faults: { ...s.faults, outage: true } }), revert: (s) => ({ ...s, faults: { ...s.faults, outage: false } }) },
    { id: "leak", label: "Slow leak (+0.5% errors)", description: "A quiet degradation: 5× burn at 99.9%. Too slow to page, fast enough to spend a third of the budget in two days.", apply: (s) => ({ ...s, faults: { ...s.faults, leak: true } }), revert: (s) => ({ ...s, faults: { ...s.faults, leak: false } }) },
  ],
  metrics: (s) => ({
    day: s.minute / DAY,
    budgetLeft: budgetLeft(s) * 100,
    minutesLeft: budgetLeft(s) * budgetMinutes(s),
    burn5m: burn(s, 5), burn1h: burn(s, 60), burn6h: burn(s, 360), burn3d: burn(s, 4320),
    pages: s.pages, tickets: s.tickets,
    paging: paging(s) ? 1 : 0,
    reviewsRight: s.reviews.filter((r) => r.decision && r.decision === r.expected).length,
  }),
};
