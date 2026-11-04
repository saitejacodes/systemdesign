"use client";
import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, Pencil } from "lucide-react";
import type { DesignVersion } from "@/lib/db/types";
import { StudioGraph } from "@/lib/studio/types";
import { summaryText } from "./ops";

export const timeOf = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
export const dateTimeOf = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The design title as the page h1, renamed inline (Enter saves, Esc cancels). */
export function TitleEditor({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  const done = (save: boolean) => {
    setEditing(false);
    const t = draft.trim().slice(0, 200);
    if (save && t && t !== title) onRename(t);
  };
  if (editing) {
    return (
      <input
        ref={input}
        aria-label="Design title"
        className="fm-input !h-9 min-w-0 max-w-[420px] flex-1 font-heading !text-[18px] font-extrabold"
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") { e.stopPropagation(); done(false); } }}
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <h1 className="truncate font-heading text-[20px] font-extrabold leading-tight tracking-[-.02em]" title={title} onDoubleClick={() => { setDraft(title); setEditing(true); }}>{title}</h1>
      <button type="button" className="fm-btn fm-btn--tool !h-7 !px-1.5" aria-label="Rename design" title="Rename" onClick={() => { setDraft(title); setEditing(true); }}>
        <Pencil size={14} aria-hidden />
      </button>
    </div>
  );
}

export type ExportKind = "png-paper" | "png-blueprint" | "svg-paper" | "svg-blueprint" | "json";
const EXPORTS: { k: ExportKind; label: string; note: string }[] = [
  { k: "png-paper", label: "PNG · Paper", note: "2×" },
  { k: "png-blueprint", label: "PNG · Blueprint", note: "2×" },
  { k: "svg-paper", label: "SVG · Paper", note: "vector" },
  { k: "svg-blueprint", label: "SVG · Blueprint", note: "vector" },
  { k: "json", label: "JSON", note: "re-import" },
];

export function ExportMenu({ onExport }: { onExport: (k: ExportKind) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const i = items.current.findIndex((b) => b === document.activeElement);
    if (e.key === "Escape") { e.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLButtonElement>("[aria-haspopup]")?.focus(); }
    if (e.key === "ArrowDown") { e.preventDefault(); items.current[(i + 1) % EXPORTS.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items.current[(i - 1 + EXPORTS.length) % EXPORTS.length]?.focus(); }
  };
  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button type="button" className="fm-btn fm-btn--tool" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        Export <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div id={id} role="menu" aria-label="Export design" className="sdl-menu">
          {EXPORTS.map((x, i) => (
            <button key={x.k} ref={(el) => { items.current[i] = el; }} type="button" role="menuitem" tabIndex={-1} onClick={() => { setOpen(false); onExport(x.k); }}>
              <span>{x.label}</span><span aria-hidden className="opacity-70">{x.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotesTab({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="fm-cap flex-1">Design notes · Markdown</span>
        <button type="button" className={`fm-btn fm-btn--tool ${mode === "write" ? "is-on" : ""}`} aria-pressed={mode === "write"} onClick={() => setMode("write")}>Write</button>
        <button type="button" className={`fm-btn fm-btn--tool ${mode === "preview" ? "is-on" : ""}`} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Preview</button>
      </div>
      {mode === "write" ? (
        <textarea aria-label="Design notes (Markdown)" className="fm-input fm-input--mono min-h-[240px] flex-1 resize-none p-3 !text-[13px] leading-relaxed" value={notes} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="lesson min-h-0 flex-1 overflow-y-auto !text-[15px]" data-testid="notes-preview">
          {notes.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown> : <p className="fm-cap">Nothing written yet</p>}
        </div>
      )}
    </div>
  );
}

export function HistoryTab({ versions, onRestore, onSaveVersion }: { versions: DesignVersion[] | undefined; onRestore: (v: DesignVersion) => void; onSaveVersion: () => void }) {
  return (
    <div className="grid gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="fm-cap">Last 20 versions</span>
        <button type="button" className="fm-btn fm-btn--tool" onClick={onSaveVersion}>Save version</button>
      </div>
      <p className="fm-help">Autosave keeps a version at most once a minute. Restoring replaces the canvas and can be undone.</p>
      {versions === undefined ? <p className="fm-cap">Loading…</p> : versions.length === 0 ? <p className="fm-cap">No versions yet</p> : (
        <ol className="grid gap-1.5" aria-label="Saved versions">
          {versions.map((v, i) => {
            const g = StudioGraph.safeParse(v.graph);
            return (
              <li key={v.id} className="flex items-center gap-3 border border-line p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{dateTimeOf(v.createdAt)}{i === 0 ? " · latest" : ""}</p>
                  <p className="fm-cap truncate">{g.success ? summaryText(g.data) : "Unreadable snapshot"}</p>
                </div>
                <button type="button" className="fm-btn fm-btn--tool" disabled={!g.success} onClick={() => onRestore(v)} aria-label={`Restore version from ${dateTimeOf(v.createdAt)}`}>Restore</button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
