import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { isoModel, type IsoConfig, type IsoState } from "./model";
import { IsoView } from "./view";

export const definition: SimDefinition<IsoConfig, IsoState> = {
  model: isoModel,
  defaultConfig: { stepSeconds: 1.5 },
  controls: [
    { key: "stepSeconds", label: "Seconds per step", type: "number", min: 0.5, max: 4, step: 0.5, unit: "s", help: "How fast Play runs the schedule. Next step and Run to end ignore it." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Two sessions, one table", body: "Each pane is a database connection. The schedule alternates their statements the way two concurrent requests would interleave." },
    { target: "canvas", title: "Pick an anomaly and a level", body: "Choose a scenario, then set each session's isolation level. Changing anything restarts the run." },
    { target: "transport", title: "Step through it", body: "Next step runs one statement; Play runs them on a timer. Watch for WAIT (a row lock) and ERROR 40001 (a serialization failure)." },
    { target: "canvas", title: "Read the row versions", body: "Every UPDATE adds a version. The dots show which versions each session can see right now: that is its snapshot." },
    { target: "challenges", title: "Prove it", body: "Prevent a lost update two different ways, keep a doctor on call, and run all five scenarios." },
  ],
  View: IsoView,
  cards: [
    { key: "waits", label: "Lock waits", digits: 0 },
    { key: "failures", label: "Serialization / tx errors", digits: 0 },
    { key: "anomalies", label: "Anomalies seen", digits: 0, tone: (v) => (v > 0 ? "hot" : undefined) },
    { key: "seen", label: "Scenarios run", digits: 0 },
  ],
  charts: [],
  hud: (m) => [{ k: "Step", v: String(m.step ?? 0) }, { k: "Fixes", v: `${m.fixes ?? 0}/2` }],
};
