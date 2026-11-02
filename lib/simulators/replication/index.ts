import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { MAX_NODES, MODES, replModel, type ReplConfig, type ReplState } from "./model";
import { ReplView } from "./view";

const p99Tone = (v: number) => (v >= 400 ? "over" : v >= 200 ? "hot" : "ok");
const staleTone = (v: number) => (v >= 0.5 ? "over" : v >= 0.1 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<ReplConfig, ReplState> = {
  model: replModel,
  defaultConfig: { followers: 3, mode: "async", delay: 50, slowFollower: 1, writeRate: 20, readRate: 100, readFrom: "follower", ryw: false, rywMs: 1000, monotonic: false, failoverMs: 2000, crashAt: 0 },
  controls: [
    { key: "mode", label: "Replication mode", type: "select", options: MODES },
    { key: "followers", label: "Followers", type: "number", min: 2, max: 4, step: 1 },
    { key: "delay", label: "Replication delay", type: "number", min: 5, max: 500, step: 5, unit: " ms", help: "One way, leader to follower. Acks take the same time back." },
    { key: "slowFollower", label: "Last follower delay ×", type: "number", min: 1, max: 10, step: 1, help: "A replica in another region." },
    { key: "writeRate", label: "Writes", type: "number", min: 5, max: 200, step: 5, unit: "/s", help: "Poisson writes from 100 users." },
    { key: "readRate", label: "Reads", type: "number", min: 10, max: 400, step: 10, unit: "/s" },
    { key: "readFrom", label: "Read from", type: "select", options: [{ value: "follower", label: "A random follower" }, { value: "leader", label: "The leader" }] },
    { key: "ryw", label: "Read-your-writes", type: "toggle", help: "Send a user's reads to the leader for a while after they write." },
    { key: "rywMs", label: "Read-your-writes window", type: "number", min: 100, max: 5000, step: 100, unit: " ms" },
    { key: "monotonic", label: "Monotonic reads (sticky follower)", type: "toggle" },
    { key: "failoverMs", label: "Failover timeout", type: "number", min: 500, max: 10000, step: 500, unit: " ms" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "One leader, a few copies", body: "Every write lands on the leader and gets a sequence number. Blue dots carry it to each follower; green dots are acks coming back. The bars are each node's log." },
    { target: "controls", title: "When does the client hear OK?", body: "Async says OK right away. Semi-sync waits for one follower, sync for all of them. Watch write latency move as you switch." },
    { target: "metrics", title: "Stale reads", body: "Followers trail the leader, so reads from them can be old. The worst case is a user not seeing the write they just made: read-your-writes and monotonic reads fix two specific symptoms." },
    { target: "faults", title: "Crash the leader", body: "After the failover timeout the most up-to-date follower takes over. Under async, writes it never received are gone even though clients got OK; they are listed in red." },
    { target: "challenges", title: "Prove it", body: "Hide replication lag from writers, then survive a leader crash without losing a write or blowing the latency budget." },
  ],
  View: ReplView,
  cards: [
    { key: "p50", label: "Write p50", unit: "ms", digits: 0 },
    { key: "p99", label: "Write p99", unit: "ms", digits: 0, tone: p99Tone },
    { key: "staleRate", label: "Stale reads", unit: "%", digits: 1, tone: staleTone },
    { key: "ownStale", label: "Missed own write", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "backwards", label: "Went back in time", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "lost", label: "Lost writes", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
    { key: "stalled", label: "Writes waiting", digits: 0, tone: (v) => (v >= 50 ? "over" : v >= 10 ? "hot" : "ok") },
    { key: "maxLag", label: "Max lag", unit: "ms", digits: 0, tone: (v) => (v >= 1000 ? "over" : v >= 200 ? "hot" : "ok") },
  ],
  charts: [
    { title: "Write latency", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-1)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Replication lag", unit: "ms", keys: Array.from({ length: MAX_NODES }, (_, i) => ({ key: `lag${i}`, label: `N${i + 1}`, color: `var(--phase-${[1, 2, 3, 4, 6][i]})` })) },
    { title: "Stale reads", unit: "%", keys: [{ key: "stalePct", label: "Behind leader", color: "var(--status-hot)" }, { key: "ownStalePct", label: "Missed own write", color: "var(--status-over)" }] },
  ],
  hud: (m) => [
    { k: "W P99", v: `${Math.round(m.p99 ?? 0)} ms`, tone: quiet(p99Tone(m.p99 ?? 0)) },
    { k: "STALE", v: `${((m.staleRate ?? 0) * 100).toFixed(0)}%`, tone: quiet(staleTone(m.staleRate ?? 0)) },
    { k: "LOST", v: String(m.lost ?? 0), tone: m.lost ? "over" : undefined },
  ],
};
