import type { Rng, SimModel, TickContext } from "@/lib/sim/engine";

/*
 * App servers → 4 cache nodes → one database. Keys are ranked by popularity (key 0 hottest, Zipf).
 * The DB and each cache node are queues with a capacity in ops/s: past it, a backlog builds and
 * latency climbs until requests time out. Misses that overlap in time are the stampede: without
 * coalescing every one of them queries the DB.
 */

export type Strategy = "cache-aside" | "read-through" | "write-through" | "write-behind";
export type Eviction = "lru" | "lfu" | "fifo" | "random";
export const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "cache-aside", label: "Cache-aside (delete on write)" },
  { value: "read-through", label: "Read-through (delete on write)" },
  { value: "write-through", label: "Write-through" },
  { value: "write-behind", label: "Write-behind" },
];
export const EVICTIONS: { value: Eviction; label: string }[] = [
  { value: "lru", label: "LRU" }, { value: "lfu", label: "LFU (sampled)" }, { value: "fifo", label: "FIFO" }, { value: "random", label: "Random" },
];

export interface CacheConfig {
  qps: number; skew: number; keyspace: number; cacheSize: number; ttl: number; readRatio: number; bogusPct: number;
  dbLatency: number; dbCapacity: number; cacheLatency: number;
  strategy: Strategy; eviction: Eviction;
  coalescing: boolean; mutex: boolean; jitter: boolean; nullCache: boolean; localCache: boolean;
  /** Challenge hooks: flush the cache / run a synchronised warm-up at this sim time (0 = never). */
  flushAt: number; warmAt: number;
}

export const NODES = 4;
export const APP_SERVERS = 4;
export const NODE_CAPACITY = 2_500;
const TIMEOUT_MS = 1_000;
const LOCAL_KEYS = 20;
const LOCAL_TTL = 1_000;
const MUTEX_POLL = 50;
const FLUSH_EVERY = 1_000;
const NULL_TTL = 10_000;
const LFU_SAMPLES = 5;
const SECONDS_KEEP = 180;

export interface Entry { ver: number; exp: number; freq: number; pos: number; nul?: boolean }
interface Fill { key: number; ver: number; at: number; server: number; nul: boolean }
interface Queue { backlog: number }
export interface Second { t: number; reads: number; hits: number; db: number; dbUtil: number }

export interface CacheState {
  /** Map keeps insertion order: LRU re-inserts on access, FIFO doesn't. `keys` allows O(1) random sampling. */
  cache: Map<number, Entry>; keys: number[];
  /** Truth vs what the DB holds (they differ only under write-behind before a flush). */
  latest: Map<number, number>; dbVer: Map<number, number>;
  dirty: Map<number, number>; nextFlush: number;
  inflight: Map<string, number>; fills: Fill[];
  local: Map<number, number>[]; localHits: Map<number, number>;
  db: Queue; nodes: Queue[]; down: boolean[];
  dbSlow: number; hotKey: boolean;
  cdf: Float64Array; cdfFor: string;
  acc: number;
  flushed: boolean; warmed: boolean; warmNow: boolean;
  /** Whether coalescing or a mutex was on at any point (a challenge asks you to fix expiry without them). */
  dedupeUsed: boolean; localUsed: boolean; maxItems: number;
  /** Per-second rollups for challenges and the hit-rate view. */
  sec: Second; secs: Second[];
  reads: number; hits: number; dbQueries: number; stale: number; errors: number; lostWrites: number; dbPeakAfterFlush: number;
}

const nodeOf = (k: number) => ((k * 2654435761) >>> 0) % NODES;

export function zipfCdf(n: number, s: number) {
  const c = new Float64Array(n);
  let z = 0;
  for (let i = 0; i < n; i++) c[i] = z += (i + 1) ** -s;
  for (let i = 0; i < n; i++) c[i] /= z;
  return c;
}
function sample(cdf: Float64Array, r: number) {
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
  return lo;
}

// ── Cache storage with four eviction policies ───────────────────────────────

function remove(s: CacheState, k: number) {
  const e = s.cache.get(k);
  if (!e) return;
  const last = s.keys.pop()!;
  if (last !== k) { s.keys[e.pos] = last; s.cache.get(last)!.pos = e.pos; }
  s.cache.delete(k);
}

function victim(s: CacheState, policy: Eviction, rng: Rng) {
  if (policy === "lru" || policy === "fifo") return s.cache.keys().next().value!;
  if (policy === "random") return s.keys[rng.int(0, s.keys.length - 1)];
  // Sampled LFU, like Redis: look at a few random keys and evict the least used.
  let best = -1;
  for (let i = 0; i < LFU_SAMPLES; i++) { const k = s.keys[rng.int(0, s.keys.length - 1)]; if (best < 0 || s.cache.get(k)!.freq < s.cache.get(best)!.freq) best = k; }
  return best;
}

export function put(s: CacheState, c: CacheConfig, rng: Rng, k: number, ver: number, exp: number, nul = false) {
  const old = s.cache.get(k);
  if (old) { remove(s, k); }
  else while (s.cache.size >= c.cacheSize && s.cache.size) remove(s, victim(s, c.eviction, rng));
  s.cache.set(k, { ver, exp, freq: (old?.freq ?? 0) + 1, pos: s.keys.length, nul });
  s.keys.push(k);
}

function touch(s: CacheState, c: CacheConfig, k: number, e: Entry) {
  e.freq++;
  if (c.eviction === "lru") { s.cache.delete(k); s.cache.set(k, e); }
}

const ttlMs = (c: CacheConfig, rng: Rng) => c.ttl * 1000 * (c.jitter ? 0.9 + 0.2 * rng.next() : 1);

// ── Queues: DB and cache nodes ──────────────────────────────────────────────

/** Enqueue one op; returns its latency, or -1 if the queue is past the timeout. */
function enqueue(q: Queue, cap: number, base: number) {
  const wait = (q.backlog / cap) * 1000;
  if (wait > TIMEOUT_MS) return -1;
  q.backlog++;
  return base + wait;
}

// ── Requests ────────────────────────────────────────────────────────────────

function verOf(m: Map<number, number>, k: number) { return m.get(k) ?? 0; }

function dbRead(s: CacheState, c: CacheConfig, ctx: TickContext<CacheConfig>, k: number, t: number, server: number, bogus: boolean) {
  const lat = enqueue(s.db, c.dbCapacity, c.dbLatency * s.dbSlow);
  s.dbQueries++; s.sec.db++;
  ctx.metrics.inc("db");
  if (lat < 0) { s.errors++; ctx.metrics.inc("errors"); return -1; }
  // The value is read now; it lands in the cache when the query returns, possibly after a newer write.
  s.fills.push({ key: k, ver: verOf(s.dbVer, k), at: t + lat, server, nul: bogus });
  return lat;
}

function read(s: CacheState, c: CacheConfig, ctx: TickContext<CacheConfig>, t: number) {
  const rng = ctx.rng;
  const bogus = rng.next() * 100 < c.bogusPct;
  const k = bogus ? c.keyspace + rng.int(0, 999) : s.hotKey && rng.chance(0.5) ? 0 : sample(s.cdf, rng.next());
  const server = rng.int(0, APP_SERVERS - 1);
  s.reads++; s.sec.reads++;
  ctx.metrics.inc("reads");
  const done = (lat: number, hit: boolean, ver?: number) => {
    if (hit) { s.hits++; s.sec.hits++; ctx.metrics.inc("hits"); }
    if (ver !== undefined && !bogus && ver < verOf(s.latest, k)) { s.stale++; ctx.metrics.inc("stale"); }
    ctx.metrics.observe("latency", lat);
  };

  if (c.localCache) {
    const exp = s.local[server].get(k);
    if (exp !== undefined && exp > t) { done(0.05, true, s.cache.get(k)?.ver ?? verOf(s.dbVer, k)); return; }
    s.localHits.set(k, (s.localHits.get(k) ?? 0) + 1);
  }

  const node = nodeOf(k);
  let lat = 0;
  if (!s.down[node]) {
    const l = enqueue(s.nodes[node], NODE_CAPACITY, c.cacheLatency);
    if (l < 0) { s.errors++; ctx.metrics.inc("errors"); done(TIMEOUT_MS, false); return; }
    lat = l;
    const e = s.cache.get(k);
    if (e && e.exp > t) {
      touch(s, c, k, e);
      if (c.localCache && s.localHits.get(k)! > 2 && isHot(s, k)) s.local[server].set(k, t + LOCAL_TTL);
      done(lat, true, e.nul ? undefined : e.ver);
      return;
    }
    if (e) remove(s, k);
  }

  // Miss. Coalescing joins an in-flight query on the same app server; a mutex joins one anywhere.
  const scope = c.mutex ? `${k}` : c.coalescing ? `${k}@${server}` : "";
  const wait = scope && s.inflight.get(scope);
  if (wait && wait > t) { done(lat + (wait - t) + (c.mutex ? MUTEX_POLL / 2 : 0), false, verOf(s.dbVer, k)); return; }
  const q = dbRead(s, c, ctx, k, t, server, bogus);
  if (q < 0) { done(lat + TIMEOUT_MS, false); return; }
  if (scope) s.inflight.set(scope, t + q);
  done(lat + q, false, verOf(s.dbVer, k));
}

/** A key counts as hot if it is among the most requested recently (cheap top-N by counter). */
function isHot(s: CacheState, k: number) {
  const n = s.localHits.get(k) ?? 0;
  let above = 0;
  for (const v of s.localHits.values()) if (v > n && ++above >= LOCAL_KEYS) return false;
  return true;
}

function write(s: CacheState, c: CacheConfig, ctx: TickContext<CacheConfig>, t: number) {
  const k = s.hotKey && ctx.rng.chance(0.5) ? 0 : sample(s.cdf, ctx.rng.next());
  const ver = verOf(s.latest, k) + 1;
  s.latest.set(k, ver);
  ctx.metrics.inc("writes");
  const node = nodeOf(k);
  for (const l of s.local) l.delete(k);
  if (c.strategy === "write-behind") {
    // Acknowledged once the cache has it; the DB catches up at the next flush.
    if (s.down[node]) { s.dbVer.set(k, ver); enqueue(s.db, c.dbCapacity, c.dbLatency); return; }
    put(s, c, ctx.rng, k, ver, t + ttlMs(c, ctx.rng));
    s.dirty.set(k, ver);
    return;
  }
  const lat = enqueue(s.db, c.dbCapacity, c.dbLatency * s.dbSlow);
  s.dbQueries++; s.sec.db++;
  ctx.metrics.inc("db");
  if (lat < 0) { s.errors++; ctx.metrics.inc("errors"); s.latest.set(k, ver - 1); return; }
  s.dbVer.set(k, ver);
  if (s.down[node]) return;
  if (c.strategy === "write-through") put(s, c, ctx.rng, k, ver, t + ttlMs(c, ctx.rng));
  else remove(s, k); // delete on write
}

function flushDirty(s: CacheState) {
  // One batched DB write per dirty key, however many times it changed since the last flush.
  for (const [k, v] of s.dirty) { s.dbVer.set(k, v); s.db.backlog++; s.dbQueries++; s.sec.db++; }
  s.dirty.clear();
  s.nextFlush += FLUSH_EVERY;
}

export function flushCache(s: CacheState) {
  s.cache.clear(); s.keys = []; s.fills = []; s.inflight.clear();
  for (const l of s.local) l.clear();
  return s;
}

function nodeDown(s: CacheState, on: boolean) {
  s.down[1] = on;
  if (!on) return s;
  for (const k of [...s.cache.keys()]) if (nodeOf(k) === 1) {
    if (s.dirty.has(k)) { s.dirty.delete(k); s.lostWrites++; s.latest.set(k, verOf(s.dbVer, k)); }
    remove(s, k);
  }
  return s;
}

/** A warm-up job loads every cached key at the same moment with the same TTL (jitter spreads it). */
function warmUp(s: CacheState, c: CacheConfig, rng: Rng, t: number) {
  for (const [, e] of s.cache) e.exp = t + ttlMs(c, rng);
}

export function hitRate(s: CacheState, seconds: number) {
  const xs = s.secs.slice(-seconds);
  const r = xs.reduce((a, x) => a + x.reads, 0);
  return r ? xs.reduce((a, x) => a + x.hits, 0) / r : 0;
}
export const peakDbUtil = (s: CacheState, from: number) => Math.max(0, ...s.secs.filter((x) => x.t > from).map((x) => x.dbUtil));

export const cacheModel: SimModel<CacheConfig, CacheState> = {
  init: (c) => ({
    cache: new Map(), keys: [], latest: new Map(), dbVer: new Map(), dirty: new Map(), nextFlush: FLUSH_EVERY,
    inflight: new Map(), fills: [], local: Array.from({ length: APP_SERVERS }, () => new Map()), localHits: new Map(),
    db: { backlog: 0 }, nodes: Array.from({ length: NODES }, () => ({ backlog: 0 })), down: Array(NODES).fill(false),
    dbSlow: 1, hotKey: false, cdf: zipfCdf(c.keyspace, c.skew), cdfFor: `${c.keyspace}/${c.skew}`, acc: 0, flushed: false, warmed: false, warmNow: false, dedupeUsed: false, localUsed: false, maxItems: c.cacheSize,
    sec: { t: 1000, reads: 0, hits: 0, db: 0, dbUtil: 0 }, secs: [],
    reads: 0, hits: 0, dbQueries: 0, stale: 0, errors: 0, lostWrites: 0, dbPeakAfterFlush: 0,
  }),

  tick(s, ctx) {
    const c = ctx.config, t = ctx.t, dt = ctx.dt;
    const id = `${c.keyspace}/${c.skew}`;
    if (c.coalescing || c.mutex) s.dedupeUsed = true;
    if (c.localCache) s.localUsed = true;
    s.maxItems = Math.max(s.maxItems, c.cacheSize);
    if (id !== s.cdfFor) { s.cdf = zipfCdf(c.keyspace, c.skew); s.cdfFor = id; }
    if (c.flushAt && !s.flushed && t >= c.flushAt) { s.flushed = true; flushCache(s); ctx.log("warn", "Cache flushed: every read is a miss until it refills"); }
    if (s.warmNow || (c.warmAt && !s.warmed && t >= c.warmAt)) { s.warmed = true; s.warmNow = false; warmUp(s, c, ctx.rng, t); ctx.log("info", `Warm-up job: every key reloaded with TTL ${c.ttl} s${c.jitter ? " ± 10%" : ", all at once"}`); }

    // Servers drain their backlog at capacity.
    s.db.backlog = Math.max(0, s.db.backlog - (c.dbCapacity * dt) / 1000);
    for (const n of s.nodes) n.backlog = Math.max(0, n.backlog - (NODE_CAPACITY * dt) / 1000);

    // Completed DB reads fill the cache (a stale version if a write landed in between).
    if (s.fills.length) {
      const due = s.fills.filter((f) => f.at <= t);
      s.fills = s.fills.filter((f) => f.at > t);
      for (const f of due) {
        if (s.down[nodeOf(f.key)]) continue;
        if (f.nul) { if (c.nullCache) put(s, c, ctx.rng, f.key, 0, f.at + NULL_TTL, true); continue; }
        put(s, c, ctx.rng, f.key, f.ver, f.at + ttlMs(c, ctx.rng));
      }
      for (const [k, at] of s.inflight) if (at <= t) s.inflight.delete(k);
    }
    if (c.strategy === "write-behind" && t >= s.nextFlush) flushDirty(s);

    s.acc += (c.qps * dt) / 1000;
    let n = Math.floor(s.acc);
    s.acc -= n;
    while (n-- > 0) {
      const at = t - ctx.rng.next() * dt;
      if (ctx.rng.next() < c.readRatio) read(s, c, ctx, at); else write(s, c, ctx, at);
    }

    if (t >= s.sec.t) {
      s.sec.dbUtil = s.sec.db / c.dbCapacity;
      s.secs.push(s.sec);
      if (s.secs.length > SECONDS_KEEP) s.secs.shift();
      if (s.flushed) s.dbPeakAfterFlush = Math.max(s.dbPeakAfterFlush, s.sec.dbUtil);
      s.sec = { t: s.sec.t + 1000, reads: 0, hits: 0, db: 0, dbUtil: 0 };
      // Decay hot-key counters so "hot" means recently hot.
      for (const [k, v] of s.localHits) { if (v <= 1) s.localHits.delete(k); else s.localHits.set(k, v >> 1); }
    }
    return s;
  },

  actions: {
    flush: (s) => flushCache(structuredClone(s)),
  },

  faults: [
    { id: "flush", label: "Flush the whole cache", description: "A deploy or restart empties every node: a cold start. Watch the DB take every read until the cache refills.", apply: (s) => flushCache(s), revert: (s) => s },
    { id: "hot", label: "Hot key (50% of traffic)", description: "One key gets half of all requests, and every one of them lands on the same cache node.", apply: (s) => { s.hotKey = true; return s; }, revert: (s) => { s.hotKey = false; return s; } },
    { id: "mass-expiry", label: "Mass expiry", description: "A warm-up job reloads every cached key with the same TTL, so they all expire together one TTL from now.", apply: (s) => { s.warmNow = true; return s; }, revert: (s) => s },
    { id: "db-slow", label: "DB slowdown (×5 latency)", description: "A vacuum, a bad plan or a noisy neighbour: every DB query takes five times longer, so misses overlap for longer.", apply: (s) => { s.dbSlow = 5; return s; }, revert: (s) => { s.dbSlow = 1; return s; } },
    { id: "node-down", label: "Cache node down", description: "One of four cache nodes dies: its quarter of the keys miss (and, under write-behind, its unflushed writes are lost).", apply: (s) => nodeDown(s, true), revert: (s) => nodeDown(s, false) },
  ],

  metrics(s, reg, t) {
    const p = reg.histogram("latency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const reads = reg.rate("reads", t);
    const last = s.secs.at(-1);
    return {
      hitRate: reads ? Math.min(1, reg.rate("hits", t) / reads) * 100 : 0,
      dbQps: reg.rate("db", t),
      dbUtil: (last?.dbUtil ?? 0) * 100,
      p50: p.p50, p99: p.p99,
      staleRate: reads ? (reg.rate("stale", t) / reads) * 100 : 0,
      stale: s.stale, errors: s.errors, lostWrites: s.lostWrites, items: s.cache.size,
    };
  },
};

// ── Race demo: two requests, update-on-write vs delete-on-write ─────────────

export type RaceMode = "update" | "delete";
export interface RaceStep { actor: "A" | "B" | "R" | "-"; text: string; db: string; cache: string; bad?: boolean }

/**
 * Two writers race. With update-on-write the slower writer's cache SET lands last and pins the old
 * value; with delete-on-write the next reader repopulates from the DB.
 */
export function raceTimeline(mode: RaceMode): RaceStep[] {
  const steps: RaceStep[] = [
    { actor: "-", text: "Cache and DB both hold price = 10", db: "10", cache: "10" },
    { actor: "A", text: "Writer A: UPDATE price = 11 in the DB", db: "11", cache: "10" },
    { actor: "B", text: "Writer B: UPDATE price = 12 in the DB", db: "12", cache: "10" },
  ];
  if (mode === "update") {
    steps.push(
      { actor: "B", text: "Writer B: SET cache price = 12", db: "12", cache: "12" },
      { actor: "A", text: "Writer A (delayed by a GC pause): SET cache price = 11", db: "12", cache: "11", bad: true },
      { actor: "R", text: "Every reader now gets 11 from the cache until the TTL expires", db: "12", cache: "11", bad: true },
    );
  } else {
    steps.push(
      { actor: "B", text: "Writer B: DEL price from the cache", db: "12", cache: "(empty)" },
      { actor: "A", text: "Writer A (delayed): DEL price, already gone, harmless", db: "12", cache: "(empty)" },
      { actor: "R", text: "Next reader misses, reads 12 from the DB and caches it", db: "12", cache: "12" },
    );
  }
  return steps;
}
