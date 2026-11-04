"use client";
import { Lightbulb, Plus, Trash2, X } from "lucide-react";
import type { CaseStudyMeta } from "@/lib/content/schemas";
import { miniEstimate } from "@/lib/interview/estimate";
import { stepHints } from "@/lib/interview/hints";
import { formatClock, revealSchedule, revealedCount } from "@/lib/interview/timing";
import { DB_CHOICES, HTTP_METHODS, KEY_ROLES, type Endpoint, type Entity, type InterviewSession, type Step } from "@/lib/interview/types";
import { ListEditor, NumberField, Select, SubHead, TextArea } from "./fields";

export type Update = (fn: (s: InterviewSession) => InterviewSession) => void;
export interface PanelProps { meta: CaseStudyMeta; s: InterviewSession; set: Update; elapsed: number; readOnly?: boolean }

const STEP_INTRO: Record<Step, string> = {
  Requirements: "Ask before you design. Write down what the system must do and how well.",
  Estimation: "Turn the answers into numbers: requests per second, storage and bandwidth.",
  API: "The endpoints each request type calls, with what goes in and comes out.",
  "Data Model": "Entities, their keys, and the database that serves the access patterns.",
  "High-Level Design": "Draw it in the canvas, then walk each request type through it here.",
  "Deep Dives": "The interviewer pushes on your design. Questions appear during this step's window.",
  "Wrap-up": "Bottlenecks at 10×, the trade-offs you made, and what you would monitor.",
};

export function StepPanel(p: PanelProps & { step: Step }) {
  return (
    <div className="grid gap-4">
      <p className="text-[15px] text-ink-muted">{STEP_INTRO[p.step]}</p>
      {p.step === "Requirements" && <Requirements {...p} />}
      {p.step === "Estimation" && <Estimation {...p} />}
      {p.step === "API" && <Api {...p} />}
      {p.step === "Data Model" && <DataModel {...p} />}
      {p.step === "High-Level Design" && <TextArea label="Walkthrough of each request type" rows={8} value={p.s.highLevel} readOnly={p.readOnly} onChange={(v) => p.set((s) => ({ ...s, highLevel: v }))} placeholder="Read: client → load balancer → …" />}
      {p.step === "Deep Dives" && <DeepDives {...p} />}
      {p.step === "Wrap-up" && <TextArea label="Bottlenecks, trade-offs, monitoring" rows={8} value={p.s.wrapUp} readOnly={p.readOnly} onChange={(v) => p.set((s) => ({ ...s, wrapUp: v }))} />}
      {p.s.hintsOn && <Hints {...p} />}
    </div>
  );
}

function Hints({ meta, s, set, step, readOnly }: PanelProps & { step: Step }) {
  const hints = stepHints(meta, step, s.requirements.asked);
  const used = s.hints[step];
  const mock = s.mode === "mock";
  return (
    <section aria-label={`Hints for ${step}`} className="grid gap-2 border-t border-line pt-3">
      {hints.slice(0, used).map((h, i) => (
        <p key={i} className="flex gap-2 text-[15px]" data-testid="hint"><Lightbulb size={16} className="mt-0.5 shrink-0 text-cobalt" aria-hidden /><span><span className="fm-cap">Hint {i + 1} · </span>{h}</span></p>
      ))}
      {used < 2 && !readOnly && (
        <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={() => set((x) => ({ ...x, hints: { ...x.hints, [step]: Math.min(2, x.hints[step] + 1) } }))}>
          <Lightbulb size={14} aria-hidden /> Show hint {used + 1} of 2{mock ? " · costs 1 point" : ""}
        </button>
      )}
    </section>
  );
}

function Requirements({ meta, s, set, readOnly }: PanelProps) {
  const r = s.requirements;
  const put = (patch: Partial<typeof r>) => set((x) => ({ ...x, requirements: { ...x.requirements, ...patch } }));
  return (
    <>
      <section className="grid gap-2" aria-labelledby="cq-h">
        <SubHead><span id="cq-h">Clarifying questions · asked {r.asked.length}/{meta.clarifyingQuestions.length}</span></SubHead>
        <ul className="grid gap-1.5">
          {meta.clarifyingQuestions.map((q, i) => {
            const open = r.asked.includes(i);
            return (
              <li key={i} className="grid gap-1">
                <button
                  type="button"
                  className={`fm-btn fm-btn--tool !h-auto justify-start whitespace-normal py-1.5 text-left !normal-case !tracking-normal ${open ? "!border-cobalt" : ""}`}
                  aria-expanded={open}
                  disabled={readOnly && !open}
                  onClick={() => { if (!open && !readOnly) put({ asked: [...r.asked, i] }); }}
                >
                  <span className="font-sans text-[14px]">{q.question}</span>
                </button>
                {open && <p className="border-l-2 border-cobalt pl-3 text-[15px]" data-testid="clarifying-answer"><span className="fm-cap">Interviewer · </span>{q.answer}</p>}
              </li>
            );
          })}
        </ul>
      </section>
      <ListEditor label="Functional requirements" items={r.functional} readOnly={readOnly} onChange={(v) => put({ functional: v })} placeholder="Users can …" />
      <ListEditor label="Non-functional requirements" items={r.nonFunctional} readOnly={readOnly} onChange={(v) => put({ nonFunctional: v })} placeholder="p99 under … ms" />
    </>
  );
}

function Estimation({ s, set, readOnly }: PanelProps) {
  const e = s.estimation;
  const put = (k: keyof typeof e) => (v: number) => set((x) => ({ ...x, estimation: { ...x.estimation, [k]: v } }));
  const out = miniEstimate(e);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Daily users" unit="millions" value={e.dauM} onChange={put("dauM")} readOnly={readOnly} />
        <NumberField label="Actions / user / day" value={e.actionsPerDay} onChange={put("actionsPerDay")} readOnly={readOnly} />
        <NumberField label="Reads per write" value={e.readsPerWrite} onChange={put("readsPerWrite")} readOnly={readOnly} />
        <NumberField label="Item size" unit="bytes" value={e.itemBytes} onChange={put("itemBytes")} readOnly={readOnly} />
        <NumberField label="Retention" unit="years" value={e.retentionYears} onChange={put("retentionYears")} readOnly={readOnly} />
        <NumberField label="Peak factor" unit="×" value={e.peakFactor} onChange={put("peakFactor")} readOnly={readOnly} />
      </div>
      <dl className="grid gap-0 border border-ink" style={{ borderRadius: 2 }} aria-label="Estimates" data-testid="estimates">
        {out.rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_auto] gap-x-2 border-b border-line px-2 py-1.5 last:border-b-0">
            <dt className="fm-cap self-center">{r.label}</dt>
            <dd className="font-mono text-[14px] tabular-nums">{r.value}</dd>
            <dd className="col-span-2 break-words font-mono text-[11px] text-ink-muted">{r.formula}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function Api({ s, set, readOnly }: PanelProps) {
  const put = (api: Endpoint[]) => set((x) => ({ ...x, api }));
  const edit = (i: number, patch: Partial<Endpoint>) => put(s.api.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <>
      <ol className="grid gap-3" aria-label="Endpoints">
        {s.api.map((e, i) => (
          <li key={i} className="grid gap-2 border border-ink p-2" style={{ borderRadius: 2 }} aria-label={`Endpoint ${i + 1}: ${e.method} ${e.path || "(no path)"}`}>
            <div className="grid grid-cols-[6.5rem_1fr_auto] items-end gap-2">
              <Select label="Method" value={e.method} options={HTTP_METHODS} readOnly={readOnly} onChange={(v) => edit(i, { method: v })} />
              <PathInput value={e.path} readOnly={readOnly} onChange={(v) => edit(i, { path: v })} n={i + 1} />
              {!readOnly && <button type="button" className="fm-btn fm-btn--tool !h-9 !px-2" aria-label={`Remove endpoint ${i + 1}`} onClick={() => put(s.api.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden /></button>}
            </div>
            <TextArea label="Request" rows={2} value={e.request} readOnly={readOnly} onChange={(v) => edit(i, { request: v })} placeholder="{ … } or headers" />
            <TextArea label="Response" rows={2} value={e.response} readOnly={readOnly} onChange={(v) => edit(i, { response: v })} placeholder="200 { … }" />
          </li>
        ))}
      </ol>
      {s.api.length === 0 && <p className="fm-help">No endpoints yet.</p>}
      {!readOnly && s.api.length < 20 && (
        <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={() => put([...s.api, { method: "GET", path: "", request: "", response: "" }])}><Plus size={14} aria-hidden /> Add endpoint</button>
      )}
    </>
  );
}

function PathInput({ value, onChange, readOnly, n }: { value: string; onChange: (v: string) => void; readOnly?: boolean; n: number }) {
  const id = `api-path-${n}`;
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="fm-label">Path</label>
      <input id={id} className="fm-input fm-input--mono !h-9 min-w-0" value={value} readOnly={readOnly} maxLength={200} placeholder="/v1/…" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DataModel({ s, set, readOnly }: PanelProps) {
  const dm = s.dataModel;
  const put = (patch: Partial<typeof dm>) => set((x) => ({ ...x, dataModel: { ...x.dataModel, ...patch } }));
  const editEntity = (i: number, e: Entity) => put({ entities: dm.entities.map((x, j) => (j === i ? e : x)) });
  return (
    <>
      <ol className="grid gap-3" aria-label="Entities">
        {dm.entities.map((en, i) => (
          <li key={i} className="grid gap-2 border border-ink p-2" style={{ borderRadius: 2 }}>
            <div className="flex items-end gap-2">
              <div className="grid min-w-0 flex-1 gap-1">
                <label htmlFor={`ent-${i}`} className="fm-label">Entity {i + 1}</label>
                <input id={`ent-${i}`} className="fm-input !h-9" value={en.name} readOnly={readOnly} maxLength={80} placeholder="Name" onChange={(e) => editEntity(i, { ...en, name: e.target.value })} />
              </div>
              {!readOnly && <button type="button" className="fm-btn fm-btn--tool !h-9 !px-2" aria-label={`Remove entity ${en.name || i + 1}`} onClick={() => put({ entities: dm.entities.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden /></button>}
            </div>
            {en.fields.length > 0 && (
              <ul className="grid gap-1.5" aria-label={`Fields of ${en.name || `entity ${i + 1}`}`}>
                {en.fields.map((f, k) => {
                  const setF = (patch: Partial<typeof f>) => editEntity(i, { ...en, fields: en.fields.map((x, m) => (m === k ? { ...x, ...patch } : x)) });
                  return (
                    <li key={k} className="grid grid-cols-[1fr_1fr_6rem_auto] items-end gap-1.5 max-sm:grid-cols-[1fr_1fr_auto]">
                      <div className="grid min-w-0 gap-1"><label htmlFor={`f-${i}-${k}`} className="sr-only">Field {k + 1} name</label><input id={`f-${i}-${k}`} className="fm-input fm-input--mono !h-8 !px-2 !text-[13px]" value={f.name} readOnly={readOnly} placeholder="field" onChange={(e) => setF({ name: e.target.value })} /></div>
                      <div className="grid min-w-0 gap-1"><label htmlFor={`t-${i}-${k}`} className="sr-only">Field {k + 1} type</label><input id={`t-${i}-${k}`} className="fm-input fm-input--mono !h-8 !px-2 !text-[13px]" value={f.type} readOnly={readOnly} placeholder="type" onChange={(e) => setF({ type: e.target.value })} /></div>
                      <div className="grid min-w-0 gap-1 max-sm:col-span-2 max-sm:row-start-2">
                        <label htmlFor={`k-${i}-${k}`} className="sr-only">Field {k + 1} key</label>
                        <select id={`k-${i}-${k}`} className="fm-input fm-input--mono !h-8 !px-1 !text-[12px]" value={f.key} disabled={readOnly} onChange={(e) => setF({ key: e.target.value as typeof f.key })}>
                          {KEY_ROLES.map((r) => <option key={r} value={r}>{r ? `${r} key` : "no key"}</option>)}
                        </select>
                      </div>
                      {!readOnly && <button type="button" className="fm-btn fm-btn--tool !h-8 !px-1.5" aria-label={`Remove field ${f.name || k + 1}`} onClick={() => editEntity(i, { ...en, fields: en.fields.filter((_, m) => m !== k) })}><X size={12} aria-hidden /></button>}
                    </li>
                  );
                })}
              </ul>
            )}
            {!readOnly && en.fields.length < 30 && <button type="button" className="fm-btn fm-btn--tool !h-8 justify-self-start" onClick={() => editEntity(i, { ...en, fields: [...en.fields, { name: "", type: "string", key: "" }] })}><Plus size={12} aria-hidden /> Field</button>}
          </li>
        ))}
      </ol>
      {!readOnly && dm.entities.length < 12 && <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={() => put({ entities: [...dm.entities, { name: "", fields: [{ name: "id", type: "string", key: "primary" }] }] })}><Plus size={14} aria-hidden /> Add entity</button>}
      <Select label="Database" value={dm.db} options={DB_CHOICES} readOnly={readOnly} onChange={(v) => put({ db: v })} />
      <TextArea label="Why this database" rows={3} value={dm.justification} readOnly={readOnly} onChange={(v) => put({ justification: v })} placeholder="Access pattern, consistency, scale; the alternative and why it lost" />
    </>
  );
}

function DeepDives({ meta, s, set, elapsed, readOnly }: PanelProps) {
  const n = meta.deepDiveQuestions.length;
  const shown = readOnly ? n : revealedCount(n, s.durationMin, elapsed, s.deepDivesOpenedAt, s.deepDivesRequested);
  const next = revealSchedule(n, s.durationMin, s.deepDivesOpenedAt)[shown];
  return (
    <>
      <ol className="grid gap-3" aria-label="Deep-dive questions" aria-live="polite">
        {meta.deepDiveQuestions.slice(0, shown).map((q, i) => (
          <li key={i} className="grid gap-1.5" data-testid="deep-dive">
            <p className="border-l-2 border-cobalt pl-3 text-[15px]"><span className="fm-cap">Interviewer · Q{i + 1} · </span>{q}</p>
            <TextArea label={`Your answer to Q${i + 1}`} rows={3} value={s.deepDiveAnswers[i] ?? ""} readOnly={readOnly} onChange={(v) => set((x) => ({ ...x, deepDiveAnswers: { ...x.deepDiveAnswers, [i]: v } }))} />
          </li>
        ))}
      </ol>
      {shown < n && !readOnly && (
        <div className="grid gap-2">
          {next !== undefined && <p className="fm-help">Question {shown + 1} of {n} arrives at {formatClock(s.durationMin * 60_000 - next)} remaining.</p>}
          {s.mode === "practice" && <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={() => set((x) => ({ ...x, deepDivesRequested: Math.max(x.deepDivesRequested, shown) + 1 }))}>Ask the next question now</button>}
        </div>
      )}
    </>
  );
}
