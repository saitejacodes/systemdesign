"use client";
import { useState } from "react";
import { getAdapter } from "@/lib/db/adapter";
import { backupCounts, exportData, importData, parseBackup, resetProgress, type Backup } from "@/lib/db/backup";
import { saveSettings, useSettings } from "@/lib/db/hooks";
import { dayKey } from "@/lib/learning/plan";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="fm-card" aria-label={title}>
      <h2 className="fm-card__head">{title}</h2>
      <div className="fm-card__body grid gap-5">{children}</div>
    </section>
  );
}

export function SettingsForm() {
  const s = useSettings();
  const [pending, setPending] = useState<Backup | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirm, setConfirm] = useState("");

  const download = async () => {
    const blob = new Blob([JSON.stringify(await exportData(getAdapter()), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `sysdesign-lab-${dayKey()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg({ text: "Export downloaded. Your API key is not in it." });
  };

  const pick = async (file?: File) => {
    if (!file) return;
    try { setPending(parseBackup(await file.text())); setMsg(null); }
    catch (e) { setPending(null); setMsg({ text: (e as Error).message, error: true }); }
  };

  const apply = async (mode: "merge" | "replace") => {
    if (!pending) return;
    await importData(getAdapter(), pending, mode);
    setPending(null);
    setMsg({ text: mode === "merge" ? "Imported and merged with your data." : "Your data was replaced by the import." });
  };

  return (
    <div className="grid max-w-2xl gap-6 px-4 py-8 sm:px-8">
      <Group title="Study plan">
        <div className="flex flex-wrap gap-5">
          <div className="fm-field">
            <label htmlFor="plan-start">Plan start date</label>
            <input id="plan-start" type="date" className="fm-input fm-input--mono" value={s.planStart ?? ""} onChange={(e) => e.target.value && saveSettings({ planStart: e.target.value })} />
            <span className="fm-help">Week 1 starts on this day. Defaults to your first visit.</span>
          </div>
          <div className="fm-field">
            <label htmlFor="hours">Hours per week</label>
            <input id="hours" type="number" min={1} max={60} className="fm-input fm-input--mono" value={s.hoursPerWeek ?? 8} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 60) saveSettings({ hoursPerWeek: n }); }} />
            <span className="fm-help">The plan assumes about 8.</span>
          </div>
          <div className="fm-field">
            <label htmlFor="new-cards">New flashcards per day</label>
            <input id="new-cards" type="number" min={0} max={200} className="fm-input fm-input--mono" value={s.newCardsPerDay} onChange={(e) => { const n = Number(e.target.value); if (n >= 0 && n <= 200) saveSettings({ newCardsPerDay: n }); }} />
          </div>
        </div>
      </Group>

      <Group title="Your data">
        <p className="text-ink-muted">Everything lives in this browser. Export a backup before clearing site data or switching machines.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="fm-btn fm-btn--primary" onClick={download}>Export all data</button>
          <label className="fm-btn cursor-pointer">
            Import data
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        {pending && (
          <div className="grid gap-3 border border-ink p-4" style={{ borderRadius: 2 }}>
            <p className="fm-cap">Import preview · exported {new Date(pending.exportedAt).toLocaleString()}</p>
            <ul className="grid grid-cols-2 gap-x-6 font-mono text-[13px] sm:grid-cols-3">
              {backupCounts(pending).map(([t, n]) => <li key={t}>{t}: {n}</li>)}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="fm-btn" onClick={() => apply("merge")}>Merge with my data</button>
              <button type="button" className="fm-btn fm-btn--danger" onClick={() => apply("replace")}>Replace my data</button>
              <button type="button" className="fm-btn fm-btn--tool self-center" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
        {msg && <p role="status" className={msg.error ? "fm-help is-error" : "fm-help"}>{msg.text}</p>}
      </Group>

      <Group title="Danger zone">
        <p>Reset deletes all progress, quiz history, flashcard schedules, notes, designs and study time. Settings stay. This cannot be undone.</p>
        <div className="fm-field">
          <label htmlFor="reset">Type RESET to confirm</label>
          <input id="reset" className="fm-input fm-input--mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </div>
        <button type="button" className="fm-btn fm-btn--danger w-fit" disabled={confirm !== "RESET"} onClick={async () => { await resetProgress(getAdapter()); setConfirm(""); setMsg({ text: "All progress was reset." }); }}>Reset all progress</button>
      </Group>
    </div>
  );
}
