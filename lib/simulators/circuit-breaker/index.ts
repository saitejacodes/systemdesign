import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { B_FAULTS, WINDOWS, cbModel, type CbConfig, type CbState } from "./model";
import { CbView } from "./view";

const p99Tone = (v: number) => (v >= 500 ? "over" : v >= 100 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);
const STATE = ["CLOSED", "HALF-OPEN", "OPEN"];

export const definition: SimDefinition<CbConfig, CbState> = {
  model: cbModel,
  defaultConfig: { rate: 300, timeoutMs: 1000, fallback: true, breaker: true, threshold: 50, windowType: "count", windowSize: 100, minCalls: 20, waitMs: 5000, probes: 10, bCapacity: 500, noisePct: 1, bFault: "hang", faultAt: 5, faultFor: 10 },
  controls: [
    { key: "breaker", label: "Circuit breaker", type: "toggle" },
    { key: "threshold", label: "Failure-rate threshold", type: "number", min: 5, max: 100, step: 5, unit: "%", help: "Open when this share of the window failed (Resilience4j default 50%)." },
    { key: "windowType", label: "Sliding window", type: "select", options: WINDOWS },
    { key: "windowSize", label: "Window size", type: "number", min: 1, max: 200, step: 1, help: "Calls for a count-based window, seconds for a time-based one." },
    { key: "minCalls", label: "Minimum calls", type: "number", min: 1, max: 200, step: 1, help: "No decision until the window holds this many calls." },
    { key: "waitMs", label: "Wait in open", type: "number", min: 500, max: 30000, step: 500, unit: " ms" },
    { key: "probes", label: "Calls permitted in half-open", type: "number", min: 1, max: 100, step: 1 },
    { key: "timeoutMs", label: "A's timeout on B", type: "number", min: 20, max: 3000, step: 10, unit: " ms", help: "B's healthy p99 is about 50 ms." },
    { key: "fallback", label: "Fallback: cached response", type: "toggle" },
    { key: "rate", label: "Requests to A", type: "number", min: 5, max: 1000, step: 5, unit: "/s" },
    { key: "bCapacity", label: "B capacity (warm)", type: "number", min: 100, max: 2000, step: 50, unit: "/s" },
    { key: "noisePct", label: "B background errors", type: "number", min: 0, max: 50, step: 1, unit: "%" },
    { key: "bFault", label: "Scheduled fault on B", type: "select", options: B_FAULTS },
    { key: "faultAt", label: "Fault starts at", type: "number", min: 1, max: 30, step: 1, unit: " s" },
    { key: "faultFor", label: "Fault lasts", type: "number", min: 1, max: 30, step: 1, unit: " s" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "A calls B through a breaker", body: "Blue dots are calls in flight to B. The breaker records each outcome in a sliding window; the strip below shows them, red for failures and timeouts." },
    { target: "canvas", title: "Three states", body: "Closed: calls flow. Open: calls are rejected at once and A serves its fallback. After the wait, half-open lets a few trial calls (orange) through; they decide whether to close or open again." },
    { target: "transport", title: "Watch B go down", body: "Press play. B hangs at 5 s. Nothing is recorded until calls time out, so the breaker can react no faster than A's timeout. At 15 s B comes back cold, at 20% capacity." },
    { target: "controls", title: "Tune it", body: "Threshold, window and minimum calls decide when it trips; wait and trial calls decide how traffic returns. A short timeout makes failures cheap and makes a slow B visible." },
    { target: "challenges", title: "Prove it", body: "Keep A fast through an outage without knocking a recovering B over, then tune a quiet path to trip on outages but not on noise." },
  ],
  View: CbView,
  cards: [
    { key: "opens", label: "Trips", digits: 0 },
    { key: "p99", label: "A p99", unit: "ms", digits: 0, tone: p99Tone },
    { key: "toB", label: "Calls to B", unit: "/s", digits: 0 },
    { key: "bCap", label: "B capacity now", unit: "/s", digits: 0 },
    { key: "fallbackPct", label: "Fallbacks", unit: "%", digits: 0, tone: (v) => (v >= 50 ? "over" : v > 5 ? "hot" : "ok") },
    { key: "errorPct", label: "Errors to users", unit: "%", digits: 0, tone: (v) => (v >= 10 ? "over" : v > 1 ? "hot" : "ok") },
    { key: "failPct", label: "Window failure rate", unit: "%", digits: 0 },
    { key: "reCrashes", label: "B fell over again", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
  ],
  charts: [
    { title: "A's latency", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-4)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Load on B vs its capacity", unit: "/s", keys: [{ key: "toB", label: "Calls to B", color: "var(--status-hot)" }, { key: "bCap", label: "B capacity", color: "var(--ink)" }] },
    { title: "What users got", unit: "%", keys: [{ key: "okPct", label: "Real answer", color: "var(--status-ok)" }, { key: "fallbackPct", label: "Fallback", color: "var(--status-hot)" }, { key: "errorPct", label: "Error", color: "var(--status-over)" }] },
  ],
  hud: (m) => [
    { k: "BREAKER", v: STATE[m.state ?? 0], tone: m.state === 2 ? "over" : m.state === 1 ? "hot" : undefined },
    { k: "A P99", v: `${Math.round(m.p99 ?? 0)} ms`, tone: quiet(p99Tone(m.p99 ?? 0)) },
    { k: "TO B", v: `${Math.round(m.toB ?? 0)}/s` },
  ],
};
