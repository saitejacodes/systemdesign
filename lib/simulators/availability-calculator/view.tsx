"use client";
import { Fragment, useState, type DragEvent } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { PRESET_PCTS, avail, downtime, fmtMin, fmtPct, formula, parentOf, stages, total, weakest, within, type AvailConfig, type AvailState, type Block } from "./model";

type Act = ViewProps<AvailConfig, AvailState>["act"];
const over = "var(--status-over)";

export function AvailView({ state: s, act }: ViewProps<AvailConfig, AvailState>) {
  const a = total(s);
  const d = downtime(a);
  const weak = weakest(s);
  const st = stages(s);
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <section aria-label="Total availability" className="fm-card grid gap-2 p-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="fm-cap">Total</span>
          <span className="font-mono text-[28px] font-medium tabular-nums">{fmtPct(a)}</span>
          <span className="fm-cap">{a >= 1 ? "∞" : (-Math.log10(1 - a)).toFixed(2)} nines</span>
        </div>
        <dl className="grid grid-cols-3 gap-2 font-mono text-[13px]">
          {([["Down per year", d.year], ["Per 30-day month", d.month], ["Per week", d.week]] as const).map(([k, v]) => (
            <div key={k}><dt className="fm-cap">{k}</dt><dd className="tabular-nums">{fmtMin(v)}</dd></div>
          ))}
        </dl>
        <p className="break-words font-mono text-[12px] text-ink-muted">A = {formula(s)} = {fmtPct(a)}</p>
      </section>

      <div className="overflow-x-auto" tabIndex={0}>
        <div className="min-w-max p-1"><BlockView id={s.root} s={s} act={act} weak={weak} root /></div>
      </div>

      <section aria-label="Where the downtime comes from" className="fm-card grid gap-1 p-3">
        <h3 className="fm-cap">Share of downtime by stage (series: failure probabilities add, roughly)</h3>
        {st.map((x) => (
          <div key={x.id} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 font-mono text-[12px]">
            <span className="truncate">{label(s, x.id)}</span>
            <span className="h-2 border border-ink" style={{ borderRadius: 2 }}><span className="block h-full" style={{ width: `${Math.round(x.share * 100)}%`, background: x.id === weak ? over : "var(--cobalt)" }} /></span>
            <span className="tabular-nums">{Math.round(x.share * 100)}% · {fmtMin(downtime(x.a).year)}/yr{x.id === weak ? " · WEAKEST" : ""}</span>
          </div>
        ))}
      </section>

      {s.sel && s.blocks[s.sel] && <Inspector key={s.sel} s={s} id={s.sel} act={act} />}
    </div>
  );
}

const label = (s: AvailState, id: string): string => {
  const b = s.blocks[id];
  if (b.kind === "comp") return b.name;
  return `${b.kind === "parallel" ? "Redundant" : "Chain"}: ${b.children.map((c) => label(s, c)).join(b.kind === "parallel" ? " | " : " → ")}`;
};

const drag = (id: string) => (e: DragEvent) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; };
const drop = (to: string, act: Act) => (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); const id = e.dataTransfer.getData("text/plain"); if (id && id !== to) act("move", { id, to }); };
const allow = (e: DragEvent) => e.preventDefault();

function BlockView({ id, s, act, weak, root }: { id: string; s: AvailState; act: Act; weak: string | null; root?: boolean }) {
  const b: Block = s.blocks[id];
  const a = avail(s, id);
  const isWeak = id === weak;
  const ring = isWeak ? { outline: `2px solid ${over}`, outlineOffset: 2 } : undefined;
  if (b.kind === "comp") {
    const on = s.sel === id;
    return (
      <div style={ring} className="grid">
        {isWeak && <span className="fm-cap" style={{ color: over }}>Weakest link</span>}
        <button type="button" draggable onDragStart={drag(id)} onDragOver={allow} onDrop={drop(id, act)} aria-pressed={on} onClick={() => act("select", on ? null : id)}
          className={`fm-card grid min-w-[7.5rem] gap-0.5 p-2 text-left ${on ? "is-on" : ""}`} style={on ? { borderColor: "var(--cobalt)", borderWidth: 2 } : undefined}>
          <span className="text-[14px] font-semibold">{b.name}</span>
          <span className="font-mono text-[13px] tabular-nums">{b.pct}%</span>
          <span className="fm-cap">{fmtMin(downtime(a).year)}/yr</span>
        </button>
      </div>
    );
  }
  const par = b.kind === "parallel";
  return (
    <div style={ring} className="grid gap-1" onDragOver={allow} onDrop={drop(id, act)}>
      {isWeak && <span className="fm-cap" style={{ color: over }}>Weakest link</span>}
      {root ? <span className="fm-cap">System · in series = {fmtPct(a)}</span> : (
        <button type="button" aria-pressed={s.sel === id} className="fm-cap justify-self-start underline-offset-2 hover:underline" onClick={() => act("select", s.sel === id ? null : id)}>
          {par ? "Parallel · 1 − Π(1 − a)" : "Series · Π a"} = {fmtPct(a)}{s.sel === id ? " · selected" : ""}
        </button>
      )}
      <div className={`flex ${par ? "flex-col gap-2 border-x-2 px-2 py-1" : "flex-row items-center gap-1"} ${!root && !par ? "border border-dashed p-1" : ""}`} style={{ borderColor: "var(--ink)", borderRadius: 2 }}>
        {b.children.map((c, k) => (
          <Fragment key={c}>
            {!par && k > 0 && <span aria-hidden className="font-mono">→</span>}
            <BlockView id={c} s={s} act={act} weak={root ? weak : null} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Inspector({ s, id, act }: { s: AvailState; id: string; act: Act }) {
  const b = s.blocks[id];
  const [to, setTo] = useState("");
  const parent = parentOf(s, id);
  const targets = Object.values(s.blocks).filter((x) => x.id !== id && x.id !== parent?.id && !within(s, x.id, id));
  return (
    <section aria-label="Selected block" className="fm-card grid gap-2 p-3">
      <h3 className="fm-cap">Selected · {b.kind === "comp" ? b.name : label(s, id)}</h3>
      {b.kind === "comp" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="fm-field !min-w-0">Name<input className="fm-input !h-8" value={b.name} onChange={(e) => act("set", { id, name: e.target.value })} /></label>
          <label className="fm-field !min-w-0">Availability %
            <input key={`${id}-${b.pct}`} className="fm-input fm-input--mono !h-8 !w-28" inputMode="decimal" defaultValue={b.pct} onBlur={(e) => act("set", { id, pct: Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") act("set", { id, pct: Number((e.target as HTMLInputElement).value) }); }} />
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Availability presets">
            {PRESET_PCTS.map((p) => <button key={p} type="button" aria-pressed={b.pct === p} className={`fm-btn fm-btn--tool !h-8 ${b.pct === p ? "is-on" : ""}`} onClick={() => act("set", { id, pct: p })}>{p}%</button>)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("parallel", id)}>+ Redundant copy (parallel)</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("series", id)}>+ Component after it (series)</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("remove", id)}>Remove</button>
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (to) act("move", { id, to }); setTo(""); }}>
        <label className="fm-cap" htmlFor="avail-move">Move into</label>
        <select id="avail-move" className="fm-input !h-8 !w-auto max-w-full" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose a target…</option>
          {targets.map((x) => <option key={x.id} value={x.id}>{x.kind === "comp" ? `${x.name} (as a parallel pair)` : x.id === s.root ? "System (end of the chain)" : label(s, x.id)}</option>)}
        </select>
        <button type="submit" className="fm-btn fm-btn--tool !h-8" disabled={!to}>Move</button>
        <span className="fm-help">Same as dragging a block onto another one.</span>
      </form>
    </section>
  );
}
