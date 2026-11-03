import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { FAULT_KINDS, POLICIES, retryModel, type RetryConfig, type RetryState } from "./model";
import { RetryView } from "./view";

const ampTone = (v: number) => (v >= 2 ? "over" : v >= 1.2 ? "hot" : "ok");
const succTone = (v: number) => (v < 50 ? "over" : v < 95 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<RetryConfig, RetryState> = {
  model: retryModel,
  defaultConfig: { clients: 1000, rate: 1000, capacity: 1200, policy: "immediate", maxRetries: 3, baseMs: 100, capMs: 5000, budget: false, timeoutMs: 1000, queueLimit: 0, dropExpired: false, fault: "errors", faultAt: 5, faultFor: 10 },
  controls: [
    { key: "policy", label: "Client retry policy", type: "select", options: POLICIES },
    { key: "maxRetries", label: "Max retries per request", type: "number", min: 0, max: 5, step: 1 },
    { key: "baseMs", label: "Backoff base", type: "number", min: 10, max: 1000, step: 10, unit: " ms", help: "First retry waits up to base; each further retry doubles it." },
    { key: "capMs", label: "Backoff cap", type: "number", min: 100, max: 10000, step: 100, unit: " ms" },
    { key: "budget", label: "Retry budget (≤10% extra)", type: "toggle", help: "Per-client token bucket: a success earns 0.1 token, a retry costs 1. No token, no retry." },
    { key: "timeoutMs", label: "Client timeout", type: "number", min: 100, max: 5000, step: 100, unit: " ms" },
    { key: "clients", label: "Clients", type: "number", min: 100, max: 5000, step: 100, help: "Each has its own retry budget, so more clients means a bigger burst of banked retries." },
    { key: "rate", label: "New requests", type: "number", min: 100, max: 2000, step: 50, unit: "/s" },
    { key: "capacity", label: "Service capacity", type: "number", min: 200, max: 3000, step: 50, unit: "/s" },
    { key: "queueLimit", label: "Server queue limit", type: "number", min: 0, max: 5000, step: 50, help: "0 = unbounded. Beyond the limit, arrivals get a cheap 503 (load shedding)." },
    { key: "dropExpired", label: "Server drops expired requests", type: "toggle", help: "Skip queued work whose client has already timed out." },
    { key: "fault", label: "Scheduled fault", type: "select", options: FAULT_KINDS },
    { key: "faultAt", label: "Fault starts at", type: "number", min: 1, max: 30, step: 1, unit: " s" },
    { key: "faultFor", label: "Fault lasts", type: "number", min: 1, max: 30, step: 1, unit: " s" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Clients, a queue, a service", body: "1,000 new requests a second meet a service that can do 1,200. The queue shows how long a new request would wait; past the dashed timeout line, every queued request belongs to a client that has already given up." },
    { target: "transport", title: "Watch it fail to recover", body: "Press play. At 5 s a bad deploy fails half the requests; at 15 s it is rolled back. Immediate retries push load past capacity, the queue outgrows the timeout, and the service stays down after the fix: a metastable failure." },
    { target: "controls", title: "Backoff, jitter, budget", body: "Backoff and full jitter change when retries go out, not how many. The retry budget caps retries at about 10% of successful traffic, which is what breaks the loop." },
    { target: "faults", title: "Restart the service", body: "Restarting fails every queued request at once. Watch the attempts chart: plain backoff sends the retries back as spikes, full jitter spreads them out." },
    { target: "challenges", title: "Prove it", body: "Recover within 5 s of the rollback, keep amplification under 1.2× through a brownout, and rescue the service from the server side when you can't change the clients." },
  ],
  View: RetryView,
  cards: [
    { key: "offered", label: "Offered load", unit: "/s", digits: 0 },
    { key: "amp", label: "Amplification", unit: "×", digits: 2, tone: ampTone },
    { key: "goodput", label: "Goodput", unit: "/s", digits: 0 },
    { key: "success", label: "User success", unit: "%", digits: 0, tone: succTone },
    { key: "wait", label: "Queue wait", unit: "ms", digits: 0, tone: (v) => (v >= 1000 ? "over" : v >= 500 ? "hot" : "ok") },
    { key: "wastedRate", label: "Wasted work", unit: "/s", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
    { key: "recoverS", label: "Time to recover", unit: "s", digits: 1 },
    { key: "p99", label: "User p99", unit: "ms", digits: 0 },
  ],
  charts: [
    { title: "Load vs capacity", unit: "/s", keys: [{ key: "offered", label: "Offered", color: "var(--status-hot)" }, { key: "newReqs", label: "New requests", color: "var(--cobalt)" }, { key: "capacity", label: "Capacity", color: "var(--ink)" }] },
    { title: "Useful vs wasted work", unit: "/s", keys: [{ key: "goodput", label: "Goodput", color: "var(--status-ok)" }, { key: "wastedRate", label: "Wasted", color: "var(--status-over)" }] },
    { title: "User success", unit: "%", keys: [{ key: "success", label: "Success", color: "var(--phase-4)" }] },
  ],
  hud: (m) => [
    { k: "AMP", v: `${(m.amp ?? 1).toFixed(2)}×`, tone: quiet(ampTone(m.amp ?? 1)) },
    { k: "OK", v: `${Math.round(m.success ?? 100)}%`, tone: quiet(succTone(m.success ?? 100)) },
    { k: "QUEUE", v: String(Math.round(m.queue ?? 0)) },
  ],
};
