"use client";
import { useId, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";

/** A labelled text area that grows with the step panel. */
export function TextArea({ label, value, onChange, rows = 4, readOnly, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; readOnly?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="fm-label">{label}</label>
      <textarea id={id} className="fm-input !h-auto py-2 leading-snug" rows={rows} value={value} readOnly={readOnly} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function NumberField({ label, value, onChange, unit, step = "any", readOnly }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: string; readOnly?: boolean }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) { setSynced(value); setText(String(value)); }
  const n = Number(text);
  const bad = text.trim() === "" || !Number.isFinite(n) || n < 0;
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="fm-label">{label}{unit ? ` (${unit})` : ""}</label>
      <input
        id={id}
        className={`fm-input fm-input--mono !h-9 ${bad ? "is-error" : ""}`}
        inputMode="decimal"
        type="number"
        min={0}
        step={step}
        value={text}
        readOnly={readOnly}
        aria-invalid={bad}
        onChange={(e) => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= 0) { setSynced(v); onChange(v); } }}
      />
    </div>
  );
}

/** A list of short strings with an add box (Enter adds) and a remove button per item. */
export function ListEditor({ label, items, onChange, readOnly, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; readOnly?: boolean; placeholder: string }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (!t) return; onChange([...items, t.slice(0, 500)]); setDraft(""); };
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="fm-label">{label} · {items.length}</label>
      {items.length > 0 && (
        <ul className="grid gap-1" aria-label={label}>
          {items.map((t, i) => (
            <li key={`${i}-${t}`} className="flex items-start gap-2 border-b border-line py-1 text-[15px]">
              <span className="fm-cap mt-0.5 w-5 shrink-0">{i + 1}.</span>
              <span className="min-w-0 flex-1 break-words">{t}</span>
              {!readOnly && <button type="button" className="fm-btn fm-btn--tool !h-7 !px-1.5" aria-label={`Remove "${t}"`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={12} aria-hidden /></button>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <input id={id} className="fm-input !h-9 min-w-0 flex-1" value={draft} placeholder={placeholder} maxLength={500} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" className="fm-btn fm-btn--tool !h-9" onClick={add} disabled={!draft.trim()} aria-label={`Add to ${label}`}><Plus size={14} aria-hidden /> Add</button>
        </div>
      )}
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange, readOnly, className = "" }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; readOnly?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={`grid min-w-0 gap-1 ${className}`}>
      <label htmlFor={id} className="fm-label">{label}</label>
      <select id={id} className="fm-input fm-input--mono !h-9 !px-2" value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    </div>
  );
}

export function SubHead({ children }: { children: ReactNode }) {
  return <h4 className="fm-cap border-b border-ink pb-1 !text-ink">{children}</h4>;
}
