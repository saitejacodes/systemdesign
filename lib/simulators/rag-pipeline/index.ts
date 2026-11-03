import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { ragModel, type RagConfig, type RagState } from "./model";
import { RagView } from "./view";

const hitTone = (v: number) => (v >= 90 ? "ok" : v >= 70 ? "hot" : "over");

export const definition: SimDefinition<RagConfig, RagState> = {
  model: ragModel,
  // A typical first attempt: big fixed chunks, vectors only, a short top-k. Lands at 13/20.
  defaultConfig: { strategy: "fixed", chunkSize: 300, overlap: 0, retrieval: "vector", topK: 4, rerank: false, budget: 1200, priceIn: 0.003, priceOut: 0.015, stepSeconds: 2 },
  controls: [
    { key: "strategy", label: "Chunking", type: "select", options: [{ value: "fixed", label: "Fixed size" }, { value: "sentence", label: "Sentence" }, { value: "heading", label: "Heading-aware" }] },
    { key: "chunkSize", label: "Chunk size", type: "number", min: 40, max: 1000, step: 10, unit: "tok", help: "Approximate tokens (characters ÷ 4)." },
    { key: "overlap", label: "Overlap", type: "number", min: 0, max: 400, step: 10, unit: "tok" },
    { key: "retrieval", label: "Retrieval", type: "select", options: [{ value: "vector", label: "Vector (LSA cosine)" }, { value: "bm25", label: "BM25" }, { value: "hybrid", label: "Hybrid (RRF)" }] },
    { key: "topK", label: "Top-k", type: "number", min: 1, max: 20, step: 1 },
    { key: "rerank", label: "Reranker", type: "toggle" },
    { key: "budget", label: "Context token budget", type: "number", min: 100, max: 8000, step: 100, unit: "tok" },
    { key: "priceIn", label: "Input price", type: "number", min: 0, max: 0.1, step: 0.0005, unit: "$/1k tok", help: "Enter your provider's price; used only for the cost estimate." },
    { key: "priceOut", label: "Output price", type: "number", min: 0, max: 0.2, step: 0.0005, unit: "$/1k tok" },
    { key: "stepSeconds", label: "Seconds per question", type: "number", min: 0.5, max: 6, step: 0.5, unit: "s", help: "How fast Play steps through the eval questions." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "A real pipeline, in your browser", body: "Every node runs: the handbook is chunked, embedded and indexed here, and each question is retrieved for real. Click a node (or use the stage buttons) to inspect it and change its settings." },
    { target: "canvas", title: "Watch a passage get split", body: "Open the Chunker. The chunk map draws every boundary over the question's gold passage. When a boundary cuts it, no chunk holds the whole answer." },
    { target: "canvas", title: "Two retrievers, one fusion", body: "The Retriever table shows each candidate's vector rank and BM25 rank. Questions with codes favour BM25, paraphrases favour vectors; hybrid fuses the ranks." },
    { target: "metrics", title: "The eval is the point", body: "Hit rate counts questions whose gold passage made it into the prompt. Context tokens drive cost and time to first token; both update on every change." },
    { target: "faults", title: "Break it", body: "Make the index stale or upgrade the query embedder without re-embedding, then use Re-index to recover." },
    { target: "challenges", title: "Tune it", body: "Reach 90% within 2,000 tokens, rescue fixed-size chunks with overlap, then hold 90% inside 800 tokens." },
  ],
  View: RagView,
  cards: [
    { key: "hitRate", label: "Retrieval hit rate", unit: "%", digits: 0, tone: hitTone },
    { key: "ctxTokens", label: "Context tokens (avg ≈)", digits: 0 },
    { key: "ctxMax", label: "Context tokens (max ≈)", digits: 0, tone: (v) => (v > 2000 ? "over" : undefined) },
    { key: "cost", label: "Est. cost / query", unit: "$", digits: 5 },
    { key: "ttft", label: "Time to first token (modelled)", unit: "ms", digits: 0 },
    { key: "latency", label: "Total latency (modelled)", unit: "ms", digits: 0 },
    { key: "chunks", label: "Chunks indexed", digits: 0 },
  ],
  charts: [
    { title: "Retrieval hit rate", unit: "%", keys: [{ key: "hitRate", label: "Hit rate", color: "var(--cobalt)" }] },
    { title: "Context tokens", keys: [{ key: "ctxTokens", label: "Average", color: "var(--phase-6)" }, { key: "ctxMax", label: "Max", color: "var(--status-hot)" }] },
  ],
  hud: (m) => (m.loaded ? [
    { k: "Hits", v: `${m.hits ?? 0}/20`, tone: hitTone(m.hitRate ?? 0) },
    { k: "Ctx", v: `≈${Math.round(m.ctxTokens ?? 0)} tok` },
  ] : [{ k: "Corpus", v: "loading" }]),
};
