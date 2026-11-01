import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { chModel, type ChConfig, type ChState } from "./model";
import { ChView } from "./view";

const spreadTone = (v: number) => (v >= 0.3 ? "over" : v >= 0.1 ? "hot" : "ok");

export const definition: SimDefinition<ChConfig, ChState> = {
  model: chModel,
  defaultConfig: { vnodes: 1, keys: 1000 },
  controls: [
    { key: "vnodes", label: "Virtual nodes per node (V)", type: "number", min: 1, max: 500, step: 1, help: "Each node is hashed onto the ring V times." },
    { key: "keys", label: "Keys (K)", type: "number", min: 100, max: 10_000, step: 100 },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "The ring", body: "Keys and nodes are hashed onto the same circle of 2³² positions. A key belongs to the first node clockwise from it. Colours show ownership." },
    { target: "canvas", title: "Add a node", body: "Press Add node. Flashing keys are the ones that moved. With consistent hashing only keys on the new node's arcs move; modulo hashing reshuffles almost everything." },
    { target: "controls", title: "Virtual nodes", body: "With V = 1 the arcs are wildly uneven. Raise V and watch the bars level out toward the mean line." },
    { target: "metrics", title: "Measure it", body: "Spread is the standard deviation of keys per node divided by the mean. Under 10% is well balanced." },
    { target: "challenges", title: "Prove it", body: "Balance 5 nodes, then show how little moves when the cluster grows." },
  ],
  View: ChView,
  cards: [
    { key: "nodes", label: "Nodes", digits: 0 },
    { key: "spread", label: "Spread (ring)", unit: "%", digits: 1, tone: spreadTone },
    { key: "spreadModulo", label: "Spread (modulo)", unit: "%", digits: 1 },
    { key: "maxOverMean", label: "Busiest ÷ mean", unit: "×", digits: 2 },
    { key: "movedC", label: "Moved (ring)", unit: "%", digits: 1 },
    { key: "movedM", label: "Moved (modulo)", unit: "%", digits: 1 },
  ],
  charts: [
    { title: "Spread", unit: "%", keys: [{ key: "spread", label: "Ring", color: "var(--phase-1)" }, { key: "spreadModulo", label: "Modulo", color: "var(--phase-3)" }] },
  ],
  hud: (m) => [
    { k: "Nodes", v: String(m.nodes ?? 0) },
    { k: "Spread", v: `${((m.spread ?? 0) * 100).toFixed(1)}%`, tone: spreadTone(m.spread ?? 0) === "ok" ? undefined : spreadTone(m.spread ?? 0) },
    { k: "Moved", v: `${((m.movedC ?? 0) * 100).toFixed(0)}% vs ${((m.movedM ?? 0) * 100).toFixed(0)}%` },
  ],
};
