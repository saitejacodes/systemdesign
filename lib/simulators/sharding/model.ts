import type { Rng, SimModel } from "@/lib/sim/engine";

export type Strategy = "range-id" | "range-name" | "hash" | "directory";
export interface ShConfig { shards: number; strategy: Strategy; skew: number }

export const USERS = 10_000;
export const MIN_SHARDS = 4;
export const MAX_SHARDS = 16;
/** Base traffic: 1 req/s per user on average. */
export const TOTAL_RPS = 10_000;
export const CAPACITY = 2_500;
/** A celebrity alone fits one shard but overloads any shard it shares (1,500× an average user). */
export const CELEB_RPS = 1_500;
export const MAX_CELEBS = 3;
export const FRIENDS = 50;
const LOCAL = 0.95;
const NEAR = 100;

export interface Range { lo: number; hi: number; id: number }
export interface Change { kind: "strategy" | "shards" | "add" | "isolate" | "salt"; label: string; moved: number; t: number }

export interface ShState {
  n: number;
  strategy: Strategy;
  skew: number;
  /** Last config values seen, so actions that change n are not undone by the next tick. */
  seenShards: number;
  owner: Int32Array;
  /** Ranges over each user's sort key (id, or rank by name), with stable shard ids. */
  ranges: Range[];
  rate: Float64Array;
  celebs: number[];
  salted: Uint8Array;
  friends: Int32Array;
  names: string[];
  /** Users in name order: byName[rank] = user id. */
  byName: Int32Array;
  hashes: Uint32Array;
  load: Float64Array;
  /** Observed req/s per shard: Poisson arrivals smoothed over ~1 s. */
  obs: Float64Array;
  users: Int32Array;
  perQuery: number;
  crossShard: number;
  last: Change | null;
  t: number;
}

/** FNV-1a then murmur3's finalizer, as in the consistent-hashing simulator. */
export function hash32(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

const FIRST = ["Ada", "Bo", "Cai", "Dev", "Eli", "Femi", "Gus", "Hana", "Ines", "Jun", "Kai", "Lea", "Mo", "Nia", "Omar", "Priya", "Quinn", "Ravi", "Sol", "Tara", "Uma", "Vik", "Wen", "Yara", "Zed"];
const LAST = ["Abe", "Bose", "Cruz", "Diaz", "Eze", "Fox", "Gill", "Hart", "Ito", "Jain", "Khan", "Lund", "Mori", "Nair", "Ortiz", "Park", "Rao", "Silva", "Tan", "Vega", "Wu", "Zhou"];

/** Hot users get the lowest ids: rank 1 is user 0. Skew 0 is uniform. */
function rates(skew: number, celebs: number[]) {
  const r = new Float64Array(USERS);
  let z = 0;
  for (let u = 0; u < USERS; u++) z += (r[u] = (u + 1) ** -skew);
  for (let u = 0; u < USERS; u++) r[u] *= TOTAL_RPS / z;
  for (const c of celebs) r[c] = CELEB_RPS;
  return r;
}

const keyOf = (s: ShState, rank: number) => (s.strategy === "range-name" ? s.byName[rank] : rank);

function applyRanges(s: ShState) {
  for (const g of s.ranges) for (let k = g.lo; k < g.hi; k++) s.owner[keyOf(s, k)] = g.id;
}

/** Fresh layout for the current strategy and n (directory keeps its table). */
function layout(s: ShState) {
  if (s.strategy === "hash") for (let u = 0; u < USERS; u++) s.owner[u] = s.hashes[u] % s.n;
  else if (s.strategy !== "directory") {
    s.ranges = Array.from({ length: s.n }, (_, i) => ({ lo: Math.round((i * USERS) / s.n), hi: Math.round(((i + 1) * USERS) / s.n), id: i }));
    applyRanges(s);
  }
}

export function refresh(s: ShState) {
  s.load = new Float64Array(s.n);
  s.users = new Int32Array(s.n);
  let spread = 0;
  for (let u = 0; u < USERS; u++) {
    s.users[s.owner[u]]++;
    if (s.salted[u]) spread += s.rate[u]; else s.load[s.owner[u]] += s.rate[u];
  }
  for (let i = 0; i < s.n; i++) s.load[i] += spread / s.n;
  if (s.obs.length !== s.n) s.obs = Float64Array.from({ length: s.n }, (_, i) => s.obs[i] ?? s.load[i]);
  // A salted friend's posts live on every shard, so the feed query must ask them all.
  const seen = new Int32Array(s.n).fill(-1);
  let total = 0, cross = 0;
  for (let u = 0; u < USERS; u++) {
    let c = 0;
    for (let j = u * FRIENDS; j < (u + 1) * FRIENDS && c < s.n; j++) {
      const f = s.friends[j];
      if (s.salted[f]) { c = s.n; break; }
      if (seen[s.owner[f]] !== u) { seen[s.owner[f]] = u; c++; }
    }
    total += c;
    if (c > 1) cross++;
  }
  s.perQuery = total / USERS;
  s.crossShard = cross / USERS;
  return s;
}

/** Runs a change and records the share of users whose home shard moved. */
function change(s: ShState, kind: Change["kind"], label: string, mutate: () => void, extra = 0) {
  const prev = s.owner.slice();
  mutate();
  let m = 0;
  for (let u = 0; u < USERS; u++) if (prev[u] !== s.owner[u]) m++;
  s.last = { kind, label, moved: (m + extra) / USERS, t: s.t };
  return refresh(s);
}

export function hottest(s: ShState, ok: (i: number) => boolean = () => true) {
  let best = -1;
  for (let i = 0; i < s.n; i++) if (ok(i) && (best < 0 || s.load[i] > s.load[best])) best = i;
  return best;
}

/** Range split: the hot range is cut at its load median; only the upper part moves. */
function splitRange(s: ShState) {
  const width = (id: number) => { const g = s.ranges.find((r) => r.id === id)!; return g.hi - g.lo; };
  const id = hottest(s, (i) => width(i) > 1);
  if (id < 0) return false;
  const g = s.ranges.find((r) => r.id === id)!;
  let half = 0, acc = 0;
  for (let k = g.lo; k < g.hi; k++) if (!s.salted[keyOf(s, k)]) half += s.rate[keyOf(s, k)];
  let m = g.lo + 1;
  for (let k = g.lo; k < g.hi - 1; k++) { acc += s.salted[keyOf(s, k)] ? 0 : s.rate[keyOf(s, k)]; m = k + 1; if (acc >= half / 2) break; }
  s.ranges = [...s.ranges, { lo: m, hi: g.hi, id: s.n }].sort((a, b) => a.lo - b.lo);
  g.hi = m;
  s.n++;
  applyRanges(s);
  return true;
}

/** Directory split: the hot shard's users are dealt hottest-first to whichever half is lighter. */
function splitDirectory(s: ShState) {
  const id = hottest(s, (i) => s.users[i] > 1);
  if (id < 0) return false;
  const mine: number[] = [];
  for (let u = 0; u < USERS; u++) if (s.owner[u] === id) mine.push(u);
  mine.sort((a, b) => s.rate[b] - s.rate[a] || a - b);
  let a = 0, b = 0;
  const to = s.n++;
  for (const u of mine) {
    const r = s.salted[u] ? 0 : s.rate[u];
    if (b < a) { s.owner[u] = to; b += r; } else a += r;
  }
  return true;
}

function grow(s: ShState) {
  if (s.n >= MAX_SHARDS) return false;
  if (s.strategy === "hash") { s.n++; layout(s); return true; }
  return s.strategy === "directory" ? splitDirectory(s) : splitRange(s);
}

/** Directory shrink: users of removed shards go to the lightest shard left, hottest first. */
function shrinkDirectory(s: ShState, to: number) {
  const out: number[] = [];
  for (let u = 0; u < USERS; u++) if (s.owner[u] >= to) out.push(u);
  out.sort((a, b) => s.rate[b] - s.rate[a] || a - b);
  const load = s.load.slice(0, to);
  for (const u of out) {
    let best = 0;
    for (let i = 1; i < to; i++) if (load[i] < load[best]) best = i;
    s.owner[u] = best;
    load[best] += s.rate[u];
  }
  s.n = to;
}

export function maxAvg(s: ShState) {
  const avg = s.load.reduce((a, b) => a + b, 0) / s.n;
  return avg ? Math.max(...s.load) / avg : 0;
}

export const STRATEGY_LABEL: Record<Strategy, string> = { "range-id": "Range by user id", "range-name": "Range by name", hash: "Hash (hash(id) mod N)", directory: "Directory (lookup table)" };

export function friendsOf(rng: Rng) {
  const f = new Int32Array(USERS * FRIENDS);
  // Friends cluster: people who signed up together get nearby ids.
  for (let u = 0; u < USERS; u++) for (let j = 0; j < FRIENDS; j++) {
    let v = rng.chance(LOCAL) ? u + rng.int(-NEAR, NEAR) : rng.int(0, USERS - 1);
    if (v === u || v < 0 || v >= USERS) v = rng.int(0, USERS - 1);
    f[u * FRIENDS + j] = v === u ? (u + 1) % USERS : v;
  }
  return f;
}

export const shModel: SimModel<ShConfig, ShState> = {
  init(c, rng) {
    const names = Array.from({ length: USERS }, (_, u) => { const h = hash32(`name-${u}`); return `${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`; });
    const byName = Int32Array.from(Array.from({ length: USERS }, (_, u) => u).sort((a, b) => (names[a] < names[b] ? -1 : names[a] > names[b] ? 1 : a - b)));
    const s: ShState = {
      n: c.shards, strategy: c.strategy, skew: c.skew, seenShards: c.shards,
      owner: new Int32Array(USERS), ranges: [], rate: rates(c.skew, []), celebs: [], salted: new Uint8Array(USERS),
      friends: friendsOf(rng), names, byName, hashes: Uint32Array.from({ length: USERS }, (_, u) => hash32(`user-${u}`)),
      load: new Float64Array(0), obs: new Float64Array(0), users: new Int32Array(0), perQuery: 0, crossShard: 0, last: null, t: 0,
    };
    // Directory starts as a copy of a hash layout: the table can later say anything.
    if (s.strategy === "directory") { s.strategy = "hash"; layout(s); s.strategy = "directory"; } else layout(s);
    return refresh(s);
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    if (c.skew !== s.skew) { s.skew = c.skew; s.rate = rates(s.skew, s.celebs); refresh(s); ctx.log("info", `Skew set to ${s.skew === 0 ? "uniform" : `Zipf ${s.skew}`}`); }
    if (c.strategy !== s.strategy) {
      const from = s.strategy;
      // Switching to a directory copies today's placement into the table: nothing moves yet.
      change(s, "strategy", `${STRATEGY_LABEL[from]} → ${STRATEGY_LABEL[c.strategy]}`, () => { s.strategy = c.strategy; layout(s); });
      ctx.log("info", `Re-sharded ${s.last!.label}: ${(s.last!.moved * 100).toFixed(1)}% of users moved`);
    }
    if (c.shards !== s.seenShards) {
      const from = s.n, to = Math.min(MAX_SHARDS, Math.max(MIN_SHARDS, c.shards));
      s.seenShards = c.shards;
      if (to !== from) {
        change(s, "shards", `${from} → ${to} shards`, () => {
          if (s.strategy !== "directory") { s.n = to; layout(s); return; }
          if (to < from) shrinkDirectory(s, to);
          else while (s.n < to) { splitDirectory(s); refresh(s); }
        });
        ctx.log(s.last!.moved > 0.5 ? "warn" : "info", `${s.last!.label} (${STRATEGY_LABEL[s.strategy]}): ${(s.last!.moved * 100).toFixed(1)}% of users moved`);
      }
    }
    const k = ctx.dt / 1000;
    for (let i = 0; i < s.n; i++) s.obs[i] += (ctx.rng.poisson(s.load[i] * k) / k - s.obs[i]) * k;
    return s;
  },

  // Actions copy the state so a paused view re-renders.
  actions: {
    addShard(prev) {
      const s = structuredClone(prev);
      const label = s.strategy === "hash" ? `${s.n} → ${s.n + 1} shards (rehash)` : `Split hot shard (${s.n} → ${s.n + 1})`;
      let ok = false;
      change(s, "add", label, () => { ok = grow(s); });
      return ok ? s : prev;
    },
    celebrity(prev) {
      if (prev.celebs.length >= MAX_CELEBS) return prev;
      const s = structuredClone(prev);
      let u = hash32(`celebrity-${s.celebs.length}`) % USERS;
      while (s.celebs.includes(u)) u = (u + 1) % USERS;
      s.celebs.push(u);
      s.rate = rates(s.skew, s.celebs);
      return refresh(s);
    },
    /** Key splitting: the hottest key is written as user#0..user#N-1, one piece per shard. */
    salt(prev) {
      const s = structuredClone(prev);
      let u = -1;
      for (let v = 0; v < USERS; v++) if (!s.salted[v] && (u < 0 || s.rate[v] > s.rate[u])) u = v;
      if (u < 0) return prev;
      s.salted[u] = 1;
      return change(s, "salt", `Salted ${s.names[u]} across ${s.n} shards`, () => {}, (s.n - 1) / s.n);
    },
    /** Directory only: the hottest key gets a shard of its own. */
    isolate(prev) {
      if (prev.strategy !== "directory" || prev.n >= MAX_SHARDS) return prev;
      const s = structuredClone(prev);
      let u = -1;
      for (let v = 0; v < USERS; v++) if (!s.salted[v] && (u < 0 || s.rate[v] > s.rate[u])) u = v;
      return change(s, "isolate", `${s.names[u]} → dedicated shard S${s.n + 1}`, () => { s.owner[u] = s.n++; });
    },
  },

  faults: [],

  metrics(s) {
    const avg = s.load.reduce((a, b) => a + b, 0) / s.n;
    const max = Math.max(...s.load);
    return {
      shards: s.n,
      maxAvg: maxAvg(s),
      maxLoad: max,
      totalRps: avg * s.n,
      overloaded: s.load.filter((l) => l >= CAPACITY).length,
      moved: s.last?.moved ?? 0,
      perQuery: s.perQuery,
      crossShard: s.crossShard,
      celebs: s.celebs.length,
      salted: s.salted.reduce((a, b) => a + b, 0),
    };
  },
};

export const status = (load: number) => (load >= CAPACITY ? "over" : load >= 0.8 * CAPACITY ? "hot" : "ok");
