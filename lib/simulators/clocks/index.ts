import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { clocksModel, MAX_EVENTS, type ClocksConfig, type ClocksState } from "./model";
import { ClocksView } from "./view";

const skew = (k: "skew1" | "skew2" | "skew3", n: string) => ({ key: k, label: `${n} clock skew`, type: "number" as const, min: -300, max: 300, step: 10, unit: " ms", help: "Added to true time for this process's wall clock. Applies to new events." });

export const definition: SimDefinition<ClocksConfig, ClocksState> = {
  model: clocksModel,
  defaultConfig: { auto: true, rate: 1.5, delay: 60, skew1: 0, skew2: 0, skew3: 0 },
  controls: [
    { key: "auto", label: "Auto events", type: "toggle", help: `While playing, random processes do local events and sends, and the network delivers messages after the delay. Stops at ${MAX_EVENTS} events.` },
    { key: "rate", label: "Auto event rate", type: "number", min: 0.5, max: 5, step: 0.5, unit: "/s" },
    { key: "delay", label: "Message delay", type: "number", min: 10, max: 500, step: 10, unit: " ms", help: "Minimum true time between a send and its receive." },
    skew("skew1", "P1"),
    skew("skew2", "P2"),
    skew("skew3", "P3"),
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Three processes, one diagram", body: "Each line is a process; time runs right. Dots are events, arrows are messages. Add local events, sends and receives with the buttons, or press Play for random ones." },
    { target: "canvas", title: "Two clocks on every event", body: "The number under each dot is its Lamport timestamp: +1 per event, max(own, received) + 1 on receive. The table shows each vector clock: one counter per process, merged element-wise on receive." },
    { target: "canvas", title: "Pick two events", body: "Click (or Tab and Enter) two events. Comparing their vectors says A → B, B → A or concurrent. Lamport and the wall clock give their own answer, which can be wrong." },
    { target: "controls", title: "Skew a clock", body: "Wall time is true time plus skew. Push P1 ahead by 200 ms and its messages arrive \"before\" they were sent, as far as the receiver's clock can tell." },
    { target: "challenges", title: "Prove it", body: "Catch Lamport ordering concurrent events, make a wall clock contradict causality, and build one event that has seen everything." },
  ],
  View: ClocksView,
  cards: [
    { key: "events", label: "Events", digits: 0 },
    { key: "inflight", label: "Messages in flight", digits: 0 },
    { key: "concurrent", label: "Concurrent pairs", digits: 0 },
    { key: "misleading", label: "Concurrent, Lamport differs", digits: 0, tone: (v) => (v > 0 ? "hot" : undefined) },
    { key: "wallInverted", label: "Causal pairs, wall clock backwards", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
  ],
  charts: [
    { title: "Event pairs", keys: [{ key: "concurrent", label: "Concurrent", color: "var(--cobalt)" }, { key: "misleading", label: "Lamport misleads", color: "var(--status-hot)" }, { key: "wallInverted", label: "Wall clock backwards", color: "var(--status-over)" }] },
  ],
  hud: (m) => [
    { k: "EVENTS", v: String(m.events ?? 0) },
    { k: "MAX L", v: String(m.maxL ?? 0) },
    { k: "WALL BACKWARDS", v: String(m.wallInverted ?? 0), tone: m.wallInverted ? "over" : undefined },
  ],
};
