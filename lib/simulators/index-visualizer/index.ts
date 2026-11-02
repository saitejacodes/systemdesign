import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { ivModel, type IvConfig, type IvState } from "./model";
import { IvView } from "./view";

export const definition: SimDefinition<IvConfig, IvState> = {
  model: ivModel,
  defaultConfig: { order: 4, pattern: "random", batch: 64, bloom: false },
  controls: [
    { key: "order", label: "B-tree order", type: "number", min: 3, max: 5, step: 1, help: "Max children per node. Real databases use hundreds; 3–5 keeps splits visible." },
    { key: "pattern", label: "Key pattern", type: "select", options: [{ value: "random", label: "Random keys" }, { value: "sequential", label: "Sequential keys" }], help: "Sequential keys (auto-increment ids, timestamps) always hit the rightmost leaf." },
    { key: "batch", label: "Batch size", type: "number", min: 8, max: 256, step: 8, unit: "keys", help: "Keys buffered before writing: the B-tree writes its dirty pages, the LSM flushes its memtable." },
    { key: "bloom", label: "Bloom filters on SSTables", type: "toggle", help: "A small in-memory filter per file that answers \"definitely not here\" for most missing keys." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Same keys, two structures", body: "Every insert goes into both a B-tree (pages updated in place) and an LSM tree (memtable in RAM, then sorted files on disk)." },
    { target: "canvas", title: "Watch a split", body: "Insert or search a key: the path from the root is outlined; a node that overflows splits and pushes its middle key up." },
    { target: "transport", title: "Play inserts a batch per second", body: "Watch the memtable fill, flush to L0 and, once L0 has more than 4 files, compact into L1 and L2." },
    { target: "metrics", title: "Compare the costs", body: "Write amplification = bytes written ÷ bytes inserted. Read cost = nodes or files touched per lookup." },
    { target: "challenges", title: "Prove it", body: "Decide who writes less for 1,000 random keys, then bring LSM reads down with Bloom filters." },
  ],
  View: IvView,
  cards: [
    { key: "btWA", label: "B-tree write amp", unit: "×", digits: 1 },
    { key: "lsmWA", label: "LSM write amp", unit: "×", digits: 1 },
    { key: "btRead", label: "B-tree nodes / read", digits: 2 },
    { key: "lsmRead", label: "LSM files / read", digits: 2, tone: (v) => (v > 2 ? "hot" : undefined) },
  ],
  charts: [
    { title: "Write amplification", unit: "×", keys: [{ key: "btWA", label: "B-tree", color: "var(--cobalt)" }, { key: "lsmWA", label: "LSM", color: "var(--status-hot)" }] },
    { title: "Read cost", keys: [{ key: "btRead", label: "B-tree nodes", color: "var(--cobalt)" }, { key: "lsmRead", label: "LSM files", color: "var(--status-hot)" }] },
  ],
  hud: (m) => [{ k: "Keys", v: String(m.keys ?? 0) }, { k: "Height", v: String(m.height ?? 0) }, { k: "SSTables", v: String(m.sstables ?? 0) }],
};
