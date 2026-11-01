"use client";
import { useState } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { DRILLS, MAX_ROWS, drillAnswer, estimate, fmt, fmtBytes, parseNum, type EstConfig, type EstState, type Row } from "./model";

const cell = "fm-input fm-input--mono !h-8 !py-0 !text-[13px]";

export function EstView({ state, config, t, act }: ViewProps<EstConfig, EstState>) {
  const [tab, setTab] = useState<"calc" | "drills">("calc");
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Mode" className="flex gap-2">
        {(["calc", "drills"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} className={`fm-btn fm-btn--tool !h-8 ${tab === k ? "is-on" : ""}`} onClick={() => setTab(k)}>
            {k === "calc" ? "Calculator" : `Drills · ${Object.values(state.results).filter((r) => r.passed).length}/${DRILLS.length}`}
          </button>
        ))}
      </div>
      {tab === "calc" ? <Calculator state={state} config={config} act={act} /> : <Drills state={state} config={config} t={t} act={act} />}
    </div>
  );
}

function Calculator({ state, config, act }: Pick<ViewProps<EstConfig, EstState>, "state" | "config" | "act">) {
  const { outs } = estimate(config, state.rows);
  const set = (i: number, patch: Partial<Row>) => act("row", { i, patch });
  return (
    <div className="grid gap-4">
      <table className="w-full text-[13px]">
        <caption className="fm-cap mb-2 text-left">Actions per user per day · {config.dauM}M daily users</caption>
        <thead><tr className="fm-cap text-left"><th>Action</th><th>Per day</th><th>Type</th><th>Bytes</th><th><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>
          {state.rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-1 py-1"><input aria-label={`Action ${i + 1} name`} className={cell} value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
              <td className="pr-1"><input aria-label={`${r.name} per user per day`} className={cell} inputMode="decimal" defaultValue={r.count} onBlur={(e) => { const v = parseNum(e.target.value); if (v >= 0) set(i, { count: v }); }} /></td>
              <td className="min-w-[84px] pr-1"><select aria-label={`${r.name} type`} className={cell} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as Row["kind"] })}><option value="read">read</option><option value="write">write</option></select></td>
              <td className="pr-1"><input aria-label={`${r.name} payload bytes`} className={cell} inputMode="decimal" defaultValue={r.bytes} onBlur={(e) => { const v = parseNum(e.target.value); if (v >= 0) set(i, { bytes: v }); }} /></td>
              <td><button type="button" className="fm-btn fm-btn--tool !h-8" disabled={state.rows.length <= 1} onClick={() => act("removeRow", i)} aria-label={`Remove ${r.name}`}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div><button type="button" className="fm-btn fm-btn--tool !h-8" disabled={state.rows.length >= MAX_ROWS} onClick={() => act("addRow")}>+ Add action</button> <span className="fm-help">Numbers accept k, M, B: 300k, 2.5M.</span></div>
      <dl className="grid gap-px border border-ink bg-ink sm:grid-cols-2" style={{ borderRadius: 2 }}>
        {outs.map((o) => (
          <div key={o.key} className="grid gap-1 bg-surface p-3">
            <dt className="fm-cap">{o.label}</dt>
            <dd className="font-mono text-[20px] font-medium tabular-nums">{fmt(o)}</dd>
            <dd className="font-mono text-[12px] text-ink-muted">{o.formula}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Drills({ state, config, t, act }: Pick<ViewProps<EstConfig, EstState>, "state" | "config" | "t" | "act">) {
  const [qps, setQps] = useState("");
  const [tb, setTb] = useState("");
  if (state.drill === null) {
    return (
      <div className="grid gap-3">
        <p className="fm-help">Each drill hides the calculator. Estimate peak QPS and new storage per year; within ±50% passes. Scenario numbers are illustrative assumptions, not real company figures.</p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {DRILLS.map((d, i) => {
            const r = state.results[d.id];
            return (
              <li key={d.id}>
                <button type="button" className="fm-card grid w-full gap-1 p-3 text-left" onClick={() => { setQps(""); setTb(""); act("openDrill", i); }}>
                  <span className="font-semibold">{i + 1}. {d.name}</span>
                  <span className="fm-cap">{r ? (r.passed ? `✓ Passed in ${Math.round(r.ms / 1000)} s` : "✗ Try again") : "Not tried"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }
  const d = DRILLS[state.drill];
  const a = drillAnswer(d, config);
  const res = state.results[d.id];
  // Only show feedback for an answer given since this drill was opened, so reopening doesn't reveal the model answer.
  const done = res?.opening === state.opening;
  const secs = Math.floor((t - state.drillStart) / 1000);
  const peakOut = a.outs.find((o) => o.key === "peak")!, yearOut = a.outs.find((o) => o.key === "year")!;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("openDrill", null)}>← All drills</button>
        <span className="fm-cap ml-auto tabular-nums">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} elapsed · press Play to run the clock</span>
      </div>
      <h3 className="fm-h4">{d.name}</h3>
      <p className="text-[16px]">{d.story} Peak factor {d.config.peakFactor}.</p>
      <p className="fm-help">Illustrative assumptions for practice, not real company figures.</p>
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); act("submit", { qps: parseNum(qps), tb: parseNum(tb), config }); }}>
        <label className="fm-field !min-w-0">Peak QPS (all actions)<input className="fm-input fm-input--mono" inputMode="decimal" placeholder="e.g. 150k" value={qps} onChange={(e) => setQps(e.target.value)} required /></label>
        <label className="fm-field !min-w-0">New storage per year, TB (one copy)<input className="fm-input fm-input--mono" inputMode="decimal" placeholder="e.g. 40" value={tb} onChange={(e) => setTb(e.target.value)} required /></label>
        <button type="submit" className="fm-btn fm-btn--primary !h-10">Check</button>
      </form>
      {done && res && (
        <div className="fm-card grid gap-2 p-3" aria-live="polite">
          <p className="font-semibold">{res.passed ? "✓ Within ±50% on both." : "✗ At least one estimate is off by more than 50%."}</p>
          <p className="font-mono text-[13px]">Peak QPS: you {fmt({ value: res.qps, unit: "qps" })} · model {fmt(peakOut)}<br />Storage/year: you {fmtBytes(res.tb * 1e12)} · model {fmt(yearOut)}</p>
          <p className="font-mono text-[12px] text-ink-muted">{a.outs.find((o) => o.key === "avg")!.formula}<br />{peakOut.formula}<br />{a.outs.find((o) => o.key === "day")!.formula}<br />{yearOut.formula}</p>
          <p className="text-[15px]">{d.reasoning}</p>
        </div>
      )}
    </div>
  );
}
