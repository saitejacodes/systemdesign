import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { EVICTIONS, STRATEGIES, cacheModel, type CacheConfig, type CacheState } from "./model";
import { CacheView } from "./view";

const hitTone = (v: number) => (v < 50 ? "over" : v < 80 ? "hot" : "ok");
const dbTone = (v: number) => (v >= 100 ? "over" : v >= 70 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<CacheConfig, CacheState> = {
  model: cacheModel,
  defaultConfig: {
    qps: 2000, skew: 1.2, keyspace: 10_000, cacheSize: 1000, ttl: 30, readRatio: 0.99, bogusPct: 0,
    dbLatency: 50, dbCapacity: 1000, cacheLatency: 1, strategy: "cache-aside", eviction: "lru",
    coalescing: false, mutex: false, jitter: false, nullCache: false, localCache: false, flushAt: 0, warmAt: 0,
  },
  controls: [
    { key: "qps", label: "Requests", type: "number", min: 100, max: 5000, step: 100, unit: "/s" },
    { key: "readRatio", label: "Read share", type: "number", min: 0.5, max: 1, step: 0.01, help: "The rest are writes to the same popular keys." },
    { key: "skew", label: "Popularity skew (Zipf s)", type: "number", min: 0.6, max: 1.6, step: 0.1, help: "Higher means a few keys get most of the traffic." },
    { key: "keyspace", label: "Distinct keys", type: "number", min: 1000, max: 50_000, step: 1000 },
    { key: "cacheSize", label: "Cache size (items)", type: "number", min: 100, max: 20_000, step: 100 },
    { key: "ttl", label: "TTL", type: "number", min: 1, max: 120, step: 1, unit: " s" },
    { key: "eviction", label: "Eviction", type: "select", options: EVICTIONS },
    { key: "strategy", label: "Write strategy", type: "select", options: STRATEGIES },
    { key: "dbLatency", label: "DB query time", type: "number", min: 5, max: 500, step: 5, unit: " ms", help: "An expensive query is what makes caching it worth it." },
    { key: "dbCapacity", label: "DB capacity", type: "number", min: 200, max: 5000, step: 100, unit: " q/s" },
    { key: "coalescing", label: "Request coalescing", type: "toggle", help: "Within one app server, concurrent misses for a key share one DB query." },
    { key: "mutex", label: "Rebuild lock", type: "toggle", help: "Across all app servers, one request per key rebuilds it; the rest wait and retry." },
    { key: "jitter", label: "TTL jitter ±10%", type: "toggle" },
    { key: "bogusPct", label: "Lookups for missing ids", type: "number", min: 0, max: 50, step: 5, unit: "%", help: "Ids that are not in the DB at all (a scraper or a bug)." },
    { key: "nullCache", label: "Cache 'not found'", type: "toggle", help: "Remember misses for missing ids for 10 s." },
    { key: "localCache", label: "Local cache for hot keys", type: "toggle", help: "Each app server keeps its 20 hottest keys in memory for 1 s." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Three tiers", body: "App servers ask a cache node (picked by a hash of the key) and fall back to the database on a miss. Each node and the DB are queues: past their capacity, latency climbs and requests time out." },
    { target: "controls", title: "Skewed traffic", body: "A few keys get most requests (Zipf). That is why a cache holding 10% of the keys can serve most reads. Try skew 0.8 vs 1.4." },
    { target: "metrics", title: "Hit rate and DB load", body: "Hit rate is what the cache saves you; DB load is what it costs you when it misses. Stale reads count reads that returned an older version than the DB holds." },
    { target: "faults", title: "Break it", body: "Flush the cache, or make every key expire at once, and watch concurrent misses stampede the DB. A hot key and a dead node fail differently." },
    { target: "challenges", title: "Fix it", body: "Survive a flush, spread a mass expiry, and squeeze a high hit rate out of a small cache. The race demo below the canvas shows why delete-on-write is the safer default." },
  ],
  View: CacheView,
  cards: [
    { key: "hitRate", label: "Hit rate", unit: "%", digits: 1, tone: hitTone },
    { key: "dbUtil", label: "DB load", unit: "%", digits: 0, tone: dbTone },
    { key: "dbQps", label: "DB queries", unit: "/s", digits: 0 },
    { key: "p50", label: "Read p50", unit: "ms", digits: 1 },
    { key: "p99", label: "Read p99", unit: "ms", digits: 0, tone: (v) => (v >= 500 ? "over" : v >= 150 ? "hot" : "ok") },
    { key: "staleRate", label: "Stale reads", unit: "%", digits: 2, tone: (v) => (v >= 1 ? "hot" : "ok") },
    { key: "errors", label: "Timeouts", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
    { key: "lostWrites", label: "Lost writes", digits: 0, tone: (v) => (v > 0 ? "over" : "ok") },
  ],
  charts: [
    { title: "Hit rate", unit: "%", keys: [{ key: "hitRate", label: "Hits", color: "var(--cobalt)" }] },
    { title: "Database load", unit: "%", keys: [{ key: "dbUtil", label: "Of capacity", color: "var(--phase-3)" }] },
    { title: "Read latency", unit: "ms", keys: [{ key: "p50", label: "p50", color: "var(--phase-1)" }, { key: "p99", label: "p99", color: "var(--cobalt)" }] },
  ],
  hud: (m) => [
    { k: "HIT", v: `${Math.round(m.hitRate ?? 0)}%`, tone: quiet(hitTone(m.hitRate ?? 0)) },
    { k: "DB", v: `${Math.round(m.dbUtil ?? 0)}%`, tone: quiet(dbTone(m.dbUtil ?? 0)) },
    { k: "P99", v: `${Math.round(m.p99 ?? 0)} ms` },
  ],
};
