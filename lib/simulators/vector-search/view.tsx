"use client";
import { Fragment, useEffect, useMemo } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { FILTERS, K, TICK_BUDGET, answer, benchQueries, decodeCorpus, isBuilt, layerSizes, matches, type Corpus, type Query, type RawCorpus, type VsConfig, type VsState } from "./model";

const COLORS = ["var(--phase-1)", "var(--phase-2)", "var(--phase-3)", "var(--phase-4)", "var(--phase-5)", "var(--phase-6)", "var(--phase-7)", "var(--ink-muted)"];
const W = 400, PAD = 14;
const px = (v: number) => PAD + ((v + 1) / 2) * (W - 2 * PAD);
const py = (v: number) => W - px(v);

// The 380 KB corpus is its own chunk, fetched once per page and reused after every Reset.
let pending: Promise<Corpus> | null = null;
const loadCorpus = () => (pending ??= import("./data/corpus.json").then((m) => decodeCorpus(m.default as RawCorpus)));

const pct = (x: number) => `${x.toFixed(1)}%`;
const tone = (ok: boolean) => (ok ? "var(--status-ok)" : "var(--status-over)");

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="grid gap-0.5 font-mono text-[11px]">
      <div className="flex justify-between"><span>{label}</span><span>{value}/{max}</span></div>
      <div className="h-1.5 border border-ink" style={{ borderRadius: 2 }} role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemax={max}>
        <div className="h-full" style={{ width: `${(value / max) * 100}%`, background: "var(--cobalt)" }} />
      </div>
    </div>
  );
}

export function VsView({ state: s, config: c, act }: ViewProps<VsConfig, VsState>) {
  const corpus = s.corpus;
  useEffect(() => {
    if (corpus) return;
    let live = true; // act changes every render: only the latest effect may dispatch the load
    loadCorpus().then((d) => live && act("load", d));
    return () => { live = false; };
  }, [corpus, act]);

  const built = isBuilt(s);
  const q = s.query;
  // s is mutated in place by tick, so depend on the primitives that change the answer.
  const r = useMemo(() => answer(s, c), [built, s.ixKey, s.mismatch, q.kind, q.i, c.k, c.efSearch, c.filter, c.filterMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const dots = useMemo(() => corpus && (
    <g aria-hidden style={{ cursor: "pointer" }}>
      {corpus.texts.map((_, i) => {
        const on = matches(corpus, c.filter, i);
        return <circle key={i} data-i={i} cx={px(corpus.xy[2 * i])} cy={py(corpus.xy[2 * i + 1])} r={on ? 2.2 : 1.6} fill={COLORS[corpus.topic[i]]} opacity={on ? 0.75 : 0.12} />;
      })}
    </g>
  ), [corpus, c.filter]); // 2,000 circles: rebuilt only when the data or filter changes, not every frame

  const mark = useMemo(() => {
    if (!r || !corpus) return null;
    const at = (i: number): [number, number] => [px(corpus.xy[2 * i]), py(corpus.xy[2 * i + 1])];
    const [qx, qy] = q.kind === "sample" ? [corpus.qxy[2 * q.i], corpus.qxy[2 * q.i + 1]] : [corpus.xy[2 * q.i], corpus.xy[2 * q.i + 1]];
    const exact = new Set(r.exact.map((h) => h.id)), trace = r.trace;
    return (
      <g aria-hidden>
        {trace && trace.visited.slice(0, 800).map((i) => { const [x, y] = at(i); return <circle key={`v${i}`} cx={x} cy={y} r={3.2} fill="none" stroke="var(--ink)" strokeWidth={0.5} opacity={0.5} />; })}
        {trace && trace.path.length > 1 && <polyline points={trace.path.map((i) => at(i).join(",")).join(" ")} fill="none" stroke="var(--cobalt)" strokeWidth={1.5} strokeDasharray="4 3" />}
        {r.hits.map((h) => { const [x, y] = at(h.id); return <line key={`l${h.id}`} x1={px(qx)} y1={py(qy)} x2={x} y2={y} stroke="var(--ink)" strokeWidth={0.6} opacity={0.6} />; })}
        {r.exact.map((h) => { const [x, y] = at(h.id); return <circle key={`e${h.id}`} cx={x} cy={y} r={5.5} fill="none" stroke="var(--ink)" strokeWidth={1.4} />; })}
        {r.hits.map((h) => { const [x, y] = at(h.id); return <rect key={`h${h.id}`} x={x - 2.5} y={y - 2.5} width={5} height={5} fill={exact.has(h.id) ? "var(--ink)" : "var(--status-over)"} />; })}
      </g>
    );
  }, [r, corpus, q.kind, q.i]);

  if (!corpus) return <div className="fm-card p-4 font-mono text-[12px]" role="status">LOADING 2,000 EMBEDDINGS (64-D LSA, ~380 KB)…</div>;

  const qxy: [number, number] = q.kind === "sample" ? [corpus.qxy[2 * q.i], corpus.qxy[2 * q.i + 1]] : [corpus.xy[2 * q.i], corpus.xy[2 * q.i + 1]];
  const qText = q.kind === "sample" ? corpus.queries[q.i] : corpus.texts[q.i];
  const exactIds = new Set(r?.exact.map((h) => h.id));
  const sysIds = new Set(r?.hits.map((h) => h.id));
  const found = r ? r.hits.filter((h) => exactIds.has(h.id)).length : 0;
  const ix = s.ix;
  const layers = ix ? layerSizes(ix) : [];
  const nb = benchQueries(corpus);
  const L = s.last;
  const cos = (a: number, b: Float32Array, bi: number) => { let x = 0; for (let d = 0; d < corpus.dim; d++) x += corpus.vecs[a * corpus.dim + d] * b[bi * corpus.dim + d]; return x; };
  const qv = q.kind === "sample" ? corpus.qvecs : corpus.vecs;
  const meta = (i: number) => `${corpus.topics[corpus.topic[i]]} · ${corpus.sources[corpus.source[i]]} · ${corpus.year[i]}`;
  const filterLabel = FILTERS.find((f) => f.value === c.filter)!.label;
  const sysName = c.filter !== "none" && c.filterMode === "pre" ? "Pre-filter scan" : c.filter !== "none" ? "HNSW + post-filter" : "HNSW";

  const pickItem = (i: number) => act("query", { kind: "item", i: (i + corpus.n) % corpus.n } satisfies Query);
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <section aria-label="Query" className="fm-card grid gap-2 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[12px]">
            <span className="fm-cap">Sample query</span>
            <select className="fm-input max-w-full" value={q.kind === "sample" ? q.i : ""} onChange={(e) => act("query", { kind: "sample", i: Number(e.target.value) } satisfies Query)}>
              {q.kind === "item" && <option value="">(dataset item)</option>}
              {corpus.queries.map((t, i) => <option key={i} value={i}>{t}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[12px]">
            <span className="fm-cap">Or dataset item #</span>
            <input className="fm-input w-24" type="number" min={0} max={corpus.n - 1} value={q.kind === "item" ? q.i : ""} placeholder="0–1999" onChange={(e) => e.target.value !== "" && pickItem(Math.max(0, Math.min(corpus.n - 1, Math.floor(Number(e.target.value)))))} />
          </label>
          <button type="button" className="fm-btn fm-btn--tool" onClick={() => pickItem(q.kind === "item" ? q.i - 1 : 0)} aria-label="Previous dataset item">◀</button>
          <button type="button" className="fm-btn fm-btn--tool" onClick={() => pickItem(q.kind === "item" ? q.i + 1 : 0)} aria-label="Next dataset item">▶</button>
        </div>
        <p className="text-[14px]"><span className="fm-cap">{q.kind === "sample" ? "Query" : `Item #${q.i} · ${meta(q.i)}`}</span> “{qText}”</p>
        <p className="font-mono text-[11px] text-ink-muted">Click any dot to query with that item (its own vector is excluded from the results). Filter: {filterLabel}{c.filter !== "none" ? ` · ${c.filterMode}-filter` : ""}.</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <figure className="fm-card grid gap-2 p-3">
          <div className="overflow-x-auto" tabIndex={0}>
            <svg viewBox={`0 0 ${W} ${W}`} className="h-auto w-full max-w-[560px]" role="img" aria-label={`2-D PCA map of ${corpus.n} items coloured by topic. ${r ? `${sysName} returned ${r.hits.length} results, ${found} of them in the exact top ${r.exact.length}, using ${r.comps} distance computations.` : "Index still building."}`}>
              <rect x={0.5} y={0.5} width={W - 1} height={W - 1} fill="none" stroke="var(--line)" />
              <line x1={W / 2} y1={0} x2={W / 2} y2={W} stroke="var(--line)" strokeDasharray="2 4" />
              <line x1={0} y1={W / 2} x2={W} y2={W / 2} stroke="var(--line)" strokeDasharray="2 4" />
              <g onClick={(e) => { const i = (e.target as Element).getAttribute("data-i"); if (i) pickItem(Number(i)); }}>{dots}</g>
              {mark}
              <g transform={`translate(${px(qxy[0])},${py(qxy[1])})`} aria-hidden>
                <circle r={7} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
                <line x1={-11} x2={11} stroke="var(--ink)" strokeWidth={1.5} /><line y1={-11} y2={11} stroke="var(--ink)" strokeWidth={1.5} />
              </g>
            </svg>
          </div>
          <figcaption className="grid gap-1 font-mono text-[11px]">
            <span className="flex flex-wrap gap-x-3 gap-y-1">{corpus.topics.map((t, i) => <span key={t} className="inline-flex items-center gap-1"><span className="inline-block size-2.5" style={{ background: COLORS[i], borderRadius: 2 }} />{t}</span>)}</span>
            <span>⊕ query · ◯ exact top-{c.k} · ■ {sysName} result (red ■ = not in exact top-{c.k}) · thin rings: nodes HNSW computed a distance to on layer 0 · dashed: greedy descent through upper layers</span>
            <span className="text-ink-muted">2-D PCA of the 64-d vectors: neighbours in 64-d can look far apart here, and that is the projection, not the search.</span>
          </figcaption>
        </figure>

        <section aria-label="Results" className="fm-card grid content-start gap-2 p-3">
          <h3 className="fm-cap">Top {c.k} · {sysName} vs exact cosine</h3>
          {!r ? (
            <p className="font-mono text-[12px]">Index building… results appear when all {corpus.n} nodes are inserted.</p>
          ) : (
            <>
              <p className="font-mono text-[12px]">
                {sysName}: <b>{r.comps}</b> distance computations ({pct((r.comps / r.brute) * 100)} of brute force&apos;s {r.brute.toLocaleString("en-US")}){r.trace ? ` · ${r.trace.path.length - 1} upper-layer hops` : ""}
                <br />
                <span style={{ color: tone(found === r.exact.length) }}>{found === r.exact.length ? "OK" : "MISSED"} · found {found} of the exact top {r.exact.length}</span>
                {r.hits.length < Math.min(c.k, r.matching) && <span style={{ color: "var(--status-over)" }}> · TOO FEW RESULTS: {r.hits.length} returned, {r.matching} items match the filter</span>}
              </p>
              <ol className="grid gap-1 text-[13px]">
                {r.hits.map((h, n) => (
                  <li key={h.id} className="border border-ink px-2 py-1" style={{ borderRadius: 2, borderLeft: `4px solid ${exactIds.has(h.id) ? "var(--status-ok)" : "var(--status-over)"}` }}>
                    <span className="font-mono text-[11px]">{n + 1}. cos {cos(h.id, qv, q.i).toFixed(3)} · #{h.id} · {meta(h.id)} · {exactIds.has(h.id) ? "IN EXACT TOP-K" : "NOT IN EXACT TOP-K"}</span>
                    <button type="button" className="block text-left underline-offset-2 hover:underline" onClick={() => pickItem(h.id)}>{corpus.texts[h.id]}</button>
                  </li>
                ))}
              </ol>
              {r.exact.some((h) => !sysIds.has(h.id)) && (
                <div className="grid gap-1">
                  <h4 className="fm-cap" style={{ color: "var(--status-over)" }}>Missed (in exact top {c.k})</h4>
                  <ul className="grid gap-1 text-[13px]">
                    {r.exact.filter((h) => !sysIds.has(h.id)).map((h) => <li key={h.id}><span className="font-mono text-[11px]">cos {(1 - h.d).toFixed(3)} · #{h.id} · </span>{corpus.texts[h.id]}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <section aria-label="Index" className="fm-card grid content-start gap-2 p-3">
          <h3 className="fm-cap">HNSW index · M={ix?.M ?? c.M} · efConstruction={ix?.efC ?? c.efConstruction}</h3>
          <Bar label="Nodes inserted" value={ix?.inserted ?? 0} max={corpus.n} />
          <Bar label={`Benchmark queries (recall@${K})`} value={built ? (s.bench?.next ?? 0) : 0} max={nb} />
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 font-mono text-[12px]">
            <dt>Build distance computations</dt><dd>{(ix?.buildComps ?? 0).toLocaleString("en-US")}</dd>
            <dt>Build ticks (≤{TICK_BUDGET.toLocaleString("en-US")} computations each)</dt><dd>{s.buildTicks}</dd>
            <dt>Links per node (layer 0 / above)</dt><dd>≤{2 * (ix?.M ?? c.M)} / ≤{ix?.M ?? c.M}</dd>
            {layers.map((n, l) => <Fragment key={l}><dt>Layer {l}</dt><dd>{n} nodes</dd></Fragment>).reverse()}
          </dl>
          {(s.unnormalised || s.mismatch) && <p className="font-mono text-[12px]" style={{ color: "var(--status-over)" }}>FAULT · {s.unnormalised ? "vectors not normalised (raw dot product)" : ""}{s.unnormalised && s.mismatch ? " · " : ""}{s.mismatch ? "query model ≠ index model" : ""}</p>}
        </section>

        <section aria-label="Benchmark results" className="fm-card grid content-start gap-2 p-3">
          <h3 className="fm-cap">Benchmark · {nb} items as queries · recall@{K}</h3>
          {L ? (
            <p className="font-mono text-[12px]">
              <span style={{ color: tone(L.recall >= 0.95) }}>{L.recall >= 0.95 ? "OK" : "LOW"} recall {L.recall.toFixed(3)}</span> · <span style={{ color: tone(L.pct < 20) }}>{L.pct < 20 ? "OK" : "COSTLY"} {Math.round(L.comps)}/query = {pct(L.pct)} of brute force</span>{L.short ? <span style={{ color: "var(--status-over)" }}> · {L.short} queries short of 10</span> : null}
            </p>
          ) : <p className="font-mono text-[12px]">Runs automatically once the index is built, and again whenever a setting changes.</p>}
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full font-mono text-[11px]">
              <thead><tr className="text-left"><th>M</th><th>efC</th><th>efS</th><th>filter</th><th>recall</th><th>% brute</th><th>avg ret.</th></tr></thead>
              <tbody>
                {[...s.results].reverse().map((x, i) => (
                  <tr key={i} style={x.faults.length ? { color: "var(--status-over)" } : undefined}>
                    <td>{x.M}</td><td>{x.efC}</td><td>{x.efSearch}</td><td>{x.filter === "none" ? "—" : `${x.filter}/${x.mode}`}{x.faults.length ? " ⚠" : ""}</td>
                    <td>{x.recall.toFixed(3)}</td><td>{pct(x.pct)}</td><td>{x.returned.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
