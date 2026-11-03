"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import type { ViewProps } from "@/lib/sim/definition";
import { REASON_TEXT, SETTING_KEYS, buildPrompt, generate, summary, tokenize, type Corpus, type RagConfig, type RagState, type Settings, type Trace } from "./model";

// Loaded on first view so the 170 KB corpus never ships in the main bundle; cached for later resets.
let CORPUS: Corpus | null = null;
const loadCorpus = () => import("./data/corpus.json").then((m) => (CORPUS = m.default as unknown as Corpus));

type Act = ViewProps<RagConfig, RagState>["act"];
type StageId = "source" | "chunker" | "embedder" | "index" | "retriever" | "reranker" | "assembler" | "llm" | "answer";
const STAGES: { id: StageId; label: string; col: number; row: number; in?: Position; out?: Position }[] = [
  { id: "source", label: "Source docs", col: 0, row: 0, out: Position.Right },
  { id: "chunker", label: "Chunker", col: 1, row: 0, in: Position.Left, out: Position.Right },
  { id: "embedder", label: "Embedder", col: 2, row: 0, in: Position.Left, out: Position.Bottom },
  { id: "index", label: "Index", col: 2, row: 1, in: Position.Top, out: Position.Left },
  { id: "retriever", label: "Retriever", col: 1, row: 1, in: Position.Right, out: Position.Left },
  { id: "reranker", label: "Reranker", col: 0, row: 1, in: Position.Right, out: Position.Bottom },
  { id: "assembler", label: "Prompt assembler", col: 0, row: 2, in: Position.Top, out: Position.Right },
  { id: "llm", label: "LLM", col: 1, row: 2, in: Position.Left, out: Position.Right },
  { id: "answer", label: "Answer", col: 2, row: 2, in: Position.Left },
];
const OK = "var(--status-ok)", HOT = "var(--status-hot)", OVER = "var(--status-over)";
const toneOf = (r?: string) => (r === "hit" ? OK : r === "budget" || r === "split" ? HOT : OVER);

interface StageData extends Record<string, unknown> { label: string; lines: string[]; off: boolean; on: boolean; in?: Position; out?: Position; tone?: string }
function StageNode({ data }: NodeProps<Node<StageData>>) {
  return (
    <div className="w-[180px] border bg-surface px-2 py-1.5 font-mono text-[11px] leading-snug" style={{ borderRadius: 2, borderColor: data.on ? "var(--cobalt)" : "var(--ink)", borderWidth: data.on ? 2 : 1, opacity: data.off ? 0.45 : 1, boxShadow: data.on ? "3px 3px 0 var(--cobalt)" : undefined }}>
      {data.in && <Handle type="target" position={data.in} isConnectable={false} />}
      <div className="flex items-center justify-between gap-1 font-semibold uppercase tracking-wider">
        <span>{data.label}</span>
        {data.tone && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: data.tone }} />}
      </div>
      {data.lines.map((l, i) => <div key={i} className="truncate text-ink-muted">{l}</div>)}
      {data.out && <Handle type="source" position={data.out} isConnectable={false} />}
    </div>
  );
}
const nodeTypes = { stage: StageNode };

export function RagView({ state, config, act, reducedMotion }: ViewProps<RagConfig, RagState>) {
  const [sel, setSel] = useState<StageId>("chunker");
  // Canvas edits live in state; remember them so they survive a Reset or challenge start (which re-runs init).
  const overrides = useRef<Partial<Settings>>({});
  useEffect(() => {
    if (state.data) overrides.current = Object.fromEntries(SETTING_KEYS.filter((k) => state.settings[k] !== config[k]).map((k) => [k, state.settings[k]]));
  }, [state.data, state.settings, config]);
  useEffect(() => {
    if (state.data) return;
    let live = true;
    (CORPUS ? Promise.resolve(CORPUS) : loadCorpus()).then((c) => { if (live) act("load", { corpus: c, settings: overrides.current }); });
    return () => { live = false; };
  }, [state.data, act]);

  const tr: Trace | undefined = state.custom ?? state.traces[state.qi];
  const s = state.settings;
  const m = state.traces.length ? summary(state) : null;
  const ix = state.index;

  const { nodes, edges } = useMemo(() => {
    const lines: Record<StageId, string[]> = {
      source: state.data ? [`${state.data.docs.length} policies · ${state.data.stats.words.toLocaleString()} words`, state.stale ? "⚠ index is stale" : "index up to date"] : ["loading corpus…"],
      chunker: [`${s.strategy} · ${s.chunkSize} tok`, `overlap ${s.overlap} → ${ix?.chunks.length ?? "…"} chunks`],
      embedder: s.retrieval === "bm25" ? ["not used (BM25 only)"] : [`LSA · ${state.data?.dim ?? 32}-d`, state.mismatch ? "⚠ query model ≠ index" : "TF-IDF × word vectors"],
      index: [`${ix?.chunks.length ?? 0} vectors`, `BM25 · ${ix?.df.size ?? 0} terms`],
      retriever: [`${s.retrieval === "hybrid" ? "hybrid (RRF k=60)" : s.retrieval}`, `top-k ${s.topK}`],
      reranker: s.rerank ? ["on · sim+coverage+proximity", `reorders ${s.topK}`] : ["off (keeps retrieval order)"],
      assembler: [`budget ${s.budget} tok`, tr ? `${tr.context.length} chunks · ${tr.ctxTokens} tok` : "…"],
      llm: tr ? [`prompt ≈ ${tr.promptTokens} tok`, `$${tr.cost.toFixed(5)} · ${Math.round(sumLat(tr))} ms`] : ["…"],
      answer: tr?.reason ? [tr.reason === "hit" ? "grounded: gold in context" : REASON_TEXT[tr.reason].replace("MISS · ", "miss: ")] : [tr ? "custom question" : "…"],
    };
    const nodes: Node<StageData>[] = STAGES.map((x) => ({
      id: x.id, type: "stage", position: { x: x.col * 220, y: x.row * 110 }, selected: sel === x.id, ariaLabel: `${x.label}: ${lines[x.id].join(", ")}`,
      data: { label: x.label, lines: lines[x.id], in: x.in, out: x.out, on: sel === x.id, off: (x.id === "embedder" && s.retrieval === "bm25") || (x.id === "reranker" && !s.rerank), tone: x.id === "answer" && tr?.reason ? toneOf(tr.reason) : undefined },
    }));
    const edges: Edge[] = STAGES.slice(1).map((x, i) => ({ id: `e${i}`, source: STAGES[i].id, target: x.id, animated: !reducedMotion, style: { stroke: "var(--ink)" } }));
    return { nodes, edges };
  }, [state.data, state.stale, state.mismatch, s, ix, tr, sel, reducedMotion]);

  return (
    <div className="grid gap-3 p-3 text-[14px] [&>*]:min-w-0">
      <div className="h-[360px] w-full border border-line bg-surface-sunk" style={{ borderRadius: 2 }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08 }} nodesDraggable={false} nodesConnectable={false}
          panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false} proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => setSel(n.id as StageId)} onSelectionChange={({ nodes: ns }) => ns[0] && setSel(ns[0].id as StageId)} />
      </div>
      <div role="tablist" aria-label="Pipeline stage" className="flex flex-wrap gap-1">
        {STAGES.map((x) => <button key={x.id} type="button" role="tab" aria-selected={sel === x.id} className={`fm-btn fm-btn--tool !h-7 !px-2 !text-[12px] ${sel === x.id ? "is-on" : ""}`} onClick={() => setSel(x.id)}>{x.label}</button>)}
      </div>

      {!state.data || !ix || !tr ? <p className="fm-cap">Loading the handbook corpus and building the index…</p> : (
        <>
          <QuestionBar state={state} tr={tr} act={act} />
          <section aria-label={`${STAGES.find((x) => x.id === sel)!.label} details`} className="fm-card grid gap-2 p-3">
            <Inspector sel={sel} state={state} tr={tr} act={act} />
          </section>
          {m && <EvalTable state={state} act={act} m={m} />}
        </>
      )}
    </div>
  );
}

const sumLat = (t: Trace) => t.latency.embed + t.latency.search + t.latency.rerank + t.latency.prefill + t.latency.decode;

function QuestionBar({ state, tr, act }: { state: RagState; tr: Trace; act: Act }) {
  const [text, setText] = useState("");
  const q = tr.qi !== undefined ? state.data!.questions[tr.qi] : undefined;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="fm-cap">Question</span>
          <select className="fm-input !h-8 !w-auto max-w-full" value={state.custom ? "" : state.qi} onChange={(e) => act("select", { qi: Number(e.target.value) })}>
            {state.custom && <option value="">Custom question</option>}
            {state.data!.questions.map((x, i) => <option key={x.id} value={i}>{x.id.toUpperCase()} · {x.q}</option>)}
          </select>
        </label>
        {(state.stale || state.mismatch) && <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("reindex")}>Re-index now</button>}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act("ask", { text }); }}>
        <input className="fm-input !h-8 min-w-0 flex-1" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Or ask your own question about the handbook" aria-label="Custom question" />
        <button type="submit" className="fm-btn fm-btn--tool !h-8">Retrieve</button>
      </form>
      <p>
        <span className="fm-cap">{q ? `${q.id.toUpperCase()} · stresses ${q.kind === "split" ? "chunk boundaries" : q.kind === "lexical" ? "exact terms (BM25)" : "paraphrase (vectors)"}` : "Custom question"} · </span>
        {tr.query}
        {tr.reason && <strong className="ml-2 font-mono text-[12px]" style={{ color: toneOf(tr.reason) }}>{REASON_TEXT[tr.reason]}</strong>}
      </p>
    </div>
  );
}

function Num({ label, k, state, act, min, max, step, unit }: { label: string; k: "chunkSize" | "overlap" | "topK" | "budget"; state: RagState; act: Act; min: number; max: number; step: number; unit?: string }) {
  const v = state.settings[k];
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="fm-cap w-28">{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => act("set", { key: k, value: Number(e.target.value) })} aria-label={label} className="w-40" />
      <input type="number" min={min} max={max} step={step} value={v} onChange={(e) => act("set", { key: k, value: Number(e.target.value) })} aria-label={`${label} value`} className="fm-input !h-8 !w-20" />
      {unit && <span className="fm-cap">{unit}</span>}
    </label>
  );
}

function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { v: T; l: string }[]; onPick(v: T): void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="fm-cap w-28">{label}</span>
      {options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} className={`fm-btn fm-btn--tool !h-7 !px-2 !text-[12px] ${value === o.v ? "is-on" : ""}`} onClick={() => onPick(o.v)}>{o.l}</button>)}
    </div>
  );
}

function Inspector({ sel, state, tr, act }: { sel: StageId; state: RagState; tr: Trace; act: Act }) {
  const ix = state.index!, s = state.settings, data = state.data!;
  const chunk = (c: number) => ix.chunks[c];
  const reset = <button type="button" className="fm-btn fm-btn--tool !h-7 !px-2 !text-[12px] justify-self-start" onClick={() => act("reset")}>Use Controls-panel values</button>;
  switch (sel) {
    case "source":
      return (
        <>
          <p>The bundled corpus is the <em>Brindlewood Instruments</em> employee handbook: {data.docs.length} fictional policy documents, {data.stats.words.toLocaleString()} words, ≈ {Math.round(data.docs.reduce((n, d) => n + d.text.length, 0) / 4).toLocaleString()} tokens. Headings are Markdown (<code>#</code>, <code>##</code>).</p>
          {state.stale && <p style={{ color: HOT }}>STALE · Leave, Travel and Pay policies were edited after the last indexing run; the index still holds the old sentences. Re-index to pick up the change.</p>}
          <ul className="grid gap-0.5 font-mono text-[12px] sm:grid-cols-2">{data.docs.map((d, i) => <li key={d.id}>{String(i + 1).padStart(2, "0")} · {d.title} · {ix.chunks.filter((c) => c.doc === i).length} chunks</li>)}</ul>
        </>
      );
    case "chunker":
      return (
        <>
          <Seg label="Strategy" value={s.strategy} options={[{ v: "fixed", l: "Fixed size" }, { v: "sentence", l: "Sentence" }, { v: "heading", l: "Heading-aware" }]} onPick={(v) => act("set", { key: "strategy", value: v })} />
          <Num label="Chunk size" k="chunkSize" state={state} act={act} min={40} max={1000} step={10} unit="≈ tokens" />
          <Num label="Overlap" k="overlap" state={state} act={act} min={0} max={400} step={10} unit="≈ tokens" />
          {reset}
          <p className="text-ink-muted">{s.strategy === "fixed" ? "Fixed: cut every chunk-size tokens (snapped to a space), ignoring sentences and headings." : s.strategy === "sentence" ? "Sentence: pack whole sentences up to the chunk size; overlap repeats trailing sentences." : "Heading-aware: never cross a ## section, and prepend 'Policy › Section' to every chunk so it carries its context."} {ix.chunks.length} chunks, mean ≈ {Math.round(ix.chunks.reduce((n, c) => n + c.tokens, 0) / ix.chunks.length)} tokens.</p>
          {tr.qi !== undefined && <ChunkMap state={state} tr={tr} />}
        </>
      );
    case "embedder": {
      const q = tokenize(tr.query, state.lsa!.stop), known = q.filter((t) => state.lsa!.ix.has(t));
      return (
        <>
          <p>Each chunk and query becomes a {data.dim}-dimension vector: the TF-IDF-weighted sum of its words&apos; LSA vectors, L2-normalised. The word vectors were computed at build time by a truncated SVD of the handbook&apos;s TF-IDF matrix ({data.stats.paragraphs} paragraphs, {data.vocab.length} terms; {data.dim} dimensions keep {Math.round(data.stats.explained * 100)}% of the variance). This is LSA, not a neural model: words count as similar when they occur in the same paragraphs.</p>
          <p className="font-mono text-[12px]">Query terms after stop-words and plural folding: {q.map((t) => <span key={t} className="mr-1" style={{ textDecoration: known.includes(t) ? undefined : "line-through" }}>{t}</span>)}{q.length > known.length && <span className="text-ink-muted"> (struck: not in the vocabulary, ignored)</span>}</p>
          {state.mismatch && <p style={{ color: OVER }}>MISMATCH · Queries are embedded by a newer model than the index. Cosine scores between the two spaces are noise. Re-index (re-embed every chunk) to fix it.</p>}
        </>
      );
    }
    case "index":
      return <p>Two indexes over the same {ix.chunks.length} chunks: a vector index (exact brute-force cosine over L2-normalised vectors, so cosine = dot product) and a BM25 inverted index ({ix.df.size} distinct terms, mean chunk length {ix.avgdl.toFixed(1)} terms, k1 = 1.2, b = 0.75). Changing the chunker rebuilds both, which is why re-chunking a real corpus means re-embedding all of it.</p>;
    case "retriever":
      return (
        <>
          <Seg label="Retrieval" value={s.retrieval} options={[{ v: "vector", l: "Vector" }, { v: "bm25", l: "BM25" }, { v: "hybrid", l: "Hybrid (RRF)" }]} onPick={(v) => act("set", { key: "retrieval", value: v })} />
          <Num label="Top-k" k="topK" state={state} act={act} min={1} max={20} step={1} />
          <p className="text-ink-muted">Hybrid fuses the two ranked lists with reciprocal rank fusion: score = Σ 1 / (60 + rank). It uses ranks only, so BM25 scores and cosines never need to be put on one scale.</p>
          <CandTable state={state} tr={tr} cols="retrieval" />
        </>
      );
    case "reranker":
      return (
        <>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.rerank} onChange={(e) => act("set", { key: "rerank", value: e.target.checked })} /><span>Rerank the top-{s.topK} candidates</span></label>
          <p className="text-ink-muted">An offline, explainable stand-in for a cross-encoder. Score = 0.5 × sim (best single-sentence cosine, so one relevant sentence in a long chunk isn&apos;t diluted) + 0.35 × coverage (share of the query&apos;s IDF weight present) + 0.15 × proximity (matched terms ÷ smallest window holding them). It only reorders candidates; it can&apos;t recover a chunk the retriever never returned.</p>
          {s.rerank ? <CandTable state={state} tr={tr} cols="rerank" /> : <p className="fm-cap">Off: the assembler packs chunks in retrieval order.</p>}
        </>
      );
    case "assembler":
      return (
        <>
          <Num label="Token budget" k="budget" state={state} act={act} min={100} max={8000} step={100} unit="≈ tokens" />
          <Budget tr={tr} budget={s.budget} />
          <ol className="grid gap-1 font-mono text-[12px]">
            {tr.cands.map((x, i) => (
              <li key={x.c} className="flex flex-wrap justify-between gap-2 border-b border-line py-0.5" style={{ opacity: x.inContext ? 1 : 0.55 }}>
                <span>{i + 1}. {chunk(x.c).label}</span>
                <span>{chunk(x.c).tokens} tok · {x.inContext ? `[${tr.context.indexOf(x.c) + 1}] packed` : "skipped: doesn't fit"}</span>
              </li>
            ))}
          </ol>
          <p className="fm-cap">Greedy packing in rank order; token counts are characters ÷ 4 (an approximation, not a real tokenizer).</p>
        </>
      );
    case "llm":
      return (
        <>
          <p className="fm-cap">Assembled prompt · ≈ {tr.promptTokens} tokens · this is exactly what would be sent</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap border border-line bg-surface-sunk p-2 font-mono text-[11px]" style={{ borderRadius: 2 }}>{buildPrompt(state, tr)}</pre>
          <Latency tr={tr} />
          <p className="fm-cap">Cost ≈ ${tr.cost.toFixed(5)} per query ({tr.promptTokens} in × price in + {tr.outTokens} out × price out, per 1k tokens; set prices in Controls)</p>
        </>
      );
    case "answer": {
      const g = generate(state, tr), q = tr.qi !== undefined ? data.questions[tr.qi] : undefined;
      return (
        <>
          <p className="fm-cap">Offline mode · reference answer from the eval set</p>
          <p>{g.text}</p>
          {q && <p style={{ color: g.grounded ? OK : OVER }}>{g.grounded ? "GROUNDED · the gold passage is in the context, so a model could give and cite this answer." : `NOT GROUNDED · ${REASON_TEXT[tr.reason!].replace("MISS · ", "")}. A real model would have to say it doesn't know, or would guess.`}</p>}
          {q && <blockquote className="border-l-2 border-ink pl-2 text-ink-muted"><span className="fm-cap">Gold passage · {ix.chunks.find((c) => c.doc === ix.gold[tr.qi!][0].doc)?.label.split(" › ")[0]}</span><br />{q.gold.join(" … ")}</blockquote>}
        </>
      );
    }
  }
}

function CandTable({ state, tr, cols }: { state: RagState; tr: Trace; cols: "retrieval" | "rerank" }) {
  const ix = state.index!, gold = tr.qi !== undefined ? ix.gold[tr.qi] : [];
  const isGold = (c: number) => gold.some((g) => ix.chunks[c].doc === g.doc && ix.chunks[c].start < g.end && ix.chunks[c].end > g.start);
  const head = cols === "retrieval" ? ["#", "Chunk", "Vector", "BM25", "RRF"] : ["#", "Chunk", "sim", "cov", "prox", "score"];
  return (
    <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
      <table className="w-full font-mono text-[11px]">
        <thead><tr>{head.map((h) => <th key={h} className="whitespace-nowrap border-b border-ink px-1.5 py-1 text-left">{h}</th>)}</tr></thead>
        <tbody>
          {tr.cands.map((x, i) => (
            <tr key={x.c} style={{ background: isGold(x.c) ? "color-mix(in srgb, var(--status-ok) 14%, transparent)" : undefined }}>
              <td className="border-b border-line px-1.5 py-0.5">{i + 1}</td>
              <td className="max-w-[260px] truncate border-b border-line px-1.5 py-0.5" title={ix.chunks[x.c].text}>{isGold(x.c) ? "★ " : ""}{ix.chunks[x.c].label}</td>
              {cols === "retrieval" ? (
                <>
                  <td className="whitespace-nowrap border-b border-line px-1.5 py-0.5">{x.vec ? `#${x.vec[0]} · ${x.vec[1].toFixed(3)}` : "—"}</td>
                  <td className="whitespace-nowrap border-b border-line px-1.5 py-0.5">{x.bm25 ? `#${x.bm25[0]} · ${x.bm25[1].toFixed(2)}` : "—"}</td>
                  <td className="whitespace-nowrap border-b border-line px-1.5 py-0.5">{x.rrf ? x.rrf.toFixed(4) : "—"}</td>
                </>
              ) : (
                ["sim", "cov", "prox", "score"].map((k) => <td key={k} className="border-b border-line px-1.5 py-0.5">{x.rr ? x.rr[k as "sim"].toFixed(2) : "—"}</td>)
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {gold.length > 0 && <p className="fm-cap px-1.5 py-1">★ overlaps the gold passage · {tr.cands.some((x) => isGold(x.c)) ? "" : "no candidate touches it: a retrieval miss"}</p>}
    </div>
  );
}

/** The gold passage with every chunk boundary drawn on it: shows a split before the metrics do. */
function ChunkMap({ state, tr }: { state: RagState; tr: Trace }) {
  const ix = state.index!, g = ix.gold[tr.qi!][0], text = ix.texts[g.doc];
  const from = Math.max(0, g.start - 160), to = Math.min(text.length, g.end + 160);
  const cuts = new Set<number>();
  for (const c of ix.chunks) if (c.doc === g.doc) for (const p of [c.start, c.end]) if (p > from && p < to) cuts.add(p);
  const marks = [from, ...[...cuts].sort((a, b) => a - b), to];
  const inside = ix.chunks.some((c) => c.doc === g.doc && c.start <= g.start && c.end >= g.end);
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">Chunk boundaries (┃) around the gold passage (highlighted) · {inside ? "it lies whole inside at least one chunk" : <span style={{ color: HOT }}>SPLIT: no single chunk holds all of it</span>}</figcaption>
      <p className="max-h-48 overflow-auto whitespace-pre-wrap border border-line bg-surface-sunk p-2 font-mono text-[11px]" style={{ borderRadius: 2 }}>
        {from > 0 && "…"}
        {marks.slice(0, -1).map((a, i) => {
          const b = marks[i + 1];
          return (
            <span key={a}>
              {i > 0 && <b style={{ color: "var(--cobalt)" }}>┃</b>}
              {[[a, Math.min(b, Math.max(a, g.start))], [Math.max(a, g.start), Math.min(b, g.end)], [Math.max(a, Math.min(b, g.end)), b]].map(([x, y], j) => (y > x ? <span key={j} style={j === 1 ? { background: "color-mix(in srgb, var(--status-ok) 22%, transparent)" } : undefined}>{text.slice(x, y)}</span> : null))}
            </span>
          );
        })}
        {to < text.length && "…"}
      </p>
    </figure>
  );
}

function Budget({ tr, budget }: { tr: Trace; budget: number }) {
  const pct = Math.min(100, (100 * tr.ctxTokens) / budget);
  return (
    <div className="grid gap-1">
      <div className="h-3 w-full border border-ink" style={{ borderRadius: 2 }} role="img" aria-label={`${tr.ctxTokens} of ${budget} tokens used`}>
        <div className="h-full" style={{ width: `${pct}%`, background: "var(--cobalt)" }} />
      </div>
      <span className="fm-cap">{tr.ctxTokens} / {budget} context tokens · {tr.context.length} of {tr.cands.length} candidates packed</span>
    </div>
  );
}

function Latency({ tr }: { tr: Trace }) {
  const l = tr.latency, total = sumLat(tr);
  const parts: [string, number, string][] = [["Embed query", l.embed, "var(--phase-1)"], ["Search", l.search, "var(--phase-2)"], ["Rerank", l.rerank, "var(--phase-4)"], ["Prefill (TTFT)", l.prefill, "var(--cobalt)"], ["Decode", l.decode, "var(--phase-3)"]];
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">Latency breakdown · modelled estimates for a hosted stack, not measured · ≈ {Math.round(total)} ms</figcaption>
      <div className="flex h-4 w-full overflow-hidden border border-ink" style={{ borderRadius: 2 }}>
        {parts.map(([k, v, c]) => (v > 0 ? <div key={k} title={`${k}: ${Math.round(v)} ms`} style={{ width: `${(100 * v) / total}%`, background: c }} /> : null))}
      </div>
      <ul className="flex flex-wrap gap-x-3 font-mono text-[11px]">{parts.map(([k, v, c]) => <li key={k}><span aria-hidden style={{ color: c }}>■ </span>{k} {Math.round(v)} ms</li>)}</ul>
    </figure>
  );
}

function EvalTable({ state, act, m }: { state: RagState; act: Act; m: ReturnType<typeof summary> }) {
  return (
    <section aria-label="Evaluation" className="grid gap-1">
      <h3 className="fm-cap !text-ink">Eval · 20 questions · hit = gold passage inside the assembled context · {m.hits}/20 ({Math.round(m.hitRate)}%) · {m.reasons.split} split · {m.reasons.budget} budget · {m.reasons.missed} not retrieved{m.reasons.stale ? ` · ${m.reasons.stale} stale` : ""}</h3>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-10">
        {state.traces.map((t, i) => (
          <button key={i} type="button" onClick={() => act("select", { qi: i })} aria-pressed={!state.custom && state.qi === i} aria-label={`${state.data!.questions[i].id}: ${REASON_TEXT[t.reason!]}`}
            className={`fm-btn fm-btn--tool !h-8 !px-1 !text-[11px] ${!state.custom && state.qi === i ? "is-on" : ""}`} style={{ borderLeft: `4px solid ${toneOf(t.reason)}` }}>
            Q{i + 1} {t.reason === "hit" ? "HIT" : "MISS"}
          </button>
        ))}
      </div>
    </section>
  );
}
