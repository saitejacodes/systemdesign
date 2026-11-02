import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { MODES, outboxModel, type OutboxConfig, type OutboxState } from "./model";
import { OutboxView } from "./view";

const delayTone = (v: number) => (v >= 1000 ? "over" : v >= 200 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);
const bad = (v: number) => (v > 0 ? "over" : "ok");

export const definition: SimDefinition<OutboxConfig, OutboxState> = {
  model: outboxModel,
  defaultConfig: { mode: "commit-publish", orderRate: 20, crashPct: 2, relayCrashPct: 5, pollMs: 500, batch: 50, dedupe: false, maxOrders: 0 },
  controls: [
    { key: "mode", label: "How the order is saved and announced", type: "select", options: MODES },
    { key: "orderRate", label: "Orders", type: "number", min: 5, max: 300, step: 5, unit: "/s" },
    { key: "crashPct", label: "Service fails between steps", type: "number", min: 0, max: 50, step: 1, unit: "%", help: "A crash, deploy or timeout between the two writes (inside the transaction for the outbox)." },
    { key: "relayCrashPct", label: "Relay crashes per poll", type: "number", min: 0, max: 50, step: 1, unit: "%", help: "Mid-publish, before it marks rows published." },
    { key: "pollMs", label: "Relay poll interval", type: "number", min: 50, max: 2000, step: 50, unit: " ms", help: "Rows wait up to one interval before they are published." },
    { key: "batch", label: "Relay batch size", type: "number", min: 10, max: 500, step: 10, unit: " rows" },
    { key: "dedupe", label: "Idempotent consumer (dedupe by event id)", type: "toggle" },
    { key: "maxOrders", label: "Stop after", type: "number", min: 0, max: 5000, step: 100, unit: " orders", help: "0 = run forever. Set 1,000 to run a fixed batch." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Two writes, two systems", body: "The order service saves an order in the database and announces OrderPlaced on the broker. Dots show each hop; the consumer is the email or stock service." },
    { target: "controls", title: "The dual-write bug", body: "Commit-then-publish leaves orders nobody hears about when the service dies in between. Publish-then-commit announces orders that never got saved. Try both." },
    { target: "controls", title: "The outbox", body: "Write the order and its event row in one transaction, and a relay publishes outbox rows on a timer. The poll interval and batch size set the publish delay." },
    { target: "faults", title: "Crash the relay", body: "If the relay dies after publishing but before marking rows, it publishes them again. The outbox is at-least-once; turn on the idempotent consumer to drop duplicates." },
    { target: "challenges", title: "Prove it", body: "Break the dual write, survive relay crashes with no double processing, run 1,000 orders through random crashes with zero inconsistencies, and tune the relay." },
  ],
  View: OutboxView,
  cards: [
    { key: "inconsistencies", label: "Inconsistencies", digits: 0, tone: bad },
    { key: "missing", label: "Orders with no event", digits: 0, tone: bad },
    { key: "phantom", label: "Events with no order", digits: 0, tone: bad },
    { key: "duplicates", label: "Duplicate events", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "doubleProcessed", label: "Processed twice", digits: 0, tone: bad },
    { key: "p99", label: "Publish delay p99", unit: "ms", digits: 0, tone: delayTone },
    { key: "backlog", label: "Outbox backlog", digits: 0, tone: (v) => (v >= 1000 ? "over" : v >= 200 ? "hot" : "ok") },
    { key: "committed", label: "Orders saved", digits: 0 },
  ],
  charts: [
    { title: "Publish delay (commit → broker)", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-1)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Outbox backlog", keys: [{ key: "backlog", label: "Unpublished rows", color: "var(--phase-3)" }] },
    { title: "Correctness", keys: [{ key: "inconsistencies", label: "Inconsistencies", color: "var(--status-over)" }, { key: "duplicates", label: "Duplicates", color: "var(--status-hot)" }, { key: "doubleProcessed", label: "Processed twice", color: "var(--phase-4)" }] },
  ],
  hud: (m) => [
    { k: "INCONS", v: String(m.inconsistencies ?? 0), tone: m.inconsistencies ? "over" : undefined },
    { k: "DUPES", v: String(m.duplicates ?? 0), tone: m.duplicates ? "hot" : undefined },
    { k: "DELAY P99", v: `${Math.round(m.p99 ?? 0)} ms`, tone: quiet(delayTone(m.p99 ?? 0)) },
  ],
};
