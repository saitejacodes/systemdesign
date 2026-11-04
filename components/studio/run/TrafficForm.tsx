"use client";
import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CATALOG } from "@/lib/studio/catalog";
import { TrafficProfile, type RequestType } from "@/lib/studio/sim/types";
import type { ComponentKind, StudioGraph } from "@/lib/studio/types";
import { fmtQps } from "./config";

/** A number field that keeps what you type and reports only values inside [min, max]. */
function Num({ label, value, min, max, unit, help, onValid }: { label: string; value: number; min: number; max: number; unit?: string; help?: string; onValid: (v: number) => void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); if (Number(text) !== value) setText(String(value)); }
  const v = text.trim() === "" ? NaN : Number(text);
  const error = !Number.isFinite(v) ? `${label} must be a number` : v < min ? `${label} must be at least ${min}` : v > max ? `${label} must be at most ${max}` : "";
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="fm-label">{label}{unit ? ` (${unit})` : ""}</label>
      <input id={id} type="text" inputMode="decimal" className={`fm-input fm-input--mono !h-9 ${error ? "is-error" : ""}`} value={text} aria-invalid={!!error}
        aria-describedby={error ? `${id}-e` : help ? `${id}-h` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onValid(n);
        }} />
      {error ? <p id={`${id}-e`} className="fm-help is-error" role="alert">■ {error} · not applied</p> : help ? <p id={`${id}-h`} className="fm-help">{help}</p> : null}
    </div>
  );
}

const TARGETABLE = (k: string) => k !== "client" && k !== "frame" && k !== "note";

export function TrafficForm({ graph, profile, onChange, peak, onPeak, onResetDefault, defaultFrom }: {
  graph: StudioGraph; profile: TrafficProfile; onChange: (p: TrafficProfile) => void;
  peak: boolean; onPeak: (on: boolean) => void; onResetDefault: () => void; defaultFrom: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(profile);
  const [seen, setSeen] = useState(profile);
  if (profile !== seen) { setSeen(profile); setDraft(profile); }
  const [error, setError] = useState("");

  const update = (next: TrafficProfile) => {
    setDraft(next);
    const r = TrafficProfile.safeParse(next);
    if (r.success) { setError(""); onChange(r.data); }
    else setError(r.error.issues[0]?.path.join(".").replace(/^requestTypes\.(\d+)/, (_, i) => `Request type ${Number(i) + 1}`) + ": " + (r.error.issues[0]?.message ?? "invalid"));
  };
  const setType = (i: number, patch: Partial<RequestType>) => update({ ...draft, requestTypes: draft.requestTypes.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const kinds = [...new Set(graph.nodes.map((n) => n.kind).filter(TARGETABLE))] as ComponentKind[];
  const nodes = graph.nodes.filter((n) => TARGETABLE(n.kind));
  const writes = draft.qps / (draft.readWriteRatio + 1);
  const total = draft.qps * (peak ? draft.peakMultiplier : 1);

  return (
    <div className="grid gap-4 p-3">
      <p className="fm-help">Saved with this design. Defaults come from {defaultFrom}.</p>
      <Num label="Average QPS" value={draft.qps} min={0.001} max={100_000_000} unit="req/s" help="Total from all clients, split by each client's Users." onValid={(v) => update({ ...draft, qps: v })} />
      <Num label="Reads per write" value={draft.readWriteRatio} min={0.001} max={1_000_000} help={`${fmtQps(draft.qps - writes)} reads/s and ${fmtQps(writes)} writes/s at average load.`} onValid={(v) => update({ ...draft, readWriteRatio: v })} />
      <Num label="Peak multiplier" value={draft.peakMultiplier} min={1} max={100} unit="×" onValid={(v) => update({ ...draft, peakMultiplier: v })} />
      <button type="button" role="switch" aria-checked={peak} className="fm-toggle justify-self-start" onClick={() => onPeak(!peak)}>
        <span className="track" aria-hidden /> Peak traffic <span className="state">{peak ? "On" : "Off"}</span>
      </button>
      <p className="fm-cap">Offered now: <span className="sdl-num">{fmtQps(total)} QPS</span>{peak ? ` (${draft.peakMultiplier}× peak)` : ""}</p>

      <fieldset className="grid gap-3">
        <legend className="fm-cap mb-2">Request types · {draft.requestTypes.length}/3</legend>
        {draft.requestTypes.map((t, i) => {
          const tid = `${id}-${i}`;
          const byNode = !!t.target.nodeId;
          return (
            <div key={t.id} className="grid gap-2 border border-line p-2.5" style={{ borderRadius: 2 }} role="group" aria-label={`Request type ${i + 1}: ${t.name}`}>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div className="grid gap-1.5">
                  <label htmlFor={`${tid}-n`} className="fm-label">Name</label>
                  <input id={`${tid}-n`} className="fm-input !h-9" maxLength={60} value={t.name} onChange={(e) => setType(i, { name: e.target.value })} />
                </div>
                <button type="button" className="fm-btn fm-btn--tool fm-btn--danger !px-2" aria-label={`Remove request type ${t.name || i + 1}`} disabled={draft.requestTypes.length <= 1}
                  onClick={() => update({ ...draft, requestTypes: draft.requestTypes.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <label htmlFor={`${tid}-o`} className="fm-label">Operation</label>
                  <select id={`${tid}-o`} className="fm-input !h-9" value={t.op} onChange={(e) => setType(i, { op: e.target.value as RequestType["op"] })}>
                    <option value="read">read</option><option value="write">write</option>
                  </select>
                </div>
                <Num label="Weight" value={t.weight} min={0.001} max={1_000_000} onValid={(v) => setType(i, { weight: v })} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${tid}-m`} className="fm-label">Goes to</label>
                <select id={`${tid}-m`} className="fm-input !h-9" value={byNode ? "node" : "kinds"}
                  onChange={(e) => setType(i, { target: e.target.value === "node" ? { nodeId: nodes[0]?.id ?? "" } : { kinds: kinds.length ? [kinds[0]] : ["service"] } })}>
                  <option value="kinds">Any component of these kinds</option>
                  <option value="node">One specific component</option>
                </select>
              </div>
              {byNode ? (
                <div className="grid gap-1.5">
                  <label htmlFor={`${tid}-t`} className="fm-label">Component</label>
                  <select id={`${tid}-t`} className="fm-input !h-9" value={t.target.nodeId} onChange={(e) => setType(i, { target: { nodeId: e.target.value } })}>
                    {!nodes.some((n) => n.id === t.target.nodeId) && <option value={t.target.nodeId}>Missing component ({t.target.nodeId})</option>}
                    {nodes.map((n) => <option key={n.id} value={n.id}>{n.label || CATALOG[n.kind as ComponentKind].title} · {CATALOG[n.kind as ComponentKind].title}</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="Destination kinds">
                  {[...new Set([...kinds, ...(t.target.kinds ?? [])])].map((k) => {
                    const on = t.target.kinds?.includes(k) ?? false;
                    return (
                      <label key={k} className="fm-check !items-center text-[13px]">
                        <input type="checkbox" checked={on} onChange={() => setType(i, { target: { kinds: on ? (t.target.kinds ?? []).filter((x) => x !== k) : [...(t.target.kinds ?? []), k] } })} />
                        <span>{CATALOG[k].title}{kinds.includes(k) ? "" : " (none on canvas)"}</span>
                      </label>
                    );
                  })}
                  {kinds.length === 0 && <p className="fm-help">Add components to the design to route traffic to them.</p>}
                </div>
              )}
            </div>
          );
        })}
        {draft.requestTypes.length < 3 && (
          <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={() => {
            const taken = new Set(draft.requestTypes.map((t) => t.id));
            let n = draft.requestTypes.length + 1;
            while (taken.has(`type-${n}`)) n++;
            update({ ...draft, requestTypes: [...draft.requestTypes, { id: `type-${n}`, name: `Request ${n}`, op: "read", weight: 1, target: { kinds: kinds.length ? [kinds[0]] : ["service"] } }] });
          }}><Plus size={14} aria-hidden /> Add request type</button>
        )}
      </fieldset>
      {error && <p className="fm-help is-error" role="alert">■ {error} · not applied</p>}
      <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={onResetDefault}>Reset to default traffic</button>
    </div>
  );
}
