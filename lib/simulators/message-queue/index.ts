import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { MAX_PARTS, MODES, mqModel, type MqConfig, type MqState } from "./model";
import { MqView } from "./view";

const lagTone = (v: number) => (v >= 2000 ? "over" : v >= 300 ? "hot" : "ok");
const bad = (v: number) => (v > 0 ? "over" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<MqConfig, MqState> = {
  model: mqModel,
  defaultConfig: { mode: "log", rate: 200, keys: 20, keyDist: "uniform", partitions: 4, consumers: 3, procMs: 8, failPct: 0, commit: "after", idempotent: false, maxAttempts: 5, visibilityMs: 1000, groups: false, backlog: 0, crashAt: 0, poisonAt: 0 },
  controls: [
    { key: "mode", label: "Broker", type: "select", options: MODES, help: "Switching starts a fresh broker." },
    { key: "rate", label: "Producer rate", type: "number", min: 10, max: 1000, step: 10, unit: "/s" },
    { key: "keys", label: "Keys", type: "number", min: 1, max: 100, step: 1, help: "e.g. account ids. Order matters per key." },
    { key: "keyDist", label: "Key distribution", type: "select", options: [{ value: "uniform", label: "Uniform" }, { value: "hot", label: "One hot key (50%)" }] },
    { key: "partitions", label: "Partitions", type: "number", min: 1, max: MAX_PARTS, step: 1, help: "Log mode. Can only grow, as in Kafka." },
    { key: "consumers", label: "Consumers per group", type: "number", min: 1, max: 8, step: 1 },
    { key: "procMs", label: "Processing time", type: "number", min: 1, max: 100, step: 1, unit: " ms", help: "Per message, ±50% jitter. Consumers fetch batches of up to 10." },
    { key: "failPct", label: "Transient failures", type: "number", min: 0, max: 50, step: 1, unit: "%" },
    { key: "commit", label: "Commit / ack", type: "select", options: [{ value: "after", label: "After processing" }, { value: "before", label: "Before processing" }] },
    { key: "idempotent", label: "Idempotent consumer", type: "toggle", help: "Dedupe by message id: duplicates become harmless." },
    { key: "maxAttempts", label: "Max attempts → DLQ", type: "number", min: 0, max: 10, step: 1, help: "0 = retry forever. Queue mode: maxReceiveCount." },
    { key: "visibilityMs", label: "Visibility timeout", type: "number", min: 50, max: 10000, step: 50, unit: " ms", help: "Queue mode." },
    { key: "groups", label: "Second consumer group", type: "toggle", help: "Log mode. Reads the same topic with its own offsets." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Producers, a broker, consumers", body: "Messages flow from producers into partitions (log mode) or one queue, then to consumers. In each partition strip, grey is committed, green is processed but not yet committed, blue is lag." },
    { target: "controls", title: "Log or queue", body: "A log keeps messages and each group tracks an offset per partition; one consumer owns a partition, so a key stays in order. A queue hands each message to whichever consumer is free and deletes it on ack." },
    { target: "faults", title: "Crash a consumer", body: "Commit before processing and a crash loses messages. Commit after and the crash replays them instead: duplicates. The idempotent consumer makes those harmless." },
    { target: "metrics", title: "Watch lag and the bad counters", body: "Lag per partition, duplicates, lost, out-of-order deliveries per key and DLQ size. A poison message with unlimited retries blocks its whole partition." },
    { target: "challenges", title: "Prove it", body: "Lose nothing in a crash, keep per-key order with 4 consumers, clear a 10k backlog and dead-letter a poison message." },
  ],
  View: MqView,
  cards: [
    { key: "throughput", label: "Throughput", unit: "/s", digits: 0 },
    { key: "lag", label: "Consumer lag", digits: 0, tone: lagTone },
    { key: "dups", label: "Duplicates", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "deduped", label: "Deduped", digits: 0 },
    { key: "lost", label: "Lost", digits: 0, tone: bad },
    { key: "ooo", label: "Out of order", digits: 0, tone: bad },
    { key: "dlq", label: "DLQ size", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "lagB", label: "Group B lag", digits: 0 },
  ],
  charts: [
    { title: "Throughput", unit: "/s", keys: [{ key: "produced", label: "Produced", color: "var(--ink-muted)" }, { key: "throughput", label: "Processed (A)", color: "var(--cobalt)" }] },
    { title: "Lag per partition", keys: Array.from({ length: MAX_PARTS }, (_, i) => ({ key: `lag${i}`, label: `P${i}`, color: `var(--phase-${(i % 7) + 1})` })) },
    { title: "Delivery problems", keys: [{ key: "dups", label: "Duplicates", color: "var(--status-hot)" }, { key: "lost", label: "Lost", color: "var(--status-over)" }, { key: "ooo", label: "Out of order", color: "var(--phase-4)" }] },
  ],
  hud: (m) => [
    { k: "TPUT", v: `${Math.round(m.throughput ?? 0)}/s` },
    { k: "LAG", v: String(m.lag ?? 0), tone: quiet(lagTone(m.lag ?? 0)) },
    { k: "LOST", v: String(m.lost ?? 0), tone: m.lost ? "over" : undefined },
    { k: "DUP", v: String(m.dups ?? 0), tone: m.dups ? "hot" : undefined },
  ],
};
