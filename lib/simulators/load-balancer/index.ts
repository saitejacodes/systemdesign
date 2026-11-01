import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { ALGORITHMS, lbModel, type LbConfig, type LbState } from "./model";
import { LbView } from "./view";

const errTone = (v: number) => (v >= 0.05 ? "over" : v >= 0.01 ? "hot" : "ok");
const p99Tone = (v: number) => (v >= 300 ? "over" : v >= 150 ? "hot" : "ok");

export const definition: SimDefinition<LbConfig, LbState> = {
  model: lbModel,
  defaultConfig: { servers: 4, algorithm: "rr", rps: 400, capacity: 250, latency: 50, hetero: false, checkMs: 2000, threshold: 3, killAt: 0, spikeAt: 0 },
  controls: [
    { key: "algorithm", label: "Algorithm", type: "select", options: ALGORITHMS },
    { key: "servers", label: "Servers", type: "number", min: 2, max: 10, step: 1 },
    { key: "rps", label: "Traffic", type: "number", min: 50, max: 2000, step: 50, unit: "/s", help: "Poisson arrivals from 500 clients." },
    { key: "capacity", label: "Capacity per server", type: "number", min: 50, max: 500, step: 25, unit: "/s" },
    { key: "latency", label: "Base latency", type: "number", min: 10, max: 200, step: 10, unit: " ms" },
    { key: "hetero", label: "Mixed sizes (odd servers 2×)", type: "toggle" },
    { key: "checkMs", label: "Health check interval", type: "number", min: 250, max: 5000, step: 250, unit: " ms" },
    { key: "threshold", label: "Failures before DOWN", type: "number", min: 1, max: 5, step: 1 },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "One door, many rooms", body: "Every request reaches the load balancer first, which picks a server. Bars show how full each server's worker slots are; past the tick, requests queue." },
    { target: "controls", title: "Pick an algorithm", body: "Round robin rotates, weighted round robin follows capacity, least connections picks the emptiest, IP hash pins each client to one server." },
    { target: "faults", title: "Break a server", body: "Kill one and watch red dots: requests fail until health checks notice. A slow server is worse in a way: health checks still pass." },
    { target: "metrics", title: "Watch the tail", body: "Error rate and p99 tell you what users feel. Averages hide a single overloaded server." },
    { target: "challenges", title: "Prove it", body: "Survive a crash, balance mixed hardware, and ride out a traffic spike." },
  ],
  View: LbView,
  cards: [
    { key: "qps", label: "Served", unit: "/s", digits: 0 },
    { key: "errorRate", label: "Errors", unit: "%", digits: 1, tone: errTone },
    { key: "p50", label: "p50", unit: "ms", digits: 0 },
    { key: "p95", label: "p95", unit: "ms", digits: 0 },
    { key: "p99", label: "p99", unit: "ms", digits: 0, tone: p99Tone },
    { key: "dropped", label: "Dropped", unit: "/s", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
  ],
  charts: [
    { title: "Latency", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-1)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Errors", unit: "%", keys: [{ key: "errorRate", label: "Error rate", color: "var(--status-over)" }] },
    { title: "Connections", keys: [0, 1, 2, 3].map((i) => ({ key: `conn${i}`, label: `S${i + 1}`, color: `var(--phase-${[1, 3, 4, 6][i]})` })) },
  ],
  hud: (m) => [
    { k: "QPS", v: Math.round(m.qps ?? 0).toString() },
    { k: "ERR", v: `${((m.errorRate ?? 0) * 100).toFixed(1)}%`, tone: errTone(m.errorRate ?? 0) === "ok" ? undefined : errTone(m.errorRate ?? 0) },
    { k: "P99", v: `${Math.round(m.p99 ?? 0)} ms`, tone: p99Tone(m.p99 ?? 0) === "ok" ? undefined : p99Tone(m.p99 ?? 0) },
  ],
};
