import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { MAX_NODES, PRESETS, quorumModel, type QuorumConfig, type QuorumState } from "./model";
import { QuorumView } from "./view";

const availTone = (v: number) => (v < 99 ? "over" : v < 100 ? "hot" : "ok");
const staleTone = (v: number) => (v > 1 ? "over" : v > 0 ? "hot" : "ok");

export const definition: SimDefinition<QuorumConfig, QuorumState> = {
  model: quorumModel,
  defaultConfig: { preset: "custom", n: 3, r: 1, w: 1, opsRate: 100, readPct: 50, latency: 1, crashAt: 0 },
  controls: [
    { key: "preset", label: "Preset", type: "select", options: PRESETS, help: "A preset overrides the three sliders below." },
    { key: "n", label: "N · replicas per key", type: "number", min: 1, max: MAX_NODES, step: 1 },
    { key: "r", label: "R · replies a read waits for", type: "number", min: 1, max: MAX_NODES, step: 1, help: "Clamped to N." },
    { key: "w", label: "W · acks a write waits for", type: "number", min: 1, max: MAX_NODES, step: 1, help: "Clamped to N." },
    { key: "opsRate", label: "Requests", type: "number", min: 10, max: 400, step: 10, unit: "/s", help: "Poisson arrivals over 8 keys." },
    { key: "readPct", label: "Reads", type: "number", min: 0, max: 100, step: 5, unit: "%" },
    { key: "latency", label: "Network delay ×", type: "number", min: 0.5, max: 10, step: 0.5, help: "Scales every replica-to-replica link." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "N copies of every key", body: "Each column is a replica with its version of 8 keys. A request lands on a random live replica, which coordinates it: writes go to all N, reads ask all N." },
    { target: "controls", title: "Set N, R and W", body: "A write is acknowledged after W replies; a read returns the newest of the first R. The banner tells you whether R + W > N, the overlap rule." },
    { target: "canvas", title: "Latency is the R-th fastest reply", body: "The bars show every replica's reply time for the last write and read. The request finishes at the dashed line; slower replicas are not waited for." },
    { target: "canvas", title: "Crash replicas", body: "Click a replica or its button. Reads survive N − R failures and writes N − W; a restarted replica keeps its old versions (marked OLD)." },
    { target: "challenges", title: "Prove it", body: "Find the N = 3 setting that is consistent and survives a crash, then the fastest consistent reads at N = 5." },
  ],
  View: QuorumView,
  cards: [
    { key: "readP99", label: "Read p99", unit: "ms", digits: 1 },
    { key: "writeP99", label: "Write p99", unit: "ms", digits: 1 },
    { key: "staleProb", label: "Stale reads (since settings changed)", unit: "%", digits: 2, tone: staleTone },
    { key: "stale", label: "Stale reads", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "readAvail", label: "Read availability", unit: "%", digits: 1, tone: availTone },
    { key: "writeAvail", label: "Write availability", unit: "%", digits: 1, tone: availTone },
    { key: "live", label: "Replicas up", digits: 0 },
  ],
  charts: [
    { title: "Latency p99", unit: "ms", keys: [{ key: "readP99", label: "Read", color: "var(--cobalt)" }, { key: "writeP99", label: "Write", color: "var(--phase-4)" }] },
    { title: "Availability", unit: "%", keys: [{ key: "readAvail", label: "Reads", color: "var(--status-ok)" }, { key: "writeAvail", label: "Writes", color: "var(--phase-4)" }] },
    { title: "Stale reads", unit: "%", keys: [{ key: "stalePct", label: "Last second", color: "var(--status-hot)" }] },
  ],
  hud: (m) => [
    { k: "R+W>N", v: m.overlap ? "YES" : "NO", tone: m.overlap ? undefined : "hot" },
    { k: "UP", v: String(m.live ?? 0), tone: m.readUp && m.writeUp ? undefined : "over" },
    { k: "STALE", v: String(m.stale ?? 0), tone: m.stale ? "hot" : undefined },
  ],
};
