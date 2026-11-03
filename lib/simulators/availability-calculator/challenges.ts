import type { Challenge } from "@/lib/sim/engine";
import { avail, comps, fmtPct, total, type AvailConfig, type AvailState } from "./model";

/**
 * Why a design doesn't count yet, or "" if it does. Every role in `needs` must stay essential
 * (the system is down if all its components are down), and no component may beat its cap.
 */
function check(s: AvailState, needs: string[], cap: (role: string) => number, maxComps = Infinity) {
  const cs = comps(s);
  const over = cs.find((c) => c.pct > cap(c.role) + 1e-9);
  if (over) return `${over.name} is set to ${over.pct}%; the limit for it is ${cap(over.role)}%.`;
  const bypassed = needs.find((r) => avail(s, s.root, r) > 0);
  if (bypassed) return `Some path skips every ${cs.find((c) => c.role === bypassed)?.name ?? bypassed}. Each tier must stay on every path.`;
  if (cs.length > maxComps) return `${cs.length} components; the budget is ${maxComps}.`;
  return "";
}

const done = (target: number, why: (s: AvailState) => string) => (s: AvailState) => !why(s) && total(s) >= target;

const fourNinesWhy = (s: AvailState) => check(s, ["lb", "app", "db"], () => 99.9);
const sparesWhy = (s: AvailState) => check(s, ["cdn", "gw", "svcA", "svcB", "db"], (r) => ({ cdn: 99.99, gw: 99.95, db: 99.95 })[r] ?? 99.9, 7);

export const challenges: Challenge<AvailConfig, AvailState>[] = [
  {
    id: "four-nines",
    title: "99.99% from 99.9% parts",
    description: "A load balancer, an app server and a database, each 99.9% (0.999³ ≈ 99.7%). Reach 99.99% overall without making any component better than 99.9% and without removing a tier from the path.",
    setup: { start: "tiers" },
    durationMs: 600_000,
    better: "higher",
    done: done(0.9999, fourNinesWhy),
    winCondition(_h, s) {
      const a = total(s), why = fourNinesWhy(s);
      if (why) return { passed: false, value: a * 100, detail: why };
      return a >= 0.9999
        ? { passed: true, value: a * 100, detail: `${fmtPct(a)}: each tier is now a redundant set, and the series product of near-1 numbers stays near 1.` }
        : { passed: false, value: a * 100, detail: `${fmtPct(a)}. A chain is never better than its weakest stage: every stage needs to be above 99.99%.` };
    },
    hint: "Two independent 99.9% copies in parallel give 1 − 0.001² = 99.9999%. Which stages are still single?",
  },
  {
    id: "two-spares",
    title: "Two spares, best spot",
    description: "CDN 99.99%, gateway 99.95%, two services 99.9%, database 99.95%: 99.69% today. You may add two components (7 in total) and must keep every tier. Reach 99.85%.",
    setup: { start: "practice" },
    durationMs: 600_000,
    better: "higher",
    done: done(0.9985, sparesWhy),
    winCondition(_h, s) {
      const a = total(s), why = sparesWhy(s);
      if (why) return { passed: false, value: a * 100, detail: why };
      return a >= 0.9985
        ? { passed: true, value: a * 100, detail: `${fmtPct(a)}: the spares went to the two weakest links, which together caused most of the downtime.` }
        : { passed: false, value: a * 100, detail: `${fmtPct(a)}. Redundancy only pays at the weakest link; look at each stage's share of downtime.` };
    },
    hint: "Each stage's share of downtime is printed under it. Spend the spares where the shares are largest.",
  },
];
