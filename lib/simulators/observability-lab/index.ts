import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { obsModel, SERVICES, type ObsConfig, type ObsState } from "./model";
import { ObsView } from "./view";

const errTone = (v: number) => (v >= 5 ? "over" : v >= 1 ? "hot" : "ok");
const p99Tone = (v: number) => (v >= 2000 ? "over" : v >= 500 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);
const COLORS = ["var(--cobalt)", "var(--phase-1)", "var(--phase-3)", "var(--phase-4)", "var(--phase-6)"];
const per = (k: string) => SERVICES.map((c, i) => ({ key: `${k}_${c}`, label: c, color: COLORS[i] }));

export const definition: SimDefinition<ObsConfig, ObsState> = {
  model: obsModel,
  defaultConfig: { rps: 40, infoLogs: "10%", sampling: "tail", incident: "none" },
  controls: [
    { key: "rps", label: "Traffic at the gateway", type: "number", min: 10, max: 120, step: 10, unit: " req/s", help: "Poisson arrivals over four routes: profiles, products, order history and checkout." },
    { key: "infoLogs", label: "INFO log sampling", type: "select", options: [{ value: "all", label: "Keep all INFO" }, { value: "10%", label: "Keep 10% of INFO" }, { value: "none", label: "WARN and above only" }], help: "WARN and ERROR are always kept. Log volume is the main cost of logging." },
    { key: "sampling", label: "Trace sampling", type: "select", options: [{ value: "tail", label: "Tail: errors + slow + 5%" }, { value: "head", label: "Head: random 10% at the edge" }], help: "Head sampling decides before the outcome is known, so most error traces are dropped. Tail sampling decides after the trace finishes." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "A shop that talks", body: "A gateway fronts four services backed by Postgres, a 3-node Redis cache and a payment provider. Every request leaves metrics, logs and, if sampled, a trace." },
    { target: "canvas", title: "Metrics: RED per component", body: "Rate, errors and duration (p50/p99) for each service and dependency, plus one saturation gauge each: pool, heap, load, hit ratio. Metrics tell you that something is wrong and where to look." },
    { target: "canvas", title: "Logs and traces", body: "Filter logs by service, level or request id. Every line carries the W3C trace id; click it to open the waterfall and find the span with the most self time." },
    { target: "canvas", title: "Incident mode", body: "Start an incident. You get a page describing only the symptom. Find the root cause and the component, then submit. Faster and first-try scores higher; wrong answers get a nudge." },
    { target: "faults", title: "Learn the signatures", body: "Break it applies each failure openly, so you can see what a slow query, a dead cache node or a memory leak looks like before you face it blind." },
    { target: "challenges", title: "Prove it", body: "Find a slow checkout, tell a cache failure from a database problem, then solve all five." },
  ],
  View: ObsView,
  cards: [
    { key: "rps_gateway", label: "Gateway rate", unit: "req/s", digits: 0 },
    { key: "err_gateway", label: "Gateway errors", unit: "%", digits: 1, tone: errTone },
    { key: "p99_gateway", label: "Gateway p99", unit: "ms", digits: 0, tone: p99Tone },
    { key: "hit", label: "Cache hit ratio", unit: "%", digits: 0, tone: (v) => (v < 75 ? "over" : v < 90 ? "hot" : "ok") },
    { key: "dbLoad", label: "Postgres load", unit: "%", digits: 0, tone: (v) => (v >= 80 ? "over" : v >= 50 ? "hot" : "ok") },
    { key: "heap", label: "Inventory heap", unit: "MB", digits: 0, tone: (v) => (v >= 1640 ? "over" : v >= 1430 ? "hot" : "ok") },
    { key: "logRate", label: "Log lines/s", digits: 0 },
    { key: "score", label: "Score", digits: 0 },
  ],
  charts: [
    { title: "p99 latency by service", unit: "ms", keys: per("p99") },
    { title: "Error rate by service", unit: "%", keys: per("err") },
    { title: "Request rate by service", unit: "req/s", keys: per("rps") },
  ],
  hud: (m) => [
    { k: "GW ERR", v: `${(m.err_gateway ?? 0).toFixed(1)}%`, tone: quiet(errTone(m.err_gateway ?? 0)) },
    { k: "GW P99", v: `${Math.round(m.p99_gateway ?? 0)} ms`, tone: quiet(p99Tone(m.p99_gateway ?? 0)) },
    { k: "SOLVED", v: `${m.solved ?? 0}/5` },
    { k: "SCORE", v: String(m.score ?? 0) },
  ],
};
