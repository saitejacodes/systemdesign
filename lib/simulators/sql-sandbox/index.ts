import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { sqlModel, TRACKS, type SqlConfig, type SqlState } from "./model";
import { SqlView } from "./view";

export const definition: SimDefinition<SqlConfig, SqlState> = {
  model: sqlModel,
  defaultConfig: { track: "indexing" },
  controls: [
    { key: "track", label: "Exercise track", type: "select", options: TRACKS.map((t) => ({ value: t.id, label: t.label })), help: "Five guided exercises per track. The database keeps your changes until you reset it." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "A real Postgres in your browser", body: "PGlite runs PostgreSQL compiled to WebAssembly. Users, posts, follows, orders, products and accounts are generated on load; only primary keys are indexed." },
    { target: "canvas", title: "Run and read plans", body: "Ctrl/⌘ + Enter runs your selection or the whole editor. Prefix a query with EXPLAIN ANALYZE to get a plan tree; the most expensive node is highlighted." },
    { target: "controls", title: "Pick a track", body: "Indexing, Modeling or Transactions. Load an exercise's starter, change it, run it, then press Check." },
    { target: "challenges", title: "Prove it", body: "Each track is a challenge: pass all five exercises. Reset database puts everything back if you break it." },
  ],
  View: SqlView,
  cards: [
    { key: "indexing", label: "Indexing", digits: 0 },
    { key: "modeling", label: "Modeling", digits: 0 },
    { key: "transactions", label: "Transactions", digits: 0 },
    { key: "total", label: "Passed of 15", digits: 0 },
  ],
  charts: [],
  hud: (m) => [{ k: "Exercises", v: `${m.total ?? 0}/15` }],
};
