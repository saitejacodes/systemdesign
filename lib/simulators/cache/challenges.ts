import type { Challenge } from "@/lib/sim/engine";
import { hitRate, peakDbUtil, type CacheConfig, type CacheState } from "./model";

const DB_LIMIT = 0.7;
const HIT_TARGET = 0.82;
// A read-only, skewed workload on a DB that is fine while the cache is warm.
const hot = { qps: 2000, skew: 1.3, keyspace: 10_000, cacheSize: 2000, readRatio: 1, bogusPct: 0, dbLatency: 200, dbCapacity: 800, strategy: "cache-aside", eviction: "lru", localCache: false } as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export const challenges: Challenge<CacheConfig, CacheState>[] = [
  {
    id: "cold-start",
    title: "Survive a cache flush",
    description: `A deploy flushes the whole cache at t = 15 s. Each DB query takes 200 ms, so a popular key gets dozens of misses before the first one returns. Keep DB load under ${pct(DB_LIMIT)} of capacity in every second after the flush.`,
    setup: { ...hot, ttl: 30, flushAt: 15_000, warmAt: 0, coalescing: false, mutex: false, jitter: false },
    durationMs: 30_000,
    winCondition(_h, s) {
      const peak = peakDbUtil(s, 15_000);
      return peak < DB_LIMIT
        ? { passed: true, value: Math.round(peak * 100), detail: `Peak DB load after the flush was ${pct(peak)}. Concurrent misses for a key now share one query.` }
        : { passed: false, value: Math.round(peak * 100), detail: `DB load reached ${pct(peak)} after the flush: every concurrent miss for a hot key ran its own query (a stampede).` };
    },
    hint: "Let only one request per key go to the DB while the others wait for its answer: request coalescing in each app server, or a lock across all of them.",
  },
  {
    id: "mass-expiry",
    title: "Spread the expiry",
    description: `A warm-up job reloads every cached key at t = 5 s with the same 20 s TTL, so they all expire together at t = 25 s. Keep DB load under ${pct(DB_LIMIT)} from t = 10 s on, without coalescing or a lock: fix the cause, not the symptom.`,
    setup: { ...hot, ttl: 20, warmAt: 5_000, flushAt: 0, coalescing: false, mutex: false, jitter: false },
    durationMs: 35_000,
    winCondition(_h, s) {
      const peak = peakDbUtil(s, 10_000);
      if (s.dedupeUsed) return { passed: false, value: Math.round(peak * 100), detail: "Coalescing or the lock was switched on. They hide the spike; this one asks you to stop the keys expiring together." };
      return peak < DB_LIMIT
        ? { passed: true, value: Math.round(peak * 100), detail: `Peak DB load ${pct(peak)}: the keys now expire over a few seconds instead of in one instant.` }
        : { passed: false, value: Math.round(peak * 100), detail: `DB load hit ${pct(peak)} when the warmed keys expired together.` };
    },
    hint: "Identical TTLs set at the same moment expire at the same moment. Add a little randomness to each TTL.",
  },
  {
    id: "hit-rate",
    title: `${pct(HIT_TARGET)} hits from a 5% cache`,
    description: `20,000 keys, room for 1,000 of them, 2% writes. Reach a hit rate of at least ${pct(HIT_TARGET)} over the last 20 s of a 40 s run, keeping the cache at 1,000 items and the app-server local cache off.`,
    setup: { qps: 2000, skew: 1.2, keyspace: 20_000, cacheSize: 1000, ttl: 5, readRatio: 0.98, bogusPct: 0, dbLatency: 50, dbCapacity: 1500, strategy: "cache-aside", eviction: "random", coalescing: false, mutex: false, jitter: false, localCache: false, nullCache: false, flushAt: 0, warmAt: 0 },
    durationMs: 40_000,
    winCondition(_h, s) {
      const hr = hitRate(s, 20);
      if (s.maxItems > 1000) return { passed: false, value: Math.round(hr * 100), detail: "The cache grew past 1,000 items. Win with policy, not memory." };
      if (s.localUsed) return { passed: false, value: Math.round(hr * 100), detail: "The local cache was on. Win with the shared cache alone." };
      return hr >= HIT_TARGET
        ? { passed: true, value: Math.round(hr * 100), detail: `Hit rate ${pct(hr)}: the cache keeps the popular keys, they live long enough, and writes refresh them instead of deleting them.` }
        : { passed: false, value: Math.round(hr * 100), detail: `Hit rate ${pct(hr)}. Look at what evicts hot keys, how soon they expire, and what a write does to them.` };
    },
    hint: "Three levers: an eviction policy that knows what is popular, a TTL longer than 5 s, and a write strategy that updates the cache rather than deleting the key.",
  },
];
