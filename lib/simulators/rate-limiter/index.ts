import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { PATTERNS, rlModel, type RlConfig, type RlState } from "./model";
import { RlView } from "./view";

export const definition: SimDefinition<RlConfig, RlState> = {
  model: rlModel,
  defaultConfig: { pattern: "steady", traffic: 8, rate: 5, burst: 10, window: 1, distributed: false },
  controls: [
    { key: "pattern", label: "Traffic pattern", type: "select", options: PATTERNS },
    { key: "traffic", label: "Offered traffic", type: "number", min: 1, max: 50, step: 1, unit: "/s", help: "For steady and ramp patterns." },
    { key: "rate", label: "Sustained rate R", type: "number", min: 1, max: 20, step: 1, unit: "/s", help: "Token refill and leak rate. Window limit = R × W." },
    { key: "burst", label: "Burst B", type: "number", min: 1, max: 50, step: 1, help: "Token bucket capacity and leaky bucket queue size." },
    { key: "window", label: "Window W", type: "number", min: 1, max: 10, step: 1, unit: " s" },
    { key: "distributed", label: "Distributed: 3 servers", type: "toggle", help: "Compare local limiters on each server with one shared counter." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Same traffic, five limiters", body: "Every request is offered to all five algorithms at once. Green ticks were allowed, red rejected, grey are waiting in the leaky bucket's queue." },
    { target: "controls", title: "Two knobs", body: "R is the long-run rate. B is how much burst you tolerate. Window algorithms allow R × W per window." },
    { target: "canvas", title: "Watch the edges", body: "Dashed lines are window boundaries. Switch to the boundary attack and watch fixed window let two full bursts through back to back." },
    { target: "controls", title: "Go distributed", body: "Turn on 3 servers. If each server keeps its own bucket, a client spread across them gets up to 3× the limit." },
    { target: "challenges", title: "Prove it", body: "Break the fixed window, then tune a token bucket for bursts of 20 at 5/s." },
  ],
  View: RlView,
  cards: [
    { key: "offered", label: "Offered", unit: "/s", digits: 1 },
    { key: "tbAllowed", label: "Token bucket OK", unit: "/s", digits: 1 },
    { key: "tbMax1s", label: "Token burst · 1 s", digits: 0 },
    { key: "fwMaxW", label: "Fixed window peak", digits: 0 },
    { key: "slMaxW", label: "Sliding log peak", digits: 0 },
    { key: "local", label: "Local limits OK", unit: "/s", digits: 1 },
  ],
  charts: [
    { title: "Allowed per second (average)", keys: [{ key: "offered", label: "Offered", color: "var(--ink-muted)" }, { key: "tbAllowed", label: "Token", color: "var(--phase-1)" }, { key: "fwAllowed", label: "Fixed", color: "var(--phase-3)" }, { key: "local", label: "Local ×3", color: "var(--status-over)" }] },
  ],
  hud: (m) => [
    { k: "Offered", v: `${(m.offered ?? 0).toFixed(1)}/s` },
    { k: "Token", v: `${(m.tbAllowed ?? 0).toFixed(1)}/s` },
    { k: "Fixed peak", v: String(m.fwMaxW ?? 0) },
  ],
};
