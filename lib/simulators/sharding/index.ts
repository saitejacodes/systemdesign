import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { CAPACITY, STRATEGY_LABEL, shModel, type ShConfig, type ShState, type Strategy } from "./model";
import { ShView } from "./view";

const ratioTone = (v: number) => (v >= 2 ? "over" : v >= 1.5 ? "hot" : "ok");
const loadTone = (v: number) => (v >= CAPACITY ? "over" : v >= 0.8 * CAPACITY ? "hot" : "ok");

export const definition: SimDefinition<ShConfig, ShState> = {
  model: shModel,
  defaultConfig: { shards: 8, strategy: "hash", skew: 0.8 },
  controls: [
    { key: "shards", label: "Shards (N)", type: "number", min: 4, max: 16, step: 1, help: "Changing N here re-shards from scratch (a directory splits or merges instead)." },
    { key: "strategy", label: "Strategy", type: "select", options: (Object.keys(STRATEGY_LABEL) as Strategy[]).map((value) => ({ value, label: STRATEGY_LABEL[value] })), help: "Switching to a directory copies today's placement into the lookup table." },
    { key: "skew", label: "Skew (Zipf s)", type: "number", min: 0, max: 1.5, step: 0.1, help: "0 is uniform. At s, the user ranked k gets traffic ∝ 1/kˢ; low ids are the hottest." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "10,000 users, N shards", body: "Each tile is a shard: users stored, live req/s against a 2,500 req/s capacity, and a status of OK, HOT or OVERLOADED." },
    { target: "controls", title: "Pick a strategy", body: "Range by id keeps neighbours together, hash scatters everyone, a directory remembers each user's shard. Raise skew and watch range by id pile the hot users onto one shard." },
    { target: "canvas", title: "Grow the cluster", body: "Add shard rehashes (hash) or splits the hottest shard (range, directory). The bar shows how much data moved: hash mod N moves most of it." },
    { target: "canvas", title: "Celebrities", body: "Mark a celebrity, then salt their key across all shards or, with a directory, give them a shard of their own." },
    { target: "metrics", title: "The cost of scattering", body: "Shards per feed query counts how many shards a user's friends live on. Range by id keeps it low; hash and salting raise it." },
    { target: "challenges", title: "Prove it", body: "Balance a Zipf workload and tame a celebrity." },
  ],
  View: ShView,
  cards: [
    { key: "shards", label: "Shards", digits: 0 },
    { key: "maxAvg", label: "Busiest ÷ average", unit: "×", digits: 2, tone: ratioTone },
    { key: "maxLoad", label: "Busiest shard", unit: "req/s", digits: 0, tone: loadTone },
    { key: "moved", label: "Data moved (last change)", unit: "%", digits: 1 },
    { key: "perQuery", label: "Shards per feed query", digits: 2 },
    { key: "crossShard", label: "Cross-shard feed queries", unit: "%", digits: 0 },
  ],
  charts: [
    { title: "Busiest ÷ average", unit: "×", keys: [{ key: "maxAvg", label: "Max/avg", color: "var(--phase-3)" }] },
    { title: "Shards per feed query", keys: [{ key: "perQuery", label: "Shards", color: "var(--phase-6)" }] },
  ],
  hud: (m) => [
    { k: "Shards", v: String(m.shards ?? 0) },
    { k: "Max/avg", v: `${(m.maxAvg ?? 0).toFixed(2)}×`, tone: ratioTone(m.maxAvg ?? 0) === "ok" ? undefined : ratioTone(m.maxAvg ?? 0) },
    { k: "Moved", v: `${((m.moved ?? 0) * 100).toFixed(1)}%` },
  ],
};
