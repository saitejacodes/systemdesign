"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Copy, FileUp, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTable } from "@/lib/db/hooks";
import type { Design } from "@/lib/db/types";
import { importJson } from "@/lib/studio/serialize";
import { TEMPLATES, templateById, type StudioTemplate } from "@/lib/studio/templates";
import { dateTimeOf } from "./EditorParts";
import { summaryText } from "./ops";
import { createDesign, deleteDesign, designGraph, duplicateDesign } from "./store";

const DIFFICULTY = ["", "Starter", "Intermediate", "Advanced"] as const;

/** /studio: saved designs, new (blank or from a template), duplicate, delete, import. */
export function StudioHome({ caseStudies }: { caseStudies: Record<string, string> }) {
  const router = useRouter();
  const designs = useTable("designs");
  const [pickOpen, setPickOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Design | null>(null);
  const [importErrors, setImportErrors] = useState<{ file: string; errors: string[] } | null>(null);
  const [status, setStatus] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const open = async (p: Promise<Design>) => { const d = await p; router.push(`/studio/${d.id}`); };
  const fromTemplate = (t: StudioTemplate) => { setPickOpen(false); void open(createDesign({ template: t })); };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    setImportErrors(null);
    const r = importJson(await f.text());
    if (file.current) file.current.value = "";
    if (!r.ok) { setImportErrors({ file: f.name, errors: r.errors }); return; }
    const d = await createDesign({ imported: r.design });
    setStatus(`Imported “${d.title}”.`);
  };

  const sorted = designs ? [...designs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : undefined;
  const origin = (d: Design) => {
    const t = d.panels?.templateId ? templateById(d.panels.templateId) : undefined;
    if (d.caseStudyId && caseStudies[d.caseStudyId]) return `Case study · ${caseStudies[d.caseStudyId]}`;
    if (t) return `Template · ${t.title}`;
    return "Blank design";
  };

  return (
    <div className="grid gap-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--primary" onClick={() => void open(createDesign())}><Plus size={16} aria-hidden /> New design</button>
        <button type="button" className="fm-btn" onClick={() => setPickOpen(true)}><LayoutTemplate size={16} aria-hidden /> New from template</button>
        <button type="button" className="fm-btn" onClick={() => file.current?.click()}><FileUp size={16} aria-hidden /> Import JSON</button>
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Import a design JSON file" tabIndex={-1} onChange={(e) => void onImport(e.target.files?.[0])} />
        <p className="fm-cap" role="status" aria-live="polite">{status}</p>
      </div>

      {importErrors && (
        <div className="fm-box" role="alert">
          <div className="fm-box__head" style={{ color: "var(--status-over)" }}><span className="fm-box__glyph" aria-hidden>■</span> Could not import {importErrors.file}</div>
          <div className="fm-box__body grid gap-2">
            <ul className="!grid gap-1 font-mono text-[13px]">{importErrors.errors.map((e) => <li key={e} className="!block">{e}</li>)}</ul>
            <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={() => setImportErrors(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {sorted === undefined ? (
        <p className="fm-cap">Loading designs…</p>
      ) : sorted.length === 0 ? (
        <div className="fm-card fm-grid grid gap-3 p-8" data-testid="studio-empty">
          <p className="fm-h4">No designs yet</p>
          <p className="max-w-[60ch] text-ink-muted">Start from a blank canvas, or pick a case-study template: it places the givens (the users, any third party the problem fixes) and fills the notes with the problem and the 7-step framework, and you draw the rest.</p>
        </div>
      ) : (
        <table className="fm-parts" aria-label="Saved designs">
          <caption>Saved designs · {sorted.length}</caption>
          <thead>
            <tr><th>Design</th><th className="max-md:hidden">Started from</th><th className="max-sm:hidden">Updated</th><th className="qty">Actions</th></tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const g = designGraph(d);
              return (
                <tr key={d.id}>
                  <td className="!normal-case">
                    <Link href={`/studio/${d.id}`} className="font-sans text-[15px] font-semibold tracking-normal text-ink underline-offset-2 hover:underline">{d.title}</Link>
                    <span className="block text-ink-muted">{g ? summaryText(g) : "Unreadable data"}</span>
                    <span className="block text-ink-muted sm:hidden">{dateTimeOf(d.updatedAt)}</span>
                  </td>
                  <td className="max-md:hidden !normal-case">{origin(d)}</td>
                  <td className="max-sm:hidden !normal-case">{dateTimeOf(d.updatedAt)}</td>
                  <td className="qty">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className="fm-btn fm-btn--tool !px-2" aria-label={`Duplicate ${d.title}`} title="Duplicate" onClick={() => void duplicateDesign(d).then((c) => setStatus(`Duplicated as “${c.title}”.`))}><Copy size={14} aria-hidden /></button>
                      <button type="button" className="fm-btn fm-btn--tool fm-btn--danger !px-2" aria-label={`Delete ${d.title}`} title="Delete" onClick={() => setToDelete(d)}><Trash2 size={14} aria-hidden /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="fm-h4">New from template</DialogTitle>
          <DialogDescription>Each template starts the canvas and the notes for one problem.</DialogDescription>
          <ul className="grid gap-2">
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <button type="button" className="fm-opt !grid-cols-[1fr_auto]" onClick={() => fromTemplate(t)}>
                  <span>
                    <span className="block font-semibold">{t.title}</span>
                    <span className="block text-[14px] text-ink-muted">{t.summary}</span>
                  </span>
                  <span className="fm-cap">{DIFFICULTY[t.difficulty]}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogTitle className="fm-h4">Delete “{toDelete?.title}”?</DialogTitle>
          <DialogDescription>The design and its version history are removed from this browser. This cannot be undone; export it as JSON first if you want a copy.</DialogDescription>
          <div className="flex justify-end gap-2">
            <button type="button" className="fm-btn fm-btn--tool" onClick={() => setToDelete(null)}>Cancel</button>
            <button type="button" className="fm-btn fm-btn--tool fm-btn--danger" onClick={() => { const d = toDelete; setToDelete(null); if (d) void deleteDesign(d.id).then(() => setStatus(`Deleted “${d.title}”.`)); }}>Delete design</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
