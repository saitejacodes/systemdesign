import type { Challenge } from "@/lib/sim/engine";
import { budgetLeft, budgetMinutes, monthDone, type EbConfig, type EbState } from "./model";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const SLOW_MIN = 0.1;
const SPEND_MAX = 0.25;
const base: Partial<EbConfig> = { slo: "99.9", windowDays: "30", baseErrPct: 0.02, minutesPerSecond: 720 };

export const challenges: Challenge<EbConfig, EbState>[] = [
  {
    id: "release-board",
    title: "Run the release board",
    description: "A scripted month at 99.9% over 30 days. Three risky releases ask to ship on days 8, 16 and 25; time stops at each one. Apply the policy: hold if the window's error budget is spent or a page is firing, otherwise ship. Tickets don't block releases. Get all three right.",
    setup: { ...base, scenario: "release-month" },
    durationMs: 900_000,
    better: "higher",
    done: (s) => s.reviews.every((r) => r.decision),
    winCondition(_h, s) {
      const right = s.reviews.filter((r) => r.decision && r.decision === r.expected);
      const wrong = s.reviews.filter((r) => r.decision && r.decision !== r.expected);
      if (right.length === s.reviews.length) return { passed: true, value: right.length, detail: "All three right: ship while a ticket is open and budget is left, hold during a page, and freeze once the budget is gone even though nothing is alerting." };
      const why = wrong.map((r) => `${r.name}: ${r.expected === "hold" ? (r.paging ? "a page was firing" : `budget was ${pct(r.budgetLeft ?? 0)}, already spent`) : `${pct(r.budgetLeft ?? 0)} budget left and only a ticket open`}, so ${r.expected}`).join("; ");
      return { passed: false, value: right.length, detail: wrong.length ? `${right.length} of ${s.reviews.length} right. ${why}.` : `${right.length} of ${s.reviews.length} decided. Let the month run to each review.` };
    },
    hint: "Read the budget left and the alert lanes at the moment of each review, not the month as a whole. A ticket means \"look at this this week\", not \"freeze\".",
  },
  {
    id: "slow-burn",
    title: "The burn that never pages",
    description: `A quiet month. Inject an incident that spends at least ${SLOW_MIN * 100}% of the error budget on its own, raises a ticket, and never pages anyone.`,
    setup: { ...base, scenario: "quiet" },
    durationMs: 900_000,
    better: "higher",
    done: (s) => monthDone(s) || s.pages > 0 || (s.tickets > 0 && s.extra / budgetMinutes(s) >= SLOW_MIN),
    winCondition(_h, s) {
      const used = s.extra / budgetMinutes(s);
      if (s.pages) return { passed: false, value: used * 100, detail: `Someone got paged: the burn crossed 6× over 6 h and 30 m (or 14.4× over 1 h and 5 m). Keep the error rate under 0.6% at 99.9%.` };
      if (used < SLOW_MIN) return { passed: false, value: used * 100, detail: `Your incidents spent ${pct(used)} of the budget; spend at least ${SLOW_MIN * 100}% (${(SLOW_MIN * budgetMinutes(s)).toFixed(1)} full-outage minutes).` };
      if (!s.tickets) return { passed: false, value: used * 100, detail: "No ticket fired: the 3-day and 6-hour windows both need at least 1× burn." };
      return { passed: true, value: used * 100, detail: `${pct(used)} of the budget burned with no page and one ticket. This is why the workbook keeps a 3-day ticket rule: slow burns are real spend but not worth waking someone.` };
    },
    hint: "Between 1× and 6× burn is ticket territory at 99.9%: an error rate of 0.1%–0.6%, held for many hours.",
  },
  {
    id: "spend-budget",
    title: "Spend the budget, don't blow it",
    description: `A quiet month at 99.9%: baseline noise alone uses about 20% of the budget. Finish the 30 days with between 0% and ${SPEND_MAX * 100}% of the budget left. An unspent budget is velocity you didn't use.`,
    setup: { ...base, scenario: "quiet" },
    durationMs: 900_000,
    better: "lower",
    done: monthDone,
    winCondition(_h, s) {
      const left = budgetLeft(s);
      if (!monthDone(s)) return { passed: false, value: left * 100, detail: "The window hasn't finished. Let it run to day 30." };
      if (left < 0) return { passed: false, value: left * 100, detail: `Overspent: ${pct(left)} left, so the SLO is missed and the policy would freeze releases.` };
      return left <= SPEND_MAX
        ? { passed: true, value: left * 100, detail: `${pct(left)} left (${(left * budgetMinutes(s)).toFixed(1)} of ${budgetMinutes(s).toFixed(1)} min). The SLO held while you took the risk the budget allows.` }
        : { passed: false, value: left * 100, detail: `${pct(left)} left: the SLO held with room to spare. ${(left * budgetMinutes(s)).toFixed(1)} full-outage minutes went unused.` };
    },
    hint: "At 99.9% over 30 days the budget is 43.2 full-outage minutes. A 15-minute hard outage spends about a third of it.",
  },
];
