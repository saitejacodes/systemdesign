import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { FILTERS, MODES, vsModel, type VsConfig, type VsState } from "./model";
import { VsView } from "./view";

export const definition: SimDefinition<VsConfig, VsState> = {
  model: vsModel,
  defaultConfig: { M: 4, efConstruction: 16, efSearch: 10, k: 10, filter: "none", filterMode: "post" },
  controls: [
    { key: "M", label: "M (links per node)", type: "number", min: 2, max: 32, step: 1, help: "Each node keeps up to M links on upper layers and 2·M on layer 0. Changing it rebuilds the index." },
    { key: "efConstruction", label: "efConstruction", type: "number", min: 8, max: 400, step: 8, help: "Beam width while inserting: how hard the build looks for each node's neighbours. Rebuilds the index." },
    { key: "efSearch", label: "efSearch", type: "number", min: 1, max: 400, step: 1, help: "Beam width at query time: candidates kept on layer 0. Higher = better recall, more distance computations." },
    { key: "k", label: "Results shown (k)", type: "number", min: 1, max: 20, step: 1, help: "For the query panel. The benchmark always measures recall@10." },
    { key: "filter", label: "Metadata filter", type: "select", options: FILTERS },
    { key: "filterMode", label: "Filter strategy", type: "select", options: MODES, help: "Post: HNSW returns its efSearch best, then non-matches are dropped. Pre: scan only the matching items, exactly." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "2,000 texts as vectors", body: "Each dot is a support text embedded as a 64-number vector (LSA), drawn here in 2-D. Pick a sample query or click a dot: the exact top-k by cosine similarity are ringed." },
    { target: "controls", title: "Build a graph instead of scanning", body: "Brute force compares the query with all 2,000 vectors. HNSW links each vector to M near neighbours on stacked layers. M and efConstruction shape the graph; changing them rebuilds it a few nodes per tick." },
    { target: "canvas", title: "Watch the search", body: "The dashed line is the greedy descent through the sparse upper layers; the thin rings are every node HNSW computed a distance to on layer 0. Red squares are results the exact search would not have returned." },
    { target: "metrics", title: "Recall vs work", body: "After each change, 200 dataset items are run as queries. Recall@10 is the share of the exact top 10 that HNSW found; distance computations is the work it did. Raise efSearch and watch both climb." },
    { target: "faults", title: "Filters and faults", body: "Turn on a rare metadata filter with post-filtering and most results vanish. Break it also forgets to normalise vectors, or embeds queries with a different model." },
    { target: "challenges", title: "Prove it", body: "Hit 95% recall for a fifth of brute force's work, then beat a rare filter and a broad one, each with the right strategy." },
  ],
  View: VsView,
  cards: [
    { key: "recall", label: "Recall@10 (benchmark)", unit: "%", digits: 1, tone: (v) => (v === 0 ? undefined : v < 90 ? "over" : v < 95 ? "hot" : "ok") },
    { key: "comps", label: "Distance computations / query", digits: 0 },
    { key: "pct", label: "Of brute force", unit: "%", digits: 1, tone: (v) => (v === 0 ? undefined : v >= 20 ? "hot" : "ok") },
    { key: "returned", label: "Results returned (of 10)", digits: 1, tone: (v) => (v > 0 && v < 9.95 ? "over" : undefined) },
    { key: "built", label: "Index built", unit: "%", digits: 0 },
    { key: "buildComps", label: "Build distance computations", digits: 0 },
  ],
  charts: [
    { title: "Benchmark", unit: "%", keys: [{ key: "recall", label: "Recall@10", color: "var(--cobalt)" }, { key: "pct", label: "Of brute force", color: "var(--phase-3)" }] },
  ],
  hud: (m) => [
    { k: "Index", v: (m.built ?? 0) < 100 ? `building ${Math.round(m.built ?? 0)}%` : "ready" },
    { k: "Recall@10", v: m.recall ? `${(m.recall / 100).toFixed(3)}` : "—", tone: m.recall ? (m.recall >= 95 ? "ok" : "over") : undefined },
    { k: "Cost", v: m.pct ? `${m.pct.toFixed(1)}% of brute` : "—", tone: m.pct ? (m.pct < 20 ? "ok" : "hot") : undefined },
  ],
};
