import type { MetricSnapshot, SimModel } from "@/lib/sim/engine";

/*
 * A real retrieval pipeline over a bundled handbook, run in the browser:
 * chunk → embed (LSA word vectors) → index (BM25 postings + vectors) → retrieve (vector, BM25 or RRF)
 * → rerank (lexical proximity scorer) → assemble a prompt under a token budget → generate (offline:
 * the reference answer). Every settings change rebuilds what it invalidates and re-runs the 20-question
 * eval; Play steps through the questions one at a time so the trace is easy to follow.
 */

export type Strategy = "fixed" | "sentence" | "heading";
export type Retrieval = "vector" | "bm25" | "hybrid";
export interface Settings { strategy: Strategy; chunkSize: number; overlap: number; retrieval: Retrieval; topK: number; rerank: boolean; budget: number }
export interface RagConfig extends Settings { priceIn: number; priceOut: number; stepSeconds: number }
export const SETTING_KEYS = ["strategy", "chunkSize", "overlap", "retrieval", "topK", "rerank", "budget"] as const;

export interface Question { id: string; kind: "split" | "lexical" | "semantic"; q: string; gold: string[]; answer: string; doc: string }
export interface Revision { doc: string; current: string; old: string }
export interface Corpus {
  dim: number; stop: string[]; docs: { id: string; title: string; text: string }[];
  questions: Question[]; revisions: Revision[];
  vocab: string[]; idf: number[]; scale: number[]; vectors: string;
  stats: { paragraphs: number; words: number; explained: number };
}

export interface Chunk { doc: number; start: number; end: number; prefix: string; text: string; tokens: number; terms: string[]; vec: Float32Array; label: string }
export interface Cand { c: number; vec?: [rank: number, score: number]; bm25?: [rank: number, score: number]; rrf?: number; rr?: { score: number; sim: number; cov: number; prox: number }; inContext: boolean }
export interface Latency { embed: number; search: number; rerank: number; prefill: number; decode: number }
export type Reason = "hit" | "split" | "budget" | "stale" | "missed";
export interface Trace { query: string; qi?: number; cands: Cand[]; context: number[]; ctxTokens: number; promptTokens: number; outTokens: number; cost: number; latency: Latency; reason?: Reason }

interface Lsa { dim: number; ix: Map<string, number>; idf: Float32Array; vecs: Float32Array; stop: Set<string> }
interface Index { key: string; chunks: Chunk[]; df: Map<string, number>; avgdl: number; texts: string[]; gold: { doc: number; start: number; end: number; stale: boolean }[][] }

export interface RagState {
  data: Corpus | null; lsa: Lsa | null; index: Index | null;
  settings: Settings; cfg: Settings;
  stale: boolean; mismatch: boolean;
  /** Copied from config each tick: actions and faults don't receive config. */
  prices: Pick<RagConfig, "priceIn" | "priceOut">;
  traces: Trace[]; custom: Trace | null; qi: number; acc: number;
}

export const tokens = (s: string) => Math.ceil(s.length / 4); // chars ÷ 4: an approximation, not a real tokenizer
const SYSTEM = "Answer the question using only the numbered sources below. Cite every claim like [1]. If the sources do not contain the answer, say you do not know.";
const K1 = 1.2, B = 0.75, RRF_K = 60; // BM25 (Robertson & Zaragoza) and reciprocal rank fusion (Cormack et al. 2009)
const POOL = 50; // each retriever's list depth fed into fusion

// ── Text processing (mirrors data/build.py) ─────────────────────────────────

export function stem(w: string) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
export const tokenize = (text: string, stop: Set<string>) => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !stop.has(w)).map(stem);

function decode(c: Corpus): Lsa {
  const bin = atob(c.vectors), vecs = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const b = bin.charCodeAt(i);
    vecs[i] = ((b > 127 ? b - 256 : b) / 127) * c.scale[Math.floor(i / c.dim)];
  }
  return { dim: c.dim, ix: new Map(c.vocab.map((t, i) => [t, i])), idf: Float32Array.from(c.idf), vecs, stop: new Set(c.stop) };
}

/** TF-IDF-weighted sum of LSA word vectors, L2-normalised (fold-in). `rotate` simulates a different embedding model. */
export function embed(lsa: Lsa, terms: string[], rotate = false) {
  const v = new Float32Array(lsa.dim), tf = new Map<number, number>();
  for (const t of terms) { const i = lsa.ix.get(t); if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1); }
  for (const [i, n] of tf) {
    const w = (1 + Math.log(n)) * lsa.idf[i];
    for (let d = 0; d < lsa.dim; d++) v[d] += w * lsa.vecs[i * lsa.dim + (rotate ? (d * 7 + 3) % lsa.dim : d)];
  }
  let n = 0;
  for (let d = 0; d < lsa.dim; d++) n += v[d] * v[d];
  n = Math.sqrt(n) || 1;
  for (let d = 0; d < lsa.dim; d++) v[d] /= n;
  return v;
}
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Sentence spans: one per line (headings, paragraphs), split after . ! ? before a capital or digit. */
function sentences(text: string, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  const re = /[^\n]+/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m && m.index < to; m = re.exec(text)) {
    const line = m[0], base = m.index;
    let s = 0;
    const cut = /[.!?](\s+)(?=[A-Z0-9])/g;
    for (let c = cut.exec(line); c; c = cut.exec(line)) { out.push([base + s, base + c.index + 1]); s = c.index + 1 + c[1].length; }
    if (line.trim()) out.push([base + s, base + line.trimEnd().length]);
  }
  return out;
}

/** Greedy packing of whole spans up to `size` tokens; the next chunk repeats trailing spans worth ≤ `overlap` tokens. */
function pack(spans: [number, number][], size: number, overlap: number): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < spans.length) {
    let j = i + 1;
    while (j < spans.length && spans[j][1] - spans[i][0] <= size * 4) j++;
    out.push([spans[i][0], spans[j - 1][1]]);
    if (j >= spans.length) break;
    let k = j;
    while (k - 1 > i && spans[j - 1][1] - spans[k - 1][0] <= overlap * 4) k--;
    i = k;
  }
  return out;
}

function fixed(text: string, size: number, overlap: number): [number, number][] {
  const out: [number, number][] = [], step = Math.max(1, size - overlap) * 4;
  const snap = (i: number) => { while (i < text.length && !/\s/.test(text[i])) i++; return i; };
  for (let s = 0; s < text.length;) {
    const e = snap(Math.min(text.length, s + size * 4));
    out.push([s, e]);
    if (e >= text.length) break;
    s = snap(s + step);
    while (s < text.length && /\s/.test(text[s])) s++;
  }
  return out;
}

function sectionsOf(text: string) {
  const out: { heading: string; start: number; body: number; end: number }[] = [];
  const re = /^## (.+)$/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ heading: m[1], start: m.index, body: m.index + m[0].length, end: text.length });
  for (let i = 0; i < out.length - 1; i++) out[i].end = out[i + 1].start;
  return out;
}

export function docTexts(data: Corpus, stale: boolean) {
  return data.docs.map((d) => stale ? data.revisions.filter((r) => r.doc === d.id).reduce((t, r) => t.replace(r.current, r.old), d.text) : d.text);
}

export function chunkDoc(text: string, title: string, s: Pick<Settings, "strategy" | "chunkSize" | "overlap">) {
  const secs = sectionsOf(text);
  const label = (at: number) => `${title} › ${[...secs].reverse().find((x) => x.start <= at)?.heading ?? "Introduction"}`;
  if (s.strategy === "fixed") return fixed(text, s.chunkSize, s.overlap).map(([a, b]) => ({ a, b, prefix: "", label: label(a) }));
  if (s.strategy === "sentence") return pack(sentences(text, 0, text.length), s.chunkSize, s.overlap).map(([a, b]) => ({ a, b, prefix: "", label: label(a) }));
  // Heading-aware: never cross a section boundary, and carry the heading path in the chunk text.
  return secs.flatMap((x) => {
    const prefix = `${title} › ${x.heading}\n`;
    return pack(sentences(text, x.body, x.end), Math.max(10, s.chunkSize - tokens(prefix)), s.overlap).map(([a, b]) => ({ a, b, prefix, label: `${title} › ${x.heading}` }));
  });
}

function buildIndex(data: Corpus, lsa: Lsa, s: Settings, stale: boolean): Index {
  const texts = docTexts(data, stale);
  const chunks: Chunk[] = [];
  texts.forEach((text, doc) => {
    for (const { a, b, prefix, label } of chunkDoc(text, data.docs[doc].title, s)) {
      const body = prefix + text.slice(a, b), terms = tokenize(body, lsa.stop);
      chunks.push({ doc, start: a, end: b, prefix, text: body, tokens: tokens(body), terms, vec: embed(lsa, terms), label });
    }
  });
  const df = new Map<string, number>();
  for (const c of chunks) for (const t of new Set(c.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const gold = data.questions.map((q) => q.gold.map((g) => {
    const doc = data.docs.findIndex((d) => d.id === q.doc);
    let start = texts[doc].indexOf(g);
    if (start >= 0) return { doc, start, end: start + g.length, stale: false };
    const old = data.revisions.filter((r) => r.doc === q.doc).reduce((t, r) => t.replace(r.current, r.old), g);
    start = texts[doc].indexOf(old);
    return { doc, start, end: start + old.length, stale: true };
  }));
  return { key: indexKey(s, stale), chunks, df, avgdl: chunks.reduce((n, c) => n + c.terms.length, 0) / chunks.length, texts, gold };
}
const indexKey = (s: Settings, stale: boolean) => `${s.strategy}|${s.chunkSize}|${s.overlap}|${stale}`;

const idfOf = (ix: Index, t: string) => { const n = ix.df.get(t) ?? 0, N = ix.chunks.length; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); };

function bm25(ix: Index, q: string[]) {
  return ix.chunks.map((c, i) => {
    let s = 0;
    for (const t of new Set(q)) {
      let f = 0;
      for (const x of c.terms) if (x === t) f++;
      if (f) s += idfOf(ix, t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * c.terms.length / ix.avgdl));
    }
    return [i, s] as [number, number];
  }).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

/**
 * Offline stand-in for a cross-encoder, scoring each candidate against the query on three explainable signals:
 * sim = best single-sentence LSA cosine (a long chunk isn't diluted by its other sentences),
 * cov = share of the query's BM25 IDF mass the chunk contains, prox = matched terms / smallest window holding them.
 * It uses its own (unrotated) embedder, like a separate reranking model would.
 */
export function rerankScore(lsa: Lsa, ix: Index, q: string[], c: Chunk) {
  const qv = embed(lsa, q), body = c.text.slice(c.prefix.length);
  let sim = 0;
  for (const [a, b] of sentences(body, 0, body.length)) sim = Math.max(sim, dot(qv, embed(lsa, tokenize(c.prefix + body.slice(a, b), lsa.stop))));
  const qs = [...new Set(q)];
  const total = qs.reduce((n, t) => n + idfOf(ix, t), 0) || 1;
  const matched = qs.filter((t) => c.terms.includes(t));
  const cov = matched.reduce((n, t) => n + idfOf(ix, t), 0) / total;
  let prox = 0;
  if (matched.length >= 2) {
    const need = new Set(matched), seen = new Map<string, number>();
    let best = Infinity, lo = 0;
    for (let hi = 0; hi < c.terms.length; hi++) {
      const t = c.terms[hi];
      if (need.has(t)) seen.set(t, (seen.get(t) ?? 0) + 1);
      while (seen.size === need.size) {
        best = Math.min(best, hi - lo + 1);
        const u = c.terms[lo++];
        if (need.has(u)) { const n = seen.get(u)! - 1; if (n) seen.set(u, n); else seen.delete(u); }
      }
    }
    prox = Math.min(1, matched.length / best);
  }
  return { score: W_SIM * sim + W_COV * cov + W_PROX * prox, sim, cov, prox };
}
export const W_SIM = 0.5, W_COV = 0.35, W_PROX = 0.15;

/** Modelled per-stage latency (ms) for a hosted stack; ballpark figures, not measurements of this page. */
export function latencyOf(s: Settings, chunks: number, dim: number, promptTokens: number, outTokens: number): Latency {
  const vec = s.retrieval !== "bm25", lex = s.retrieval !== "vector";
  return {
    embed: vec ? 20 : 0, // one embedding API call for the query
    search: (vec ? 3 + chunks * dim * 2e-5 : 0) + (lex ? 2 + chunks * 4e-3 : 0) + (s.retrieval === "hybrid" ? 0.5 : 0),
    rerank: s.rerank ? 25 + 6 * s.topK : 0, // cross-encoder forward pass per candidate, batched
    prefill: 120 + 0.12 * promptTokens, // time to first token grows with prompt length
    decode: 12 * outTokens, // ~80 output tokens/s
  };
}

export function runQuery(st: RagState, cfg: Prices, query: string, qi?: number): Trace {
  const { lsa, index: ix, settings: s, data } = st as Required<{ [K in keyof RagState]: NonNullable<RagState[K]> }>;
  const q = tokenize(query, lsa.stop);
  const cands = new Map<number, Cand>();
  const get = (c: number) => cands.get(c) ?? cands.set(c, { c, inContext: false }).get(c)!;
  if (s.retrieval !== "bm25") {
    const qv = embed(lsa, q, st.mismatch);
    ix.chunks.map((c, i) => [i, dot(qv, c.vec)] as [number, number]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, POOL).forEach(([c, sc], r) => { get(c).vec = [r + 1, sc]; });
  }
  if (s.retrieval !== "vector") bm25(ix, q).slice(0, POOL).forEach(([c, sc], r) => { get(c).bm25 = [r + 1, sc]; });
  const score = (x: Cand) => s.retrieval === "vector" ? x.vec![1] : s.retrieval === "bm25" ? x.bm25![1] : (x.rrf = (x.vec ? 1 / (RRF_K + x.vec[0]) : 0) + (x.bm25 ? 1 / (RRF_K + x.bm25[0]) : 0));
  let top = [...cands.values()].filter((x) => (s.retrieval === "vector" ? x.vec : s.retrieval === "bm25" ? x.bm25 : true))
    .map((x) => [x, score(x)] as const).sort((a, b) => b[1] - a[1] || a[0].c - b[0].c).slice(0, s.topK).map(([x]) => x);
  if (s.rerank) {
    for (const x of top) x.rr = rerankScore(lsa, ix, q, ix.chunks[x.c]);
    top = top.map((x, i) => [x, i] as const).sort((a, b) => b[0].rr!.score - a[0].rr!.score || a[1] - b[1]).map(([x]) => x);
  }
  // Greedy packing in rank order: a chunk that doesn't fit is skipped, smaller ones further down may still fit.
  const context: number[] = [];
  let ctxTokens = 0;
  for (const x of top) {
    const t = ix.chunks[x.c].tokens + 4; // "[n] " citation marker
    if (ctxTokens + t <= s.budget) { context.push(x.c); ctxTokens += t; x.inContext = true; }
  }
  const promptTokens = tokens(SYSTEM) + ctxTokens + tokens(`QUESTION: ${query}`) + 4;
  const outTokens = qi === undefined ? 0 : tokens(data.questions[qi].answer);
  const cost = (promptTokens * cfg.priceIn + outTokens * cfg.priceOut) / 1000;
  const tr: Trace = { query, qi, cands: top, context, ctxTokens, promptTokens, outTokens, cost, latency: latencyOf(s, ix.chunks.length, lsa.dim, promptTokens, outTokens) };
  if (qi !== undefined) tr.reason = judge(ix, ix.gold[qi], context, top);
  return tr;
}

/** Hit = every gold passage lies inside the union of context chunks; otherwise say why it missed. */
function judge(ix: Index, gold: Index["gold"][number], context: number[], top: Cand[]): Reason {
  const iv = (cs: number[], doc: number) => cs.map((c) => ix.chunks[c]).filter((c) => c.doc === doc).map((c) => [c.start, c.end] as [number, number]).sort((a, b) => a[0] - b[0]);
  const covered = (cs: number[], g: Index["gold"][number][number]) => {
    let at = g.start;
    for (const [a, b] of iv(cs, g.doc)) if (a <= at && b > at) at = Math.max(at, b);
    return at >= g.end;
  };
  const overlaps = (cs: number[], g: Index["gold"][number][number]) => iv(cs, g.doc).some(([a, b]) => a < g.end && b > g.start);
  if (gold.every((g) => covered(context, g))) return gold.some((g) => g.stale) ? "stale" : "hit";
  if (gold.some((g) => g.stale && overlaps(context, g))) return "stale";
  if (gold.some((g) => overlaps(context, g))) return "split";
  if (gold.some((g) => overlaps(top.filter((x) => !x.inContext).map((x) => x.c), g))) return "budget";
  return "missed";
}

export function buildPrompt(st: RagState, tr: Trace) {
  const ix = st.index!;
  const src = tr.context.map((c, i) => `[${i + 1}] ${ix.chunks[c].label}\n${ix.chunks[c].text.trim()}`).join("\n\n");
  return `SYSTEM: ${SYSTEM}\n\nSOURCES:\n${src || "(none: nothing fitted the token budget)"}\n\nQUESTION: ${tr.query}`;
}

/** The generation step. Offline it returns the eval set's reference answer; a live model call plugs in here. */
export function generate(st: RagState, tr: Trace): { text: string; grounded: boolean } {
  if (tr.qi === undefined) return { text: "Offline mode: no reference answer exists for a custom question. The prompt above is exactly what would be sent to the model.", grounded: false };
  return { text: st.data!.questions[tr.qi].answer, grounded: tr.reason === "hit" };
}

function recompute(s: RagState): RagState {
  const cfg = s.prices;
  if (!s.data || !s.lsa) return s;
  if (s.index?.key !== indexKey(s.settings, s.stale)) s.index = buildIndex(s.data, s.lsa, s.settings, s.stale);
  s.traces = s.data.questions.map((q, i) => runQuery(s, cfg, q.q, i));
  if (s.custom) s.custom = runQuery(s, cfg, s.custom.query);
  return s;
}

export function summary(s: RagState) {
  const t = s.traces, n = t.length || 1, avg = (f: (x: Trace) => number) => t.reduce((a, x) => a + f(x), 0) / n;
  const lat = (k: keyof Latency) => avg((x) => x.latency[k]);
  return {
    hits: t.filter((x) => x.reason === "hit").length, n: t.length,
    hitRate: (100 * t.filter((x) => x.reason === "hit").length) / n,
    ctxAvg: avg((x) => x.ctxTokens), ctxMax: t.reduce((a, x) => Math.max(a, x.ctxTokens), 0),
    cost: avg((x) => x.cost), latency: { embed: lat("embed"), search: lat("search"), rerank: lat("rerank"), prefill: lat("prefill"), decode: lat("decode") },
    reasons: Object.fromEntries((["hit", "split", "budget", "stale", "missed"] as Reason[]).map((r) => [r, t.filter((x) => x.reason === r).length])) as Record<Reason, number>,
    chunks: s.index?.chunks.length ?? 0,
  };
}

const pick = (c: Settings): Settings => Object.fromEntries(SETTING_KEYS.map((k) => [k, c[k]])) as unknown as Settings;
const LIMITS: Record<string, [number, number]> = { chunkSize: [40, 1000], overlap: [0, 400], topK: [1, 20], budget: [100, 8000] };
function clean(patch: Partial<Settings>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(SETTING_KEYS as readonly string[]).includes(k)) continue;
    out[k] = LIMITS[k] ? Math.round(Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], Number(v) || 0))) : v;
  }
  return out as Partial<Settings>;
}

type Prices = Pick<RagConfig, "priceIn" | "priceOut">;

const RESULT: Record<Reason, string> = { hit: "HIT", split: "MISS · gold passage split across chunks", budget: "MISS · retrieved but cut by the token budget", stale: "MISS · context quotes an outdated policy", missed: "MISS · not retrieved" };
export const REASON_TEXT = RESULT;

export const ragModel: SimModel<RagConfig, RagState> = {
  init: (c) => ({ data: null, lsa: null, index: null, settings: pick(c), cfg: pick(c), stale: false, mismatch: false, prices: { priceIn: c.priceIn, priceOut: c.priceOut }, traces: [], custom: null, qi: 0, acc: 0 }),
  tick(s, ctx) {
    const c = ctx.config;
    const repriced = c.priceIn !== s.prices.priceIn || c.priceOut !== s.prices.priceOut;
    if (repriced) s.prices = { priceIn: c.priceIn, priceOut: c.priceOut };
    const changed = SETTING_KEYS.filter((k) => c[k] !== s.cfg[k]);
    // setConfig doesn't re-init: adopt Controls-panel edits key by key, leaving canvas edits to other keys alone.
    if (changed.length) {
      for (const k of changed) (s.settings as unknown as Record<string, unknown>)[k] = c[k];
      s.cfg = pick(c);
      recompute(s);
      if (s.data) { const m = summary(s); ctx.log("info", `Settings changed (${changed.join(", ")}): hit rate ${m.hits}/${m.n}, ${Math.round(m.ctxAvg)} context tokens`); }
    }
    else if (repriced) recompute(s);
    if (!s.traces.length) return s;
    s.acc += ctx.dt;
    if (s.acc >= c.stepSeconds * 1000) {
      s.acc = 0;
      s.qi = (s.qi + 1) % s.traces.length;
      const tr = s.traces[s.qi];
      ctx.log(tr.reason === "hit" ? "info" : "warn", `${s.data!.questions[s.qi].id.toUpperCase()} ${RESULT[tr.reason!]} · ${tr.ctxTokens} ctx tokens`);
    }
    return s;
  },
  actions: {
    load: (s, p) => {
      const { corpus, settings } = p as { corpus: Corpus; settings?: Partial<Settings> };
      return recompute({ ...s, data: corpus, lsa: decode(corpus), index: null, settings: { ...s.settings, ...clean(settings ?? {}) } });
    },
    set: (s, p) => {
      const { key, value } = p as { key: keyof Settings; value: unknown };
      return recompute({ ...s, settings: { ...s.settings, ...clean({ [key]: value }) } });
    },
    reset: (s) => recompute({ ...s, settings: { ...s.cfg } }),
    select: (s, p) => ({ ...s, qi: Math.max(0, Math.min(s.traces.length - 1, Number((p as { qi: number }).qi) || 0)), custom: null, acc: 0 }),
    ask: (s, p) => {
      const text = String((p as { text: string }).text ?? "").trim().slice(0, 300);
      return { ...s, custom: s.data && text ? runQuery(s, s.prices, text) : null };
    },
    reindex: (s) => recompute({ ...s, stale: false, mismatch: false }),
  },
  faults: [
    {
      id: "stale-index", label: "Stale index",
      description: "Three policies (leave carry-over, the Zone C per-diem, pension matching) changed after the last indexing run. The index still serves the old text.",
      apply: (s) => recompute({ ...s, stale: true }),
      revert: (s) => recompute({ ...s, stale: false }),
    },
    {
      id: "embed-mismatch", label: "Embedding model mismatch",
      description: "The query embedder was upgraded but the index was not re-embedded, so query and chunk vectors live in different spaces. Vector scores become noise; BM25 is unaffected.",
      apply: (s) => recompute({ ...s, mismatch: true }),
      revert: (s) => recompute({ ...s, mismatch: false }),
    },
  ],
  metrics(s): MetricSnapshot {
    if (!s.traces.length) return { loaded: 0 };
    const m = summary(s), l = m.latency;
    return {
      loaded: 1, hitRate: m.hitRate, hits: m.hits, ctxTokens: m.ctxAvg, ctxMax: m.ctxMax, cost: m.cost, chunks: m.chunks,
      latency: l.embed + l.search + l.rerank + l.prefill + l.decode, ttft: l.embed + l.search + l.rerank + l.prefill,
    };
  },
};
