"use client";
import type { ViewProps } from "@/lib/sim/definition";
import { LEVELS, SCENARIOS, TECHNIQUES, isDone, scenarioOf, seenBy, sqlOf, stepsOf, type IsoConfig, type IsoState, type Level, type Line, type Technique } from "./model";

const KIND = { ok: "var(--status-ok)", err: "var(--status-over)", wait: "var(--status-hot)", info: "var(--ink-muted)" } as const;
const TAG = { ok: "OK", err: "ERROR", wait: "WAIT", info: "" } as const;

export function IsoView({ state, act }: ViewProps<IsoConfig, IsoState>) {
  const sc = scenarioOf(state.scenario);
  const steps = stepsOf(state);
  const done = isDone(state);
  const next = steps[state.cursor];
  return (
    <div className="grid gap-4 p-3 text-[14px]">
      <fieldset className="grid gap-2">
        <legend className="fm-cap mb-1">Scenario</legend>
        <div className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === state.scenario} className={`fm-btn fm-btn--tool !h-8 ${s.id === state.scenario ? "is-on" : ""}`} onClick={() => act("load", { scenario: s.id })}>
              {state.runs.some((r) => r.scenario === s.id) ? "✓ " : ""}{s.label}
            </button>
          ))}
        </div>
        <p>{sc.story}</p>
        {state.scenario === "lost-update" && (
          <label className="flex flex-wrap items-center gap-2">
            <span className="fm-cap">Technique</span>
            <select className="fm-input !h-8 !w-auto" value={state.technique} onChange={(e) => act("load", { technique: e.target.value as Technique })}>
              {TECHNIQUES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={done} onClick={() => act("step")}>Next step{next ? ` (T${next.s})` : ""}</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={done} onClick={() => act("run")}>Run to end</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("load", {})}>Restart</button>
        <span className="fm-cap">Step {Math.min(state.cursor, steps.length)} / {steps.length} · Play auto-steps</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {([1, 2] as const).map((s) => <Pane key={s} s={s} state={state} act={act} />)}
      </div>

      {state.outcome && (
        <section role="status" aria-label="What happened" className="fm-card grid gap-1 p-3" style={{ borderColor: state.outcome.anomaly ? "var(--status-over)" : "var(--status-ok)", borderWidth: 2 }}>
          <h3 className="font-semibold" style={{ color: state.outcome.anomaly ? "var(--status-over)" : "var(--status-ok)" }}>{state.outcome.anomaly ? "ANOMALY · " : "PREVENTED · "}{state.outcome.title}</h3>
          <p>{state.outcome.text}</p>
        </section>
      )}

      <Versions state={state} />
    </div>
  );
}

function Pane({ s, state, act }: { s: 1 | 2; state: IsoState; act: ViewProps<IsoConfig, IsoState>["act"] }) {
  const sess = state.sessions[s];
  const steps = stepsOf(state);
  const tx = sess.xid !== undefined ? state.txs[sess.xid] : undefined;
  const status = sess.blockedOn ? "WAITING" : tx ? (tx.status === "failed" ? "FAILED" : `IN TX · xid ${tx.xid}`) : "IDLE";
  const upcoming = steps.map((st, i) => ({ st, i })).filter(({ st, i }) => st.s === s && i >= state.cursor);
  return (
    <section aria-label={`Session ${s}`} className="fm-card grid content-start gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="fm-cap !text-ink">Session {s} · T{s}</h3>
        <span className="fm-cap" style={{ color: sess.blockedOn ? KIND.wait : tx?.status === "failed" ? KIND.err : undefined }}>{status}</span>
      </header>
      <label className="flex flex-wrap items-center gap-2">
        <span className="fm-cap">Isolation</span>
        <select className="fm-input !h-8 !w-auto" value={sess.level} onChange={(e) => act("load", { [`level${s}`]: e.target.value as Level })} aria-label={`Session ${s} isolation level`}>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
      </label>
      <ol className="grid gap-1 font-mono text-[12px]">
        {sess.lines.map((l, i) => <Stmt key={i} l={l} />)}
        {upcoming.map(({ st, i }) => (
          <li key={`u${i}`} className="border border-dashed border-line px-2 py-1 opacity-60" style={{ borderRadius: 2 }}>
            <span className="opacity-70">{i + 1}. </span>{sqlOf(st, sess.mem)}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stmt({ l }: { l: Line }) {
  return (
    <li className="border border-ink px-2 py-1" style={{ borderRadius: 2, borderLeft: `4px solid ${KIND[l.kind]}` }}>
      <span className="opacity-70">{l.step + 1}. </span>{l.sql}
      <span className="block" style={{ color: l.kind === "info" ? undefined : KIND[l.kind] }}>{TAG[l.kind] && `${TAG[l.kind]} · `}{l.result.replace(/^ERROR /, "")}</span>
    </li>
  );
}

function Versions({ state }: { state: IsoState }) {
  const status = (x?: number) => (x === undefined ? "" : x === 0 ? "setup" : `xid ${x} ${state.txs[x].status}`);
  const fields = Object.keys(state.versions[0].data);
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">Row versions in {state.table} · xmin created it, xmax replaced it · ● visible to that session now</figcaption>
      <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
        <table className="w-full font-mono text-[12px]">
          <thead><tr>{[...fields, "xmin", "xmax", "T1", "T2"].map((f) => <th key={f} className="whitespace-nowrap border-b border-ink px-2 py-1 text-left">{f}</th>)}</tr></thead>
          <tbody>
            {state.versions.map((v, i) => {
              const dead = state.txs[v.xmin].status === "aborted";
              return (
                <tr key={i} className={dead ? "line-through opacity-60" : undefined}>
                  {fields.map((f) => <td key={f} className="whitespace-nowrap border-b border-line px-2 py-0.5">{String(v.data[f])}</td>)}
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{status(v.xmin)}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{status(v.xmax)}</td>
                  {([1, 2] as const).map((s) => <td key={s} className="border-b border-line px-2 py-0.5" aria-label={seenBy(state, s, v) ? "visible" : "not visible"}>{seenBy(state, s, v) ? "●" : "·"}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
