"use client";
import { Fragment, useMemo, useState } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { CAUSES, COMPS, HEAP_LIMIT_MB, INCIDENTS, POOL_SIZE, SERVICES, incidentOf, scoreFor, totalScore, type CauseId, type Comp, type Level, type ObsConfig, type ObsState, type Point, type Span, type Trace } from "./model";

type Act = ViewProps<ObsConfig, ObsState>["act"];
const TONE = { ok: "var(--status-ok)", hot: "var(--status-hot)", over: "var(--status-over)" } as const;
const LEVEL_C: Record<Level, string> = { info: "var(--ink-muted)", warn: "var(--status-hot)", error: "var(--status-over)" };
const RANK: Record<Level, number> = { info: 0, warn: 1, error: 2 };
/** Latency objective per component (ms), used only to colour the dashboard. */
const SLO: Record<Comp, number> = { gateway: 500, users: 50, orders: 500, payments: 600, inventory: 100, postgres: 50, redis: 20, psp: 600 };
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`; };
const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`);
const TRACE_RE = /[0-9a-f]{32}/;

export function ObsView({ state, t, act }: ViewProps<ObsConfig, ObsState>) {
  const [comp, setComp] = useState<Comp | "all">("all");
  const [level, setLevel] = useState<Level>("info");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>();
  const openTrace = (id: string) => { setSel(id); setQ(id); };
  return (
    <div className="grid gap-4 p-3 text-[14px] [&>*]:min-w-0">
      <IncidentPanel state={state} t={t} act={act} />
      <Dashboard state={state} onPick={(c) => { setComp(c); setLevel("info"); }} />
      <Logs state={state} comp={comp} setComp={setComp} level={level} setLevel={setLevel} q={q} setQ={setQ} onTrace={openTrace} />
      <Traces state={state} sel={sel ?? q.match(TRACE_RE)?.[0]} onSel={openTrace} />
    </div>
  );
}

function IncidentPanel({ state: s, t, act }: { state: ObsState; t: number; act: Act }) {
  const [cause, setCause] = useState<CauseId>("slow-query");
  const [comp, setComp] = useState<Comp>("gateway");
  const inc = s.inc;
  const live = inc && t >= inc.onset;
  return (
    <section aria-label="Incident mode" className="fm-card grid gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="fm-cap !text-ink">Incident mode</h3>
        <span className="fm-cap">{Object.keys(s.solved).length} / 5 solved · {totalScore(s)} pts</span>
      </header>
      {!inc && !s.queued && (
        <div className="flex flex-wrap gap-1.5">
          {INCIDENTS.map((d, i) => {
            const r = s.solved[d.id];
            return (
              <button key={d.id} type="button" className="fm-btn fm-btn--tool !h-auto min-h-8 py-1 text-left" onClick={() => act("start", { id: d.id })} title={d.page}>
                {r ? `✓ ${r.score} · ` : s.revealed.includes(d.id) ? "revealed · " : ""}#{i + 1} {d.page.split(";")[0].split(" (")[0]}
              </button>
            );
          })}
          <button type="button" className="fm-btn fm-btn--tool is-on !h-8" onClick={() => act("start")}>Random unsolved incident</button>
        </div>
      )}
      {(s.queued || (inc && !live)) && <p className="fm-cap">Something is about to break… paging in {Math.max(0, Math.ceil(((inc?.onset ?? s.queued!.at) - t) / 1000))} s. Look at the healthy baseline now.</p>}
      {inc && live && (
        <>
          <div role="alert" className="border-2 p-2" style={{ borderColor: TONE.over, borderRadius: 2 }}>
            <p className="font-semibold" style={{ color: TONE.over }}>PAGE · {incidentOf(inc.id).page}</p>
            <p className="fm-cap">Open for {clock(t - inc.onset)} · {inc.wrong} wrong · worth {scoreFor(t - inc.onset, inc.wrong)} pts now</p>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act("submit", { cause, comp }); }}>
            <label className="grid gap-1"><span className="fm-cap">Root cause</span>
              <select className="fm-input !h-8 !w-auto max-w-full" value={cause} onChange={(e) => setCause(e.target.value as CauseId)}>{CAUSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            </label>
            <label className="grid gap-1"><span className="fm-cap">Component</span>
              <select className="fm-input !h-8 !w-auto" value={comp} onChange={(e) => setComp(e.target.value as Comp)}>{COMPS.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <button type="submit" className="fm-btn fm-btn--tool is-on !h-8">Submit root cause</button>
            <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("reveal")}>Give up and reveal</button>
          </form>
          {inc.feedback.length > 0 && <ul className="grid gap-1" aria-live="polite">{inc.feedback.slice(0, 3).map((f, i) => <li key={i} className="border-l-4 pl-2" style={{ borderColor: TONE.hot }}><span style={{ color: TONE.hot }}>WRONG · </span>{f}</li>)}</ul>}
        </>
      )}
      {s.last && !inc && (
        <div role="status" className="border-2 p-2" style={{ borderColor: s.last.ok ? TONE.ok : TONE.hot, borderRadius: 2 }}>
          <p className="font-semibold" style={{ color: s.last.ok ? TONE.ok : TONE.hot }}>{s.last.ok ? "RESOLVED" : "REVEALED"}</p>
          <p>{s.last.text}</p>
        </div>
      )}
      {s.faults.length > 0 && <p className="fm-cap" style={{ color: TONE.hot }}>Break-it faults on: {s.faults.join(", ")}. Their evidence mixes with any incident.</p>}
    </section>
  );
}

function sat(s: ObsState, c: Comp): string {
  if (c === "orders") return `pool ${Math.min(POOL_SIZE, Math.round(s.ordersPool))}/${POOL_SIZE}`;
  if (c === "inventory") return s.t < s.heap.downUntil ? "RESTARTING" : `heap ${((s.heap.live + s.heap.garbage) / 1024).toFixed(2)}/${HEAP_LIMIT_MB / 1024} GB · ${s.heap.restarts} restarts`;
  if (c === "postgres") return `load ${Math.round(s.dbLoad * 100)}% · ${s.dbQps} q/s`;
  if (c === "redis") return `hit ${Math.round(s.hitRatio * 100)}%`;
  return "";
}
const tone = (c: Comp, p?: Point) => (!p ? "ok" : p.err >= 5 || p.p99 > 4 * SLO[c] ? "over" : p.err >= 1 || p.p99 > SLO[c] ? "hot" : "ok");

function Spark({ pts, k, color }: { pts: Point[]; k: "p99" | "err"; color: string }) {
  if (pts.length < 2) return <svg viewBox="0 0 60 16" className="h-4 w-[60px]" aria-hidden />;
  const max = Math.max(...pts.map((p) => p[k]), k === "err" ? 1 : 1);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * 60).toFixed(1)},${(15 - (p[k] / max) * 14).toFixed(1)}`).join("");
  return <svg viewBox="0 0 60 16" className="h-4 w-[60px]" aria-hidden><path d={d} fill="none" stroke={color} strokeWidth={1.2} /></svg>;
}

function Dashboard({ state: s, onPick }: { state: ObsState; onPick(c: Comp): void }) {
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">RED per component · last 1 s · rate (req/s), errors (5xx or failed call), duration p50/p99 · sparklines = last 60 s · services above the line, dependencies below (measured by their callers)</figcaption>
      <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
        <table className="w-full min-w-[640px] font-mono text-[12px]">
          <thead><tr>{["component", "status", "rate", "errors", "p50", "p99", "p99 · 60 s", "err · 60 s", "saturation"].map((h) => <th key={h} className="whitespace-nowrap border-b border-ink px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {COMPS.map((c) => {
              const pts = s.series[c];
              const p = pts.at(-1);
              const st = tone(c, p);
              return (
                <tr key={c} className={c === "postgres" ? "border-t-2 border-ink" : undefined}>
                  <td className="border-b border-line px-2 py-0.5"><button type="button" className="underline decoration-dotted" onClick={() => onPick(c)} aria-label={`Show ${c} logs`}>{c}</button>{(SERVICES as readonly string[]).includes(c) ? "" : " (dep)"}</td>
                  <td className="border-b border-line px-2 py-0.5" style={{ color: TONE[st] }}>{st === "ok" ? "OK" : st === "hot" ? "HOT" : "OVER"}</td>
                  <td className="border-b border-line px-2 py-0.5 tabular-nums">{p?.rps ?? 0}</td>
                  <td className="border-b border-line px-2 py-0.5 tabular-nums" style={{ color: p && p.err >= 1 ? TONE[p.err >= 5 ? "over" : "hot"] : undefined }}>{(p?.err ?? 0).toFixed(1)}%</td>
                  <td className="border-b border-line px-2 py-0.5 tabular-nums">{fmtMs(p?.p50 ?? 0)}</td>
                  <td className="border-b border-line px-2 py-0.5 tabular-nums">{fmtMs(p?.p99 ?? 0)}</td>
                  <td className="border-b border-line px-2 py-0.5"><Spark pts={pts} k="p99" color="var(--cobalt)" /></td>
                  <td className="border-b border-line px-2 py-0.5"><Spark pts={pts} k="err" color="var(--status-over)" /></td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{sat(s, c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Logs({ state: s, comp, setComp, level, setLevel, q, setQ, onTrace }: {
  state: ObsState; comp: Comp | "all"; setComp(c: Comp | "all"): void; level: Level; setLevel(l: Level): void; q: string; setQ(v: string): void; onTrace(id: string): void;
}) {
  const needle = (q.match(TRACE_RE)?.[0] ?? q).trim().toLowerCase();
  const rows = s.logs.filter((l) => (comp === "all" || l.comp === comp) && RANK[l.level] >= RANK[level] && (!needle || l.trace?.startsWith(needle) || l.msg.toLowerCase().includes(needle)));
  const shown = rows.slice(-80).reverse();
  return (
    <section aria-label="Log explorer" className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <h3 className="fm-cap !text-ink mr-auto self-center">Logs · {s.logRate} lines/s ingested</h3>
        <label className="grid gap-1"><span className="fm-cap">Service</span>
          <select className="fm-input !h-8 !w-auto" value={comp} onChange={(e) => setComp(e.target.value as Comp | "all")}><option value="all">all</option>{COMPS.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="grid gap-1"><span className="fm-cap">Level ≥</span>
          <select className="fm-input !h-8 !w-auto" value={level} onChange={(e) => setLevel(e.target.value as Level)}><option value="info">info</option><option value="warn">warn</option><option value="error">error</option></select>
        </label>
        <label className="grid gap-1"><span className="fm-cap">Request id / traceparent / text</span>
          <input className="fm-input !h-8 !w-56 max-w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 4bf92f35 or ETIMEDOUT" spellCheck={false} />
        </label>
        {(q || comp !== "all" || level !== "info") && <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => { setQ(""); setComp("all"); setLevel("info"); }}>Clear</button>}
      </div>
      <p className="fm-cap">{rows.length} of {s.logs.length} retained lines match · newest first · trace ids are W3C trace-ids; click one to open its trace</p>
      <ol className="max-h-[320px] overflow-auto border border-ink font-mono text-[12px]" style={{ borderRadius: 2 }}>
        {shown.map((l) => (
          <li key={l.n} className="grid grid-cols-[auto_auto_auto_1fr] gap-x-2 border-b border-line px-2 py-0.5" style={{ borderLeft: `4px solid ${LEVEL_C[l.level]}` }}>
            <span className="opacity-70">{clock(l.t)}</span>
            <span style={{ color: l.level === "info" ? undefined : LEVEL_C[l.level] }}>{l.level.toUpperCase()}</span>
            <span>{l.comp}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">
              {l.trace && <button type="button" className="mr-1 underline decoration-dotted" onClick={() => onTrace(l.trace!)} aria-label={`Open trace ${l.trace}`}>[{l.trace.slice(0, 8)}]</button>}
              {l.msg}
            </span>
          </li>
        ))}
        {!shown.length && <li className="px-2 py-1 opacity-70">No lines match.</li>}
      </ol>
    </section>
  );
}

function Traces({ state: s, sel, onSel }: { state: ObsState; sel?: string; onSel(id: string): void }) {
  const [only, setOnly] = useState<"all" | "errors" | "slow">("all");
  const list = s.traces.filter((x) => only === "all" || (only === "errors" ? x.status >= 500 : x.dur >= 1000)).slice(-12).reverse();
  const tr = sel ? s.traces.find((x) => x.id === sel) : undefined;
  return (
    <section aria-label="Trace explorer" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="fm-cap !text-ink mr-auto">Traces · {s.traces.length} kept by the sampler</h3>
        {(["all", "errors", "slow"] as const).map((o) => <button key={o} type="button" aria-pressed={only === o} className={`fm-btn fm-btn--tool !h-8 ${only === o ? "is-on" : ""}`} onClick={() => setOnly(o)}>{o === "slow" ? "slow ≥ 1 s" : o}</button>)}
      </div>
      <ul className="grid gap-1 font-mono text-[12px] sm:grid-cols-2">
        {list.map((x) => (
          <li key={x.id}>
            <button type="button" aria-pressed={x.id === sel} className={`w-full border px-2 py-0.5 text-left ${x.id === sel ? "border-ink border-2" : "border-line"}`} style={{ borderRadius: 2 }} onClick={() => onSel(x.id)}>
              <span style={{ color: x.status >= 500 ? TONE.over : undefined }}>{x.status}</span> {x.route} · {fmtMs(x.dur)} · {x.id.slice(0, 8)} · {clock(x.t)}
            </button>
          </li>
        ))}
        {!list.length && <li className="opacity-70">No kept traces yet.</li>}
      </ul>
      {sel && !tr && <p className="fm-cap" style={{ color: TONE.hot }}>Trace {sel.slice(0, 8)} was not kept: the sampler dropped it (or it aged out). Only its logs remain.</p>}
      {tr && <Waterfall tr={tr} />}
    </section>
  );
}

function order(tr: Trace): { sp: Span; depth: number; self: number }[] {
  const kids = new Map<string | undefined, Span[]>();
  for (const sp of tr.spans) kids.set(sp.parent, [...(kids.get(sp.parent) ?? []), sp]);
  const out: { sp: Span; depth: number; self: number }[] = [];
  const walk = (p: string | undefined, depth: number) => {
    for (const sp of (kids.get(p) ?? []).sort((a, b) => a.start - b.start)) {
      const ch = kids.get(sp.id) ?? [];
      // Children run one after another here, so self time = own duration minus theirs.
      out.push({ sp, depth, self: Math.max(0, sp.dur - ch.reduce((a, c) => a + c.dur, 0)) });
      walk(sp.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

function Waterfall({ tr }: { tr: Trace }) {
  const rows = useMemo(() => order(tr), [tr]);
  const [open, setOpen] = useState<string>();
  const total = Math.max(1, tr.dur);
  const root = tr.spans[0];
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap break-all">{tr.route} · {tr.status} · {fmtMs(tr.dur)} · traceparent: 00-{tr.id}-{root.id}-{tr.sampled ? "01" : "00"}{tr.sampled ? "" : " (kept by tail sampling after it finished)"}</figcaption>
      <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
        <div className="min-w-[560px] font-mono text-[12px]">
          {rows.map(({ sp, depth, self }) => (
            <div key={sp.id} className="border-b border-line">
              <button type="button" aria-expanded={open === sp.id} className="grid w-full grid-cols-[220px_1fr_120px] items-center gap-2 px-2 py-0.5 text-left" onClick={() => setOpen(open === sp.id ? undefined : sp.id)}>
                <span className="truncate" style={{ paddingLeft: depth * 10, color: sp.err ? TONE.over : undefined }}>{sp.comp} · {sp.name}</span>
                <span className="relative h-3" aria-hidden>
                  <span className="absolute inset-y-0 border border-ink" style={{ left: `${(sp.start / total) * 100}%`, width: `max(2px, ${(sp.dur / total) * 100}%)`, background: sp.err ? "var(--status-over)" : sp.comp === "postgres" || sp.comp === "redis" || sp.comp === "psp" ? "var(--surface-sunk)" : "var(--cobalt)", borderRadius: 1 }} />
                </span>
                <span className="text-right tabular-nums">{fmtMs(sp.dur)} · self {fmtMs(self)}</span>
              </button>
              {open === sp.id && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 px-2 pb-1 pl-6">
                  <dt className="opacity-70">span id</dt><dd className="break-all">{sp.id}</dd>
                  <dt className="opacity-70">start</dt><dd>+{fmtMs(sp.start)}</dd>
                  {sp.err && <><dt className="opacity-70">error</dt><dd style={{ color: TONE.over }}>{sp.err}</dd></>}
                  {Object.entries(sp.attrs ?? {}).map(([k, v]) => <Fragment key={k}><dt className="opacity-70">{k}</dt><dd className="break-all">{String(v)}</dd></Fragment>)}
                </dl>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="fm-cap">Click a span for its attributes. Self time is what the span did itself; a long span with tiny self time is only waiting on its children.</p>
    </figure>
  );
}
