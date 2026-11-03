import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { ebModel, type EbConfig, type EbState } from "./model";
import { EbView } from "./view";

const budgetTone = (v: number) => (v <= 0 ? "over" : v < 25 ? "hot" : "ok");

export const definition: SimDefinition<EbConfig, EbState> = {
  model: ebModel,
  defaultConfig: { slo: "99.9", windowDays: "30", scenario: "release-month", baseErrPct: 0.02, minutesPerSecond: 720 },
  controls: [
    { key: "slo", label: "SLO target", type: "select", options: ["99", "99.5", "99.9", "99.95", "99.99"].map((v) => ({ value: v, label: `${v}%` })), help: "Changing it starts a new window. 99.9% over 30 days allows 43.2 minutes of full outage." },
    { key: "windowDays", label: "SLO window", type: "select", options: ["7", "28", "30"].map((v) => ({ value: v, label: `${v} days` })), help: "Alert thresholds scale with it: 14.4× is 2% of a 30-day budget in 1 h." },
    { key: "scenario", label: "Month", type: "select", options: [{ value: "release-month", label: "Scripted month + release reviews" }, { value: "random", label: "Random incidents + release reviews" }, { value: "quiet", label: "Quiet (only your incidents)" }] },
    { key: "baseErrPct", label: "Baseline error rate", type: "number", min: 0, max: 0.2, step: 0.01, unit: "%", help: "Background noise every minute. 0.02% uses a fifth of a 99.9% budget; at 99.99% it alone is a 2× burn." },
    { key: "minutesPerSecond", label: "Sim speed", type: "number", min: 60, max: 2880, step: 60, unit: " min/s", help: "720 min/s plays a 30-day window in 60 s." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "A month of errors", body: "Each bar is the burn rate for a slice of the window on a log scale: 1× spends the budget exactly by day 30. The blue line is the budget left." },
    { target: "canvas", title: "Three alert rules", body: "The dashed lines are the workbook's thresholds: page at 14.4× (1 h and 5 m), page at 6× (6 h and 30 m), ticket at 1× (3 d and 6 h). The lanes underneath show when each one fires." },
    { target: "canvas", title: "Break it yourself", body: "Inject a hard outage, a degraded hour or a slow leak and watch which rule catches it, how fast, and what it costs." },
    { target: "canvas", title: "The release board", body: "Time stops at each release review. Ship or hold by the policy: budget spent or a page firing means hold." },
    { target: "challenges", title: "Prove it", body: "Run the release board, hide a slow burn from the pager, and spend the budget without overspending it." },
  ],
  View: EbView,
  cards: [
    { key: "budgetLeft", label: "Budget left", unit: "%", digits: 1, tone: budgetTone },
    { key: "minutesLeft", label: "Full-outage min left", digits: 1 },
    { key: "burn1h", label: "Burn rate 1 h", unit: "×", digits: 2, tone: (v) => (v >= 14.4 ? "over" : v >= 1 ? "hot" : "ok") },
    { key: "burn6h", label: "Burn rate 6 h", unit: "×", digits: 2, tone: (v) => (v >= 6 ? "over" : v >= 1 ? "hot" : "ok") },
    { key: "burn3d", label: "Burn rate 3 d", unit: "×", digits: 2, tone: (v) => (v >= 1 ? "hot" : "ok") },
    { key: "pages", label: "Pages", digits: 0, tone: (v) => (v > 0 ? "over" : undefined) },
    { key: "tickets", label: "Tickets", digits: 0, tone: (v) => (v > 0 ? "hot" : undefined) },
    { key: "reviewsRight", label: "Reviews right", digits: 0 },
  ],
  charts: [
    { title: "Budget left", unit: "%", keys: [{ key: "budgetLeft", label: "Budget left", color: "var(--cobalt)" }] },
    { title: "Burn rate", unit: "×", keys: [{ key: "burn1h", label: "1 h", color: "var(--status-over)" }, { key: "burn6h", label: "6 h", color: "var(--phase-4)" }, { key: "burn3d", label: "3 d", color: "var(--status-hot)" }] },
  ],
  hud: (m) => [
    { k: "DAY", v: (m.day ?? 0).toFixed(1) },
    { k: "BUDGET", v: `${(m.budgetLeft ?? 100).toFixed(1)}%`, tone: budgetTone(m.budgetLeft ?? 100) === "ok" ? undefined : budgetTone(m.budgetLeft ?? 100) },
    { k: "PAGE", v: m.paging ? "FIRING" : "QUIET", tone: m.paging ? "over" : undefined },
  ],
};
