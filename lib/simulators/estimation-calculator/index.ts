import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { estModel, type EstConfig, type EstState } from "./model";
import { EstView } from "./view";

export const definition: SimDefinition<EstConfig, EstState> = {
  model: estModel,
  defaultConfig: { dauM: 200, peakFactor: 3, retentionYears: 5, replication: 3, cacheHit: 90, qpsPerServer: 1000, hotPct: 20 },
  controls: [
    { key: "dauM", label: "Daily active users", type: "number", min: 1, max: 2000, step: 1, unit: "M" },
    { key: "peakFactor", label: "Peak ÷ average", type: "number", min: 1, max: 10, step: 0.5, unit: "×", help: "Traffic bunches into busy hours; 2–5× is common." },
    { key: "retentionYears", label: "Retention", type: "number", min: 1, max: 20, step: 1, unit: " yr" },
    { key: "replication", label: "Replication factor", type: "number", min: 1, max: 5, step: 1, unit: " copies" },
    { key: "qpsPerServer", label: "QPS per app server", type: "number", min: 100, max: 20_000, step: 100, unit: "/s" },
    { key: "cacheHit", label: "Cache hit target", type: "number", min: 0, max: 99, step: 1, unit: "%" },
    { key: "hotPct", label: "Hot set (share of daily reads)", type: "number", min: 1, max: 100, step: 1, unit: "%" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Describe the product", body: "List up to four things a user does each day, whether each one reads or writes, and how many bytes it carries." },
    { target: "controls", title: "Set the scale", body: "Daily users, peak factor, retention and replication turn per-user habits into fleet-wide numbers." },
    { target: "canvas", title: "Read the working", body: "Every output shows its formula with your numbers substituted, the way you would say it out loud in an interview." },
    { target: "canvas", title: "Drill", body: "Switch to Drills: ten products, calculator hidden. Within ±50% passes: the goal is the right order of magnitude, fast." },
    { target: "challenges", title: "Prove it", body: "Pass five drills, then pass one in under three minutes. Press Play so the drill clock runs." },
  ],
  View: EstView,
  cards: [
    { key: "passed", label: "Drills passed", digits: 0 },
    { key: "tried", label: "Drills tried", digits: 0 },
    { key: "drillSec", label: "Current drill", unit: " s", digits: 0 },
  ],
  charts: [],
  hud: (m) => [{ k: "Drills", v: `${m.passed ?? 0}/10` }],
};
