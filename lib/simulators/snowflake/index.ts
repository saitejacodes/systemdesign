import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { POLICIES, snowModel, type SnowConfig, type SnowState } from "./model";
import { SnowView } from "./view";

const waitTone = (v: number) => (v >= 5 ? "over" : v >= 1 ? "hot" : "ok");

export const definition: SimDefinition<SnowConfig, SnowState> = {
  model: snowModel,
  defaultConfig: { tsBits: 41, dcBits: 5, workerBits: 5, machines: 4, rateK: 500, policy: "trust", stepBackMs: 0 },
  controls: [
    { key: "tsBits", label: "Timestamp bits", type: "number", min: 35, max: 45, step: 1, help: "Milliseconds since your epoch. Lifetime = 2^bits ms: 41 bits ≈ 69.7 years." },
    { key: "dcBits", label: "Datacenter bits", type: "number", min: 0, max: 8, step: 1 },
    { key: "workerBits", label: "Worker bits", type: "number", min: 0, max: 10, step: 1, help: "Sequence bits = 63 − timestamp − datacenter − worker." },
    { key: "machines", label: "Generators simulated", type: "number", min: 1, max: 8, step: 1 },
    { key: "rateK", label: "Demand per machine", type: "number", min: 1, max: 10000, step: 1, unit: "k IDs/s", help: "Poisson; 1k IDs/s = 1 ID per ms on average." },
    { key: "policy", label: "When the clock goes back", type: "select", options: POLICIES },
    { key: "stepBackMs", label: "NTP step on M1", type: "number", min: 0, max: 200, step: 5, unit: " ms", help: "Every 3 s, M1's clock jumps back this far. 0 = never." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "64 bits, four fields", body: "Sign, milliseconds since your epoch, machine ID and a per-millisecond sequence. The default is Twitter's 41|5|5|12; the cards show what each split buys." },
    { target: "controls", title: "Spend the bits", body: "Every bit you add to one field halves another: 41 timestamp bits last ~69.7 years, 10 machine bits name 1,024 generators, 12 sequence bits mint 4,096 IDs per ms." },
    { target: "canvas", title: "Sorted by ID, roughly by time", body: "The table sorts the latest batches by ID. Clocks a millisecond or two apart make IDs k-sortable: in order per machine, roughly in order across them." },
    { target: "faults", title: "Turn the clock back", body: "Step a clock back and the naive generator re-reads milliseconds it already used: the sequence restarts at 0 and it mints duplicates. Refusing until the clock catches up costs a few rejected requests instead." },
    { target: "challenges", title: "Prove it", body: "Lay out bits for 1,000 machines for 50 years, survive an NTP step without duplicates, and absorb a 6 million IDs/s burst." },
  ],
  View: SnowView,
  cards: [
    { key: "rate", label: "IDs issued", unit: "k/s", digits: 0 },
    { key: "dups", label: "Duplicate IDs", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
    { key: "rejectedPct", label: "Requests refused", unit: "%", digits: 2, tone: (v) => (v >= 1 ? "over" : v > 0 ? "hot" : "ok") },
    { key: "avgWait", label: "Average wait", unit: "ms", digits: 3, tone: waitTone },
    { key: "backlog", label: "IDs waiting", digits: 0, tone: (v) => (v > 10_000 ? "over" : v > 0 ? "hot" : "ok") },
    { key: "outOfOrder", label: "Out-of-order batches", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "lifetime", label: "Lifetime", unit: "years", digits: 1, tone: (v) => (v < 20 ? "over" : v < 50 ? "hot" : "ok") },
  ],
  charts: [
    { title: "Throughput", unit: "k/s", keys: [{ key: "rate", label: "IDs issued", color: "var(--cobalt)" }] },
    { title: "Trouble", keys: [{ key: "dups", label: "Duplicates", color: "var(--status-over)" }, { key: "backlog", label: "IDs waiting", color: "var(--status-hot)" }] },
  ],
  hud: (m) => [
    { k: "LAYOUT", v: `${Math.round(m.lifetime ?? 0)} Y · ${m.machinesMax ?? 0} M · ${m.perMs ?? 0}/MS` },
    { k: "DUPS", v: String(m.dups ?? 0), tone: m.dups ? "over" : undefined },
    { k: "WAIT", v: `${(m.avgWait ?? 0).toFixed(2)} ms`, tone: waitTone(m.avgWait ?? 0) === "ok" ? undefined : waitTone(m.avgWait ?? 0) },
  ],
};
