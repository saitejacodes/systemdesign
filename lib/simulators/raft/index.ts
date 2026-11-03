import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { raftModel, type RaftConfig, type RaftState } from "./model";
import { RaftView } from "./view";

const p99Tone = (v: number) => (v >= 200 ? "over" : v >= 100 ? "hot" : "ok");

export const definition: SimDefinition<RaftConfig, RaftState> = {
  model: raftModel,
  defaultConfig: { timeoutMin: 150, timeoutMax: 300, heartbeat: 50, delay: 20, writeRate: 2 },
  controls: [
    { key: "timeoutMin", label: "Election timeout min", type: "number", min: 20, max: 3000, step: 10, unit: " ms", help: "Each follower waits a random time in [min, max] without hearing a leader before it runs. The Raft paper's example is 150–300 ms." },
    { key: "timeoutMax", label: "Election timeout max", type: "number", min: 20, max: 6000, step: 10, unit: " ms", help: "A wider spread makes split votes rarer." },
    { key: "heartbeat", label: "Heartbeat interval", type: "number", min: 10, max: 500, step: 10, unit: " ms", help: "Empty AppendEntries from the leader. Must be well under the election timeout." },
    { key: "delay", label: "Network delay (one way)", type: "number", min: 2, max: 200, step: 2, unit: " ms", help: "±20% jitter. A slow node's links are 6× slower." },
    { key: "writeRate", label: "Client writes", type: "number", min: 0, max: 20, step: 1, unit: "/s", help: "Each write goes to a node that believes it is leader." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Five nodes, one leader", body: "Blue is the leader, amber a candidate, white a follower; T is each node's term. The ring around a follower is its election timer running down: heartbeats from the leader (small blue dots) keep refilling it." },
    { target: "transport", title: "Slow it down", body: "Messages take about 20 ms, so set speed to 0.25× to watch RequestVote (amber) and AppendEntries (blue) travel. Hollow dots are replies." },
    { target: "canvas", title: "Crash the leader", body: "Use Crash leader. The follower whose random timeout fires first becomes a candidate in the next term, collects 3 of 5 votes and appends a no-op to commit everything before it." },
    { target: "canvas", title: "Partition and heal", body: "Drag the leader and one follower across the line (or use Side). The stranded leader keeps appending entries it can never commit; the other three elect a new leader. Heal, and watch the old entries get overwritten in the log table." },
    { target: "challenges", title: "Prove it", body: "Tune timeouts for a fast failover without false elections, strand a leader in the minority, then heal and reconcile the logs." },
  ],
  View: RaftView,
  cards: [
    { key: "term", label: "Term", digits: 0 },
    { key: "leader", label: "Leader (node, 0 = none)", digits: 0, tone: (v) => (v === 0 ? "over" : undefined) },
    { key: "commit", label: "Commit index", digits: 0 },
    { key: "uncommitted", label: "Leader's uncommitted entries", digits: 0, tone: (v) => (v >= 10 ? "hot" : undefined) },
    { key: "acked", label: "Writes acknowledged", digits: 0 },
    { key: "failed", label: "Writes failed (fate unknown)", digits: 0, tone: (v) => (v > 0 ? "hot" : undefined) },
    { key: "elections", label: "Elections started", digits: 0 },
    { key: "p99", label: "Commit p99", unit: "ms", digits: 0, tone: p99Tone },
    { key: "violations", label: "Safety violations", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
  ],
  charts: [
    { title: "Commit latency", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-4)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Term and commit index", keys: [{ key: "term", label: "Term", color: "var(--status-hot)" }, { key: "commit", label: "Commit index", color: "var(--cobalt)" }] },
    { title: "Messages in flight", keys: [{ key: "inflight", label: "Messages", color: "var(--phase-4)" }] },
  ],
  hud: (m) => [
    { k: "TERM", v: String(m.term ?? 0) },
    { k: "LEADER", v: m.leader ? `N${m.leader}` : "NONE", tone: m.leader ? undefined : "over" },
    { k: "COMMIT", v: String(m.commit ?? 0) },
    { k: "LEADERS", v: String(m.leaders ?? 0), tone: (m.leaders ?? 0) > 1 ? "hot" : undefined },
  ],
};
