import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import corpusJson from "./data/corpus.json";
import { challenges } from "./challenges";
import { definition } from "./index";
import { chunkDoc, embed, ragModel, runQuery, summary, tokenize, type Corpus, type RagConfig, type RagState } from "./model";

const corpus = corpusJson as unknown as Corpus;
const base = definition.defaultConfig;
const GOOD: Partial<RagConfig> = { strategy: "heading", chunkSize: 150, overlap: 30, retrieval: "hybrid", topK: 12, rerank: true, budget: 2000 };
const FIXED_GOOD: Partial<RagConfig> = { strategy: "fixed", chunkSize: 150, overlap: 40, retrieval: "hybrid", topK: 13, rerank: true, budget: 2000 };
const LEAN: Partial<RagConfig> = { strategy: "heading", chunkSize: 150, overlap: 0, retrieval: "vector", topK: 15, rerank: true, budget: 800 };

function sim(p: Partial<RagConfig> = {}, seed = 1) {
  const s = new Simulation<RagConfig, RagState>(ragModel, { ...base, ...p }, seed);
  s.act("load", { corpus });
  return s;
}
const check = (id: string, st: RagState) => challenges.find((c) => c.id === id)!.winCondition({} as never, st);

describe("text processing", () => {
  const stop = new Set(corpus.stop);
  it("tokenizes like build.py: every handbook token is in the LSA vocabulary", () => {
    const vocab = new Set(corpus.vocab);
    const missing = corpus.docs.flatMap((d) => tokenize(d.text, stop)).filter((t) => !vocab.has(t));
    expect(missing).toEqual([]);
    expect(tokenize("Policies for the Companies' laptops", stop)).toEqual(["policy", "company", "laptop"]);
  });
  it("embeddings are L2-normalised", () => {
    const st = sim().state;
    const v = embed(st.lsa!, tokenize("annual leave carry over", stop));
    expect(Math.hypot(...v)).toBeCloseTo(1, 5);
  });
  it("fixed chunks tile the document; overlap repeats text", () => {
    const d = corpus.docs[2];
    const c0 = chunkDoc(d.text, d.title, { strategy: "fixed", chunkSize: 100, overlap: 0 });
    for (let i = 1; i < c0.length; i++) expect(d.text.slice(c0[i - 1].b, c0[i].a).trim()).toBe("");
    const c1 = chunkDoc(d.text, d.title, { strategy: "fixed", chunkSize: 100, overlap: 40 });
    expect(c1.length).toBeGreaterThan(c0.length);
    expect(c1[1].a).toBeLessThan(c1[0].b);
  });
  it("heading chunks never cross a section and carry the heading path", () => {
    const d = corpus.docs[2];
    for (const c of chunkDoc(d.text, d.title, { strategy: "heading", chunkSize: 80, overlap: 0 })) {
      expect(d.text.slice(c.a, c.b)).not.toMatch(/^## /m);
      expect(c.prefix).toMatch(/^Leave and Time Off › /);
    }
  });
});

describe("retrieval", () => {
  it("BM25 finds an exact form code; hybrid scores are reciprocal-rank fusion with k = 60", () => {
    const st = sim({ strategy: "heading", chunkSize: 150, retrieval: "hybrid", topK: 5 }).state;
    const tr = runQuery(st, st.prices, "Which form is HR-114?");
    expect(st.index!.chunks[tr.cands[0].c].text).toContain("HR-114");
    for (const x of tr.cands) expect(x.rrf).toBeCloseTo((x.vec ? 1 / (60 + x.vec[0]) : 0) + (x.bm25 ? 1 / (60 + x.bm25[0]) : 0), 10);
  });
  it("vectors catch a paraphrase that BM25 ranks far down", () => {
    const rank = (retrieval: "vector" | "bm25") => {
      const st = sim({ strategy: "heading", chunkSize: 150, overlap: 30, retrieval, topK: 20 }).state, g = st.index!.gold[0][0];
      return st.traces[0].cands.findIndex((x) => { const c = st.index!.chunks[x.c]; return c.doc === g.doc && c.start <= g.start && c.end >= g.end; }) + 1;
    };
    expect(rank("vector")).toBeLessThanOrEqual(3);
    expect(rank("bm25") === 0 || rank("bm25") > 10).toBe(true);
  });
  it("the assembler never exceeds the token budget and the prompt is priced", () => {
    const st = sim({ ...GOOD, budget: 700 }).state;
    for (const t of st.traces) { expect(t.ctxTokens).toBeLessThanOrEqual(700); expect(t.cost).toBeGreaterThan(0); }
  });
  it("is deterministic and seed-independent", () => {
    expect(summary(sim(GOOD, 1).state)).toEqual(summary(sim(GOOD, 99).state));
  });
});

describe("eval and challenges", () => {
  it("defaults land well below 90% and fail every challenge", () => {
    const st = sim().state;
    expect(summary(st).hits).toBe(13);
    expect(summary(st).reasons.split).toBeGreaterThan(0);
    for (const c of challenges) expect(check(c.id, st).passed).toBe(false);
  });
  it("hit-90-2k: a thoughtful setup passes; tight top-k or a 3,000-token cap fail", () => {
    expect(check("hit-90-2k", sim(GOOD).state).passed).toBe(true);
    expect(check("hit-90-2k", sim({ ...GOOD, topK: 4 }).state).passed).toBe(false);
    expect(check("hit-90-2k", sim({ ...GOOD, strategy: "fixed", chunkSize: 300, overlap: 80, topK: 10, budget: 3000 }).state).passed).toBe(false);
  });
  it("fixed-split: overlap rescues the split answers; no overlap or another chunker fails", () => {
    expect(check("fixed-split", sim(FIXED_GOOD).state).passed).toBe(true);
    const noOverlap = sim({ ...FIXED_GOOD, overlap: 0 }).state;
    expect(summary(noOverlap).reasons.split).toBeGreaterThan(0);
    expect(check("fixed-split", noOverlap).passed).toBe(false);
    expect(check("fixed-split", sim(GOOD).state).passed).toBe(false);
  });
  it("lean-context: with vectors, 18/20 under 800 tokens needs the reranker", () => {
    expect(check("lean-context", sim(LEAN).state).passed).toBe(true);
    const off = sim({ ...LEAN, rerank: false }).state;
    expect(check("lean-context", off).passed).toBe(false);
    expect(summary(off).reasons.budget).toBeGreaterThan(0);
  });
  it("a challenge run finishes as soon as the corpus is evaluated", () => {
    const c = challenges[0], s = new Simulation<RagConfig, RagState>(ragModel, { ...base, ...GOOD }, 1);
    expect(c.done!(s.state)).toBe(false);
    expect(c.winCondition({} as never, s.state).passed).toBe(false);
    s.act("load", { corpus });
    expect(c.done!(s.state)).toBe(true);
  });
});

describe("faults, actions and ticks", () => {
  it("a stale index turns updated-policy questions into stale misses until re-indexed", () => {
    const s = sim(GOOD);
    const before = summary(s.state).hits;
    s.toggleFault("stale-index");
    expect(summary(s.state).reasons.stale).toBe(3);
    expect(["q01", "q03", "q19"].map((id) => s.state.traces[corpus.questions.findIndex((q) => q.id === id)].reason)).toEqual(["stale", "stale", "stale"]);
    s.act("reindex");
    expect(summary(s.state).hits).toBe(before);
  });
  it("an embedding-model mismatch wrecks vector retrieval but not BM25", () => {
    const v = sim({ ...GOOD, retrieval: "vector", rerank: false }), b = sim({ ...GOOD, retrieval: "bm25", rerank: false });
    const hv = summary(v.state).hits, hb = summary(b.state).hits;
    v.toggleFault("embed-mismatch"); b.toggleFault("embed-mismatch");
    expect(summary(v.state).hits).toBeLessThan(hv - 6);
    expect(summary(b.state).hits).toBe(hb);
  });
  it("canvas edits return a new state and re-run the eval; reset restores the Controls values", () => {
    const s = sim(), before = s.state;
    s.act("set", { key: "chunkSize", value: 5000 });
    expect(s.state).not.toBe(before);
    expect(s.state.settings.chunkSize).toBe(1000);
    s.act("set", { key: "strategy", value: "heading" });
    expect(s.state.index!.chunks.every((c) => c.prefix)).toBe(true);
    s.act("reset");
    expect(s.state.settings).toEqual(s.state.cfg);
  });
  it("tick adopts Controls-panel changes and steps through the questions", () => {
    const s = sim();
    s.runFor(base.stepSeconds * 1000 + 100);
    expect(s.state.qi).toBe(1);
    s.setConfig({ ...GOOD });
    s.step();
    expect(s.state.settings.strategy).toBe("heading");
    expect(summary(s.state).hits).toBeGreaterThanOrEqual(18);
    expect(s.log.entries().some((e) => e.message.startsWith("Settings changed"))).toBe(true);
  });
  it("custom questions run retrieval but have no reference answer", () => {
    const s = sim(GOOD);
    s.act("ask", { text: "Can I bring a visitor to the factory floor?" });
    expect(s.state.custom!.reason).toBeUndefined();
    expect(s.state.index!.chunks[s.state.custom!.context[0]].label).toMatch(/Facilities/);
  });
});
