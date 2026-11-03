import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { MODES, RESOLVES, capModel, type CapConfig, type CapState } from "./model";
import { CapView } from "./view";

const count = (v: number) => (v > 0 ? "over" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<CapConfig, CapState> = {
  model: capModel,
  defaultConfig: { nodes: 3, mode: "cp", resolve: "lww", delay: 40, rate: 5, readPct: 50 },
  controls: [
    { key: "mode", label: "Mode", type: "select", options: MODES, help: "CP: every read and write needs a majority, or it is refused. AP: each node answers from its own copy and replicates in the background." },
    { key: "resolve", label: "AP conflict resolution", type: "select", options: RESOLVES, help: "What a replica does with two versions of a cart that were written without seeing each other." },
    { key: "nodes", label: "Replicas", type: "number", min: 3, max: 5, step: 1 },
    { key: "delay", label: "Link delay", type: "number", min: 5, max: 200, step: 5, unit: " ms", help: "One way, between any two replicas." },
    { key: "rate", label: "Requests per client", type: "number", min: 1, max: 20, step: 1, unit: "/s" },
    { key: "readPct", label: "Reads", type: "number", min: 0, max: 90, step: 10, unit: "%" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Replicas of three carts", body: "Each box is a replica holding three shopping carts; the client under it sends reads and writes to that node. Blue dots carry versions between replicas, plum dots are quorum requests and acks." },
    { target: "canvas", title: "Cut a link", body: "Click a link (or its ✂ marker) to cut it, click again to restore it. A node can't tell a cut link from a slow peer: it only sees that nothing arrives." },
    { target: "controls", title: "Refuse or diverge", body: "In CP a node that can't reach a majority refuses every request. In AP every node keeps answering, so reads go stale and both sides write the same cart." },
    { target: "metrics", title: "Heal and count the damage", body: "On heal, replicas swap versions. Version vectors spot concurrent writes; last-write-wins silently drops one, siblings keep both until a client merges them." },
    { target: "canvas", title: "Else: latency", body: "With every link up, CP still waits a majority round trip (about 2 × link delay) per request while AP answers in about 1 ms. That is the ELC half of PACELC." },
    { target: "challenges", title: "Prove it", body: "Catch a stale read, make a minority refuse, heal without losing a write, and price consistency when nothing is broken." },
  ],
  View: CapView,
  cards: [
    { key: "wP50", label: "Write p50", unit: "ms", digits: 0 },
    { key: "rP99", label: "Read p99", unit: "ms", digits: 0 },
    { key: "rejected", label: "Rejected requests", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "stale", label: "Stale reads", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "stalePart", label: "Stale across a cut", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "conflicts", label: "Conflicts on heal", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "lost", label: "Lost writes (LWW)", digits: 0, tone: count },
    { key: "divergent", label: "Carts diverged", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
  ],
  charts: [
    { title: "Write latency", unit: "ms", keys: [{ key: "wP50", label: "p50", color: "var(--phase-4)" }, { key: "wP99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Requests per second", unit: "/s", keys: [{ key: "okQps", label: "Writes acked", color: "var(--status-ok)" }, { key: "rejectedQps", label: "Rejected", color: "var(--status-over)" }, { key: "staleQps", label: "Stale reads", color: "var(--status-hot)" }] },
  ],
  hud: (m) => [
    { k: "W P50", v: `${Math.round(m.wP50 ?? 0)} ms` },
    { k: "REJ", v: String(m.rejected ?? 0), tone: m.rejected ? "hot" : undefined },
    { k: "STALE", v: String(m.stale ?? 0), tone: m.stale ? "hot" : undefined },
    { k: "LOST", v: String(m.lost ?? 0), tone: quiet(count(m.lost ?? 0)) },
  ],
};
