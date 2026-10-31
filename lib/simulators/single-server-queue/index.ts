import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { queueModel, type QueueConfig, type QueueState } from "./model";
import { QueueView } from "./view";

const ms = (v: number) => `${Math.round(v)} ms`;

export const definition: SimDefinition<QueueConfig, QueueState> = {
  model: queueModel,
  defaultConfig: { lambda: 50, mu: 100 },
  controls: [
    { key: "lambda", label: "Arrival rate λ", type: "number", min: 5, max: 200, step: 5, unit: "/s", help: "Requests per second, Poisson arrivals." },
    { key: "mu", label: "Service rate μ", type: "number", min: 10, max: 300, step: 5, unit: "/s", help: "How many requests per second the server can finish." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "One server, one line", body: "Requests arrive at random (rate λ), wait in the queue, and are served one at a time (rate μ). Blue squares are waiting requests." },
    { target: "controls", title: "Change the rates", body: "Move λ close to μ and watch the queue: latency doesn't grow linearly, it explodes as utilization nears 100%." },
    { target: "metrics", title: "Read the tail", body: "p50 is the typical request. p99 is the slow one in a hundred, and users feel it. Watch how much faster p99 grows than p50." },
    { target: "faults", title: "Break it", body: "Inject a slow server. With μ/3 below λ the queue grows forever: that's what overload looks like." },
    { target: "challenges", title: "Prove it", body: "Pick the cheapest μ that keeps p99 under 200 ms at 80 requests/s." },
  ],
  View: QueueView,
  cards: [
    { key: "qps", label: "Throughput", unit: "/s", digits: 0 },
    { key: "utilization", label: "Utilization", unit: "%", digits: 0, tone: (v) => (v >= 0.95 ? "over" : v >= 0.8 ? "hot" : "ok") },
    { key: "queue", label: "Queue", digits: 0, tone: (v) => (v >= 200 ? "over" : v >= 30 ? "hot" : "ok") },
    { key: "p50", label: "p50", unit: "ms", digits: 0 },
    { key: "p95", label: "p95", unit: "ms", digits: 0 },
    { key: "p99", label: "p99", unit: "ms", digits: 0, tone: (v) => (v >= 200 ? "over" : v >= 100 ? "hot" : "ok") },
  ],
  charts: [
    { title: "Latency", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-1)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Queue length", keys: [{ key: "queue", label: "Queue", color: "var(--phase-3)" }] },
  ],
  hud: (m) => [
    { k: "QPS", v: Math.round(m.qps ?? 0).toString() },
    { k: "P99", v: ms(m.p99 ?? 0), tone: (m.p99 ?? 0) >= 200 ? "over" : (m.p99 ?? 0) >= 100 ? "hot" : undefined },
    { k: "Util", v: `${Math.round((m.utilization ?? 0) * 100)}%` },
  ],
};
