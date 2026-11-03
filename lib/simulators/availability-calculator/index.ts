import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { STARTS, availModel, fmtMin, type AvailConfig, type AvailState } from "./model";
import { AvailView } from "./view";

const ninesTone = (v: number) => (v >= 4 ? "ok" : v >= 3 ? "hot" : "over");

export const definition: SimDefinition<AvailConfig, AvailState> = {
  model: availModel,
  defaultConfig: { start: "lesson" },
  controls: [
    { key: "start", label: "Starting system", type: "select", options: STARTS, help: "Loading one replaces the diagram." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "A request path as blocks", body: "Left to right is a chain: every block must work, so availabilities multiply. A bracketed stack is a redundant set: it fails only if every copy fails." },
    { target: "canvas", title: "Edit a block", body: "Click a component to set its availability (99, 99.9, 99.95, 99.99 or any value), add a redundant copy, put a component after it, or remove it." },
    { target: "canvas", title: "Drag to regroup", body: "Drop a block on a component to make them a parallel pair, or on a group to join it. Groups nest, so a zone and its server can be one branch. Move into does the same from the keyboard." },
    { target: "canvas", title: "Find the weakest link", body: "The stage causing the biggest share of downtime is outlined in red. Redundancy pays there and only there; then the next stage becomes the weakest." },
    { target: "challenges", title: "Prove it", body: "Reach 99.99% from 99.9% parts, then spend two spares where they buy the most." },
  ],
  View: AvailView,
  cards: [
    { key: "pct", label: "Availability", unit: "%", digits: 4, tone: (v) => ninesTone(-Math.log10(1 - v / 100)) },
    { key: "nines", label: "Nines", digits: 2, tone: ninesTone },
    { key: "downYear", label: "Downtime per year", unit: "min", digits: 1 },
    { key: "downMonth", label: "Per 30-day month", unit: "min", digits: 1 },
    { key: "downWeek", label: "Per week", unit: "min", digits: 2 },
    { key: "components", label: "Components", digits: 0 },
  ],
  charts: [],
  hud: (m) => [
    { k: "A", v: `${(m.pct ?? 0).toFixed(4)}%`, tone: ninesTone(m.nines ?? 0) === "ok" ? undefined : ninesTone(m.nines ?? 0) },
    { k: "DOWN/YR", v: fmtMin(m.downYear ?? 0) },
  ],
};
