import type { SimModel } from "@/lib/sim/engine";
import type { Rng } from "@/lib/sim/engine/rng";

// ---------- Dataset (data/corpus.json, built by data/build.py; loaded lazily by the view) ----------

export interface RawCorpus { dim: number; topics: string[]; sources: string[]; texts: string[]; topic: number[]; source: number[]; year: number[]; vec: string; xy: string; queries: string[]; qvec: string; qxy: string; note: string }
export interface Corpus { n: number; dim: number; topics: string[]; sources: string[]; texts: string[]; topic: number[]; source: number[]; year: number[]; vecs: Float32Array; xy: Float32Array; queries: string[]; qvecs: Float32Array; qxy: Float32Array; note: string }

const int8 = (b64: string) => { const s = atob(b64); const a = new Int8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = (s.charCodeAt(i) << 24) >> 24; return a; };
/** int8 back to floats, re-normalised to unit length so cosine = dot product. */
function unitRows(q: Int8Array, dim: number) {
  const v = new Float32Array(q.length);
  for (let r = 0; r < q.length; r += dim) {
    let n = 0;
    for (let j = 0; j < dim; j++) n += q[r + j] * q[r + j];
    n = Math.sqrt(n) || 1;
    for (let j = 0; j < dim; j++) v[r + j] = q[r + j] / n;
  }
  return v;
}
export function decodeCorpus(r: RawCorpus): Corpus {
  const xy = Float32Array.from(int8(r.xy), (x) => x / 127), qxy = Float32Array.from(int8(r.qxy), (x) => x / 127);
  return { n: r.texts.length, dim: r.dim, topics: r.topics, sources: r.sources, texts: r.texts, topic: r.topic, source: r.source, year: r.year, vecs: unitRows(int8(r.vec), r.dim), xy, queries: r.queries, qvecs: unitRows(int8(r.qvec), r.dim), qxy, note: r.note };
}

// ---------- Metadata filters ----------

export type FilterId = "none" | "docs" | "y2026" | "rare";
export const FILTERS: { value: FilterId; label: string }[] = [
  { value: "none", label: "No filter" },
  { value: "docs", label: "source = docs (~40%)" },
  { value: "y2026", label: "year = 2026 (~12%)" },
  { value: "rare", label: "source = ticket AND year = 2026 (~3%)" },
];
export function matches(c: Corpus, f: FilterId, i: number) {
  switch (f) {
    case "none": return true;
    case "docs": return c.source[i] === 0;
    case "y2026": return c.year[i] === 2026;
    case "rare": return c.source[i] === 2 && c.year[i] === 2026;
  }
}

// ---------- Distance ----------

/** Cosine distance on unit vectors: 1 − a·b. With the "unnormalised" fault the vectors aren't unit, so this is 1 − raw dot. */
function dist(a: Float32Array, i: number, b: Float32Array, j: number, dim: number) {
  let s = 0;
  const ai = i * dim, bj = j * dim;
  for (let d = 0; d < dim; d++) s += a[ai + d] * b[bj + d];
  return 1 - s;
}
export interface Hit { id: number; d: number }
/** Keeps `arr` sorted by d ascending, capped at `cap` (binary insertion: cheap for ef ≤ a few hundred). */
function push(arr: Hit[], h: Hit, cap = Infinity) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].d <= h.d) lo = m + 1; else hi = m; }
  if (lo >= cap) return;
  arr.splice(lo, 0, h);
  if (arr.length > cap) arr.pop();
}

/** Exact top-k by scanning every candidate `ok` accepts. Cost = vectors scanned. */
export function bruteForce(vecs: Float32Array, dim: number, n: number, q: Float32Array, qi: number, k: number, ok: (i: number) => boolean) {
  const top: Hit[] = [];
  let comps = 0;
  for (let i = 0; i < n; i++) {
    if (!ok(i)) continue;
    comps++;
    const d = dist(q, qi, vecs, i, dim);
    if (top.length < k || d < top[top.length - 1].d) push(top, { id: i, d }, k);
  }
  return { hits: top, comps };
}

// ---------- HNSW (Malkov & Yashunin, "Efficient and robust ANN search using HNSW graphs", 2016/2018) ----------

export interface Hnsw {
  M: number; efC: number; mL: number; dim: number; n: number;
  vecs: Float32Array;
  level: number[];
  /** links[node][layer] = neighbour ids. Layer 0 keeps up to 2·M, upper layers M (Mmax0 = 2M, as the paper recommends). */
  links: number[][][];
  entry: number; maxLevel: number; inserted: number; buildComps: number;
  visited: Uint32Array; stamp: number;
}
export function newIndex(vecs: Float32Array, dim: number, n: number, M: number, efC: number): Hnsw {
  return { M, efC, mL: 1 / Math.log(M), dim, n, vecs, level: [], links: [], entry: -1, maxLevel: -1, inserted: 0, buildComps: 0, visited: new Uint32Array(n), stamp: 0 };
}

/** Algorithm 2 (SEARCH-LAYER): ef-bounded best-first beam on one layer. `q` is row `qi` of `qv`. */
function searchLayer(ix: Hnsw, qv: Float32Array, qi: number, eps: number[], ef: number, layer: number, ctr: { n: number }, trace?: number[]) {
  const st = ++ix.stamp;
  const W: Hit[] = [], C: Hit[] = [];
  for (const e of eps) {
    if (ix.visited[e] === st) continue;
    ix.visited[e] = st;
    const h = { id: e, d: dist(qv, qi, ix.vecs, e, ix.dim) };
    ctr.n++;
    trace?.push(e);
    push(W, h, ef); push(C, h);
  }
  while (C.length) {
    const c = C.shift()!;
    if (W.length >= ef && c.d > W[W.length - 1].d) break;
    for (const e of ix.links[c.id][layer] ?? []) {
      if (ix.visited[e] === st) continue;
      ix.visited[e] = st;
      const d = dist(qv, qi, ix.vecs, e, ix.dim);
      ctr.n++;
      trace?.push(e);
      if (W.length < ef || d < W[W.length - 1].d) { push(C, { id: e, d }); push(W, { id: e, d }, ef); }
    }
  }
  return W;
}

/**
 * Algorithm 4 (SELECT-NEIGHBORS-HEURISTIC) without extendCandidates/keepPrunedConnections, as hnswlib does:
 * take candidates closest-first, keep one only if it is closer to the base than to every neighbour kept so far.
 * This keeps links pointing in different directions, so clusters stay connected to each other.
 */
function selectNeighbours(ix: Hnsw, cands: Hit[], m: number, ctr: { n: number }) {
  const R: number[] = [];
  for (const c of cands) {
    if (R.length >= m) break;
    let good = true;
    for (const r of R) { ctr.n++; if (dist(ix.vecs, c.id, ix.vecs, r, ix.dim) < c.d) { good = false; break; } }
    if (good) R.push(c.id);
  }
  return R;
}

/** Algorithm 1 (INSERT). Level = ⌊−ln(U)·mL⌋ with mL = 1/ln(M). Returns distance computations used. */
export function insert(ix: Hnsw, q: number, rng: Pick<Rng, "next">) {
  const ctr = { n: 0 };
  const l = Math.floor(-Math.log(1 - rng.next()) * ix.mL);
  ix.level[q] = l;
  ix.links[q] = Array.from({ length: l + 1 }, () => []);
  ix.inserted++;
  if (ix.entry < 0) { ix.entry = q; ix.maxLevel = l; return 0; }
  let eps = [ix.entry];
  for (let lc = ix.maxLevel; lc > l; lc--) eps = [searchLayer(ix, ix.vecs, q, eps, 1, lc, ctr)[0].id];
  for (let lc = Math.min(ix.maxLevel, l); lc >= 0; lc--) {
    const W = searchLayer(ix, ix.vecs, q, eps, ix.efC, lc, ctr);
    const mmax = lc === 0 ? 2 * ix.M : ix.M;
    const nb = selectNeighbours(ix, W, ix.M, ctr);
    ix.links[q][lc] = nb;
    for (const e of nb) {
      const el = ix.links[e][lc];
      el.push(q);
      if (el.length > mmax) {
        const cands: Hit[] = [];
        for (const x of el) { ctr.n++; push(cands, { id: x, d: dist(ix.vecs, e, ix.vecs, x, ix.dim) }); }
        ix.links[e][lc] = selectNeighbours(ix, cands, mmax, ctr);
      }
    }
    eps = W.map((h) => h.id);
  }
  if (l > ix.maxLevel) { ix.entry = q; ix.maxLevel = l; }
  ix.buildComps += ctr.n;
  return ctr.n;
}

export interface Trace { path: number[]; visited: number[] }
/** Algorithm 5 (K-NN-SEARCH): greedy ef=1 descent through upper layers, then an efSearch beam at layer 0. Returns the ef best. */
export function knn(ix: Hnsw, qv: Float32Array, qi: number, ef: number, trace?: Trace) {
  const ctr = { n: 0 };
  let ep = ix.entry;
  trace?.path.push(ep);
  for (let lc = ix.maxLevel; lc > 0; lc--) { ep = searchLayer(ix, qv, qi, [ep], 1, lc, ctr)[0].id; trace?.path.push(ep); }
  const hits = searchLayer(ix, qv, qi, [ep], ef, 0, ctr, trace?.visited);
  return { hits, comps: ctr.n };
}

export const layerSizes = (ix: Hnsw) => { const s = Array(ix.maxLevel + 1).fill(0); for (let i = 0; i < ix.inserted; i++) for (let l = 0; l <= ix.level[i]; l++) s[l]++; return s as number[]; };

// ---------- One query, the way a vector database answers it ----------

export type FilterMode = "pre" | "post";
export const MODES: { value: FilterMode; label: string }[] = [
  { value: "post", label: "Post-filter (search, then filter)" },
  { value: "pre", label: "Pre-filter (filter, then exact scan)" },
];
export interface Search { exact: Hit[]; brute: number; hits: Hit[]; comps: number; method: "hnsw" | "scan"; matching: number; trace?: Trace }

/**
 * exact = ground truth (cosine, top-k of the matching items). The system answer:
 * no filter → HNSW top-k; post → HNSW returns its efSearch best, then the filter drops non-matches (can leave < k, like
 * pgvector's documented "fewer results" with hnsw.ef_search); pre → exact scan of only the matching items.
 */
export function search(c: Corpus, ix: Hnsw, qv: Float32Array, qi: number, self: number, k: number, efSearch: number, filter: FilterId, mode: FilterMode, sysVecs: Float32Array, sysQ: Float32Array, trace?: Trace): Search {
  const ok = (i: number) => i !== self && matches(c, filter, i);
  const truth = bruteForce(c.vecs, c.dim, c.n, qv, qi, k, ok);
  let matching = 0;
  for (let i = 0; i < c.n; i++) if (ok(i)) matching++;
  if (filter !== "none" && mode === "pre") {
    const r = bruteForce(sysVecs, c.dim, c.n, sysQ, qi, k, ok);
    return { exact: truth.hits, brute: c.n, hits: r.hits, comps: r.comps, method: "scan", matching };
  }
  const r = knn(ix, sysQ, qi, Math.max(efSearch, k + (self >= 0 ? 1 : 0)), trace);
  return { exact: truth.hits, brute: c.n, hits: r.hits.filter((h) => ok(h.id)).slice(0, k), comps: r.comps, method: "hnsw", matching, trace };
}

/** recall@k = |returned ∩ exact top-k| / |exact top-k|. Missing results count as misses. */
export const recallOf = (s: Search) => (s.exact.length ? s.hits.filter((h) => s.exact.some((e) => e.id === h.id)).length / s.exact.length : 1);

// ---------- Simulation ----------

export interface VsConfig { M: number; efConstruction: number; efSearch: number; k: number; filter: FilterId; filterMode: FilterMode }
export type Query = { kind: "sample" | "item"; i: number };
export interface BenchResult { recall: number; comps: number; pct: number; returned: number; short: number; queries: number; M: number; efC: number; efSearch: number; filter: FilterId; mode: FilterMode; faults: string[] }
export interface VsState {
  corpus: Corpus | null;
  ix: Hnsw | null; ixKey: string; buildTicks: number;
  unnormalised: boolean; mismatch: boolean;
  /** Vectors the system actually uses (differ from the true ones under a fault). Cached: recomputed only when a fault toggles. */
  sys: { key: string; vecs: Float32Array; items: Float32Array; queries: Float32Array } | null;
  query: Query;
  bench: { key: string; next: number; recall: number; comps: number; returned: number; short: number } | null;
  last: BenchResult | null;
  results: BenchResult[];
}

export const K = 10;
/** Benchmark: every 10th dataset item as the query (200 queries), its own vector excluded. */
export const BENCH_STEP = 10;
/** Work per tick, in distance computations (~64 multiply-adds each), so building never blocks a frame for long. */
export const TICK_BUDGET = 15_000;
const MAX_RESULTS = 12;

export const benchQueries = (c: Corpus) => Math.floor(c.n / BENCH_STEP);
const faultsOf = (s: VsState) => [...(s.unnormalised ? ["unnormalised"] : []), ...(s.mismatch ? ["mismatch"] : [])];

/** The fault vectors: lengths that grow with text length (raw TF-IDF magnitudes), or queries from another model version. */
function systemVectors(c: Corpus, unnormalised: boolean, mismatch: boolean) {
  const mean = c.texts.reduce((a, t) => a + t.length, 0) / c.n;
  const vecs = unnormalised ? c.vecs.map((x, j) => x * Math.min(2.5, Math.max(0.4, (c.texts[Math.floor(j / c.dim)].length / mean) ** 1.5))) : c.vecs;
  // A different model's space: same dimensionality, unrelated axes (here a fixed permutation with sign flips).
  const remap = (v: Float32Array) => v.map((_, j) => { const r = Math.floor(j / c.dim) * c.dim, d = j % c.dim; return v[r + ((d * 37 + 11) % c.dim)] * (d % 3 ? 1 : -1); });
  return { vecs, items: mismatch ? remap(c.vecs) : vecs, queries: mismatch ? remap(c.qvecs) : c.qvecs };
}

function sysOf(s: VsState) {
  const key = `${s.unnormalised}|${s.mismatch}`;
  if (s.sys?.key !== key) s.sys = { key, ...systemVectors(s.corpus!, s.unnormalised, s.mismatch) };
  return s.sys;
}
function queryVec(s: VsState, q: Query) {
  const c = s.corpus!, sys = sysOf(s);
  return q.kind === "sample" ? { qv: c.qvecs, sq: sys.queries, qi: q.i, self: -1 } : { qv: c.vecs, sq: sys.items, qi: q.i, self: q.i };
}

export const isBuilt = (s: VsState) => !!(s.corpus && s.ix && s.ix.inserted === s.corpus.n);
/** The interactive query, with its HNSW trace. Pure and cheap (one scan + one search), so the view can run it while paused. */
export function answer(s: VsState, cfg: VsConfig): Search | null {
  if (!isBuilt(s)) return null;
  const q = queryVec(s, s.query);
  return search(s.corpus!, s.ix!, q.qv, q.qi, q.self, cfg.k, cfg.efSearch, cfg.filter, cfg.filterMode, sysOf(s).vecs, q.sq, { path: [], visited: [] });
}

export const vsModel: SimModel<VsConfig, VsState> = {
  init: () => ({ corpus: null, ix: null, ixKey: "", buildTicks: 0, unnormalised: false, mismatch: false, sys: null, query: { kind: "sample", i: 0 }, bench: null, last: null, results: [] }),

  tick(s, ctx) {
    const c = s.corpus;
    if (!c) return s;
    const cfg = ctx.config;
    const ixKey = `${cfg.M}|${cfg.efConstruction}|${s.unnormalised}`;
    if (ixKey !== s.ixKey) {
      s.ix = newIndex(sysOf(s).vecs, c.dim, c.n, cfg.M, cfg.efConstruction);
      s.ixKey = ixKey; s.buildTicks = 0; s.bench = null;
    }
    const ix = s.ix!;
    let budget = TICK_BUDGET;
    if (ix.inserted < c.n) {
      s.buildTicks++;
      while (ix.inserted < c.n && budget > 0) budget -= Math.max(1, insert(ix, ix.inserted, ctx.rng));
      if (ix.inserted === c.n) ctx.log("info", `HNSW built: ${c.n} nodes, ${layerSizes(ix).length} layers, ${ix.buildComps.toLocaleString("en-US")} distance computations over ${s.buildTicks} ticks (M=${ix.M}, efConstruction=${ix.efC}).`);
      return s;
    }
    const sys = sysOf(s);
    const bKey = `${ixKey}|${s.mismatch}|${cfg.efSearch}|${cfg.filter}|${cfg.filterMode}`;
    if (s.bench?.key !== bKey) s.bench = { key: bKey, next: 0, recall: 0, comps: 0, returned: 0, short: 0 };
    const b = s.bench;
    const total = benchQueries(c);
    if (b.next >= total) return s;
    while (b.next < total && budget > 0) {
      const qi = b.next * BENCH_STEP;
      const r = search(c, ix, c.vecs, qi, qi, K, cfg.efSearch, cfg.filter, cfg.filterMode, sys.vecs, sys.items);
      b.recall += recallOf(r); b.comps += r.comps; b.returned += r.hits.length; if (r.hits.length < Math.min(K, r.matching)) b.short++;
      budget -= c.n + r.comps;
      b.next++;
    }
    if (b.next === total) {
      const res: BenchResult = { recall: b.recall / total, comps: b.comps / total, pct: (b.comps / total / c.n) * 100, returned: b.returned / total, short: b.short, queries: total, M: cfg.M, efC: cfg.efConstruction, efSearch: cfg.efSearch, filter: cfg.filter, mode: cfg.filterMode, faults: faultsOf(s) };
      s.last = res;
      s.results = [...s.results, res].slice(-MAX_RESULTS);
      const where = cfg.filter === "none" ? "HNSW" : `${cfg.filterMode}-filter, ${FILTERS.find((f) => f.value === cfg.filter)!.label}`;
      ctx.log(res.recall < 0.9 || res.short ? "warn" : "info", `Benchmark (${total} queries, ${where}, efSearch=${cfg.efSearch}): recall@10 ${res.recall.toFixed(3)}, ${Math.round(res.comps)} distance computations per query (${res.pct.toFixed(1)}% of brute force)${res.short ? `, ${res.short} queries got fewer than 10 results` : ""}.`);
    }
    return s;
  },

  actions: {
    load: (s, p) => ({ ...s, corpus: p as Corpus, ixKey: "" }),
    query: (s, p) => ({ ...s, query: p as Query }),
  },

  faults: [
    {
      id: "unnormalised", label: "Forget to L2-normalise",
      description: "Index and search with raw dot product on vectors whose length grows with the text. Long texts win every query, whatever they say.",
      apply: (s) => ({ ...s, unnormalised: true }),
      revert: (s) => ({ ...s, unnormalised: false }),
    },
    {
      id: "mismatch", label: "Upgrade the query embedding model only",
      description: "Queries are embedded with a new model version; the index still holds the old one. Same dimensions, unrelated axes.",
      apply: (s) => ({ ...s, mismatch: true }),
      revert: (s) => ({ ...s, mismatch: false }),
    },
  ],

  metrics(s) {
    const c = s.corpus, ix = s.ix, l = s.last;
    const built = c && ix ? (ix.inserted / c.n) * 100 : 0;
    return {
      built, buildComps: ix?.buildComps ?? 0,
      recall: l ? l.recall * 100 : 0, comps: l?.comps ?? 0, pct: l?.pct ?? 0, returned: l?.returned ?? 0,
      benchDone: s.bench && c ? (s.bench.next / benchQueries(c)) * 100 : 0,
    };
  },
};
