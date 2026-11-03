import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { MODES, sagaModel, type SagaConfig, type SagaState } from "./model";
import { SagaView } from "./view";

const bad = (v: number) => (v > 0 ? "over" : "ok");
const latTone = (v: number) => (v >= 1000 ? "over" : v >= 300 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<SagaConfig, SagaState> = {
  model: sagaModel,
  defaultConfig: { mode: "orchestration", orderRate: 5, failPct: 10, lossPct: 3, compensate: true, retry: false, idempotent: false, hopMs: 60, maxOrders: 0 },
  controls: [
    { key: "mode", label: "How the order spans the services", type: "select", options: MODES },
    { key: "orderRate", label: "Orders", type: "number", min: 1, max: 300, step: 1, unit: "/s" },
    { key: "failPct", label: "Orders that fail a step", type: "number", min: 0, max: 50, step: 1, unit: "%", help: "Card declined, out of stock or no courier, spread over payment, inventory and shipping. In 2PC that participant votes NO." },
    { key: "lossPct", label: "Messages lost", type: "number", min: 0, max: 30, step: 1, unit: "%", help: "Half are lost before the service acts, half after (the reply or ack is lost). Sagas only." },
    { key: "compensate", label: "Run compensations (refund, release, cancel)", type: "toggle" },
    { key: "retry", label: "Retry until acknowledged (backoff)", type: "toggle", help: "Orchestration: re-send on timeout. Choreography: the broker redelivers unacked events (outbox + at-least-once)." },
    { key: "idempotent", label: "Idempotency key per step", type: "toggle", help: "A service remembers saga id + step and ignores a repeat instead of charging, refunding or reserving again." },
    { key: "hopMs", label: "Network hop", type: "number", min: 1, max: 200, step: 1, unit: " ms", help: "One-way delay. Each local commit is a 2 ms fsync." },
    { key: "maxOrders", label: "Stop after", type: "number", min: 0, max: 2000, step: 50, unit: " orders", help: "0 = run forever." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "One order, four databases", body: "Order, payment, inventory and shipping each commit locally. Blue dots are forward steps, amber dots compensations, a red ✕ is a lost message." },
    { target: "controls", title: "Saga: undo in reverse", body: "When a step fails, the completed steps are compensated newest first: release stock, refund, cancel. Turn compensations off and money stays captured for dead orders." },
    { target: "controls", title: "Lost messages", body: "A lost command leaves the order stuck; a lost reply makes a retry repeat work. Compensations must be retried until they succeed and be idempotent, so you need both toggles." },
    { target: "faults", title: "2PC blocks", body: "Switch to two-phase commit and crash the coordinator after PREPARE. Participants that voted YES can't commit or abort, so they hold their locks and every order queues on the stock row." },
    { target: "challenges", title: "Prove it", body: "Settle 100 orders with zero inconsistent states, show 2PC blocking, then push 150 orders/s past one hot stock row." },
  ],
  View: SagaView,
  cards: [
    { key: "inconsistent", label: "Inconsistent orders", digits: 0, tone: bad },
    { key: "completed", label: "Completed", digits: 0 },
    { key: "compensated", label: "Compensated / aborted", digits: 0 },
    { key: "stuck", label: "Stuck", digits: 0, tone: bad },
    { key: "lockP99", label: "Stock row lock p99", unit: "ms", digits: 0, tone: (v) => (v >= 1000 ? "over" : v >= 20 ? "hot" : "ok") },
    { key: "doubtMs", label: "In doubt for", unit: "ms", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
    { key: "blocked", label: "Blocked on stock row", digits: 0, tone: (v) => (v >= 50 ? "over" : v > 0 ? "hot" : "ok") },
    { key: "p99", label: "Order latency p99", unit: "ms", digits: 0, tone: latTone },
  ],
  charts: [
    { title: "Outcomes", keys: [{ key: "completed", label: "Completed", color: "var(--phase-1)" }, { key: "compensated", label: "Compensated", color: "var(--phase-4)" }, { key: "stuck", label: "Stuck", color: "var(--status-hot)" }, { key: "inconsistent", label: "Inconsistent", color: "var(--status-over)" }] },
    { title: "Locks", unit: "ms", keys: [{ key: "lockP99", label: "Stock row lock p99", color: "var(--cobalt)" }, { key: "doubtMs", label: "In doubt", color: "var(--status-over)" }] },
    { title: "Order latency", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-1)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
  ],
  hud: (m) => [
    { k: "INCONS", v: String(m.inconsistent ?? 0), tone: m.inconsistent ? "over" : undefined },
    { k: "STUCK", v: String(m.stuck ?? 0), tone: m.stuck ? "hot" : undefined },
    { k: "LOCKS", v: String(m.locksHeld ?? 0), tone: m.doubtMs ? "over" : undefined },
    { k: "P99", v: `${Math.round(m.p99 ?? 0)} ms`, tone: quiet(latTone(m.p99 ?? 0)) },
  ],
};
