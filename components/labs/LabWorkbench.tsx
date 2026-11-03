"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAdapter } from "@/lib/db/adapter";
import type { LabCode } from "@/lib/db/types";
import { LabRunner, type BrowserLang, type RunKind, type RunOutcome, type RuntimeStatus } from "@/lib/labs/runner";
import { IN_BROWSER, LANG_LABEL, LANGS, type LabFiles, type LabLang } from "@/lib/labs/schema";
import { CodeEditor } from "./CodeEditor";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import { LocalRunPanel } from "./LocalRunPanel";
import { ResultsPanel } from "./ResultsPanel";

const SAVE_DEBOUNCE_MS = 500;
const SOLUTION_AFTER = 3;

type Docs = Record<LabLang, LabCode>;
const fresh = (labId: string, lang: LabLang, starter: string): LabCode => ({ id: `${labId}:${lang}`, labId, lang, code: starter, failedRuns: 0, hintsShown: 0, solutionShown: false, updatedAt: new Date().toISOString() });

/** Records the run as a ChallengeResult, the same way simulators do: attempts count up, a pass is never lost. */
async function recordResult(labId: string, passed: number, total: number) {
  const db = getAdapter();
  const prev = await db.get("challengeResults", ["code-labs", labId]);
  const all = total > 0 && passed === total;
  await db.put("challengeResults", { simulatorId: "code-labs", challengeId: labId, passed: !!prev?.passed || all, bestValue: Math.max(prev?.bestValue ?? 0, passed), attempts: (prev?.attempts ?? 0) + 1, updatedAt: new Date().toISOString() });
}

export function LabWorkbench({ labId, hints, code, harness }: { labId: string; hints: string[]; code: Record<LabLang, LabFiles>; harness: { java: string; cpp: string } }) {
  const [lang, setLang] = useState<LabLang>("python");
  const [docs, setDocs] = useState<Docs | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Record<BrowserLang, RuntimeStatus>>({ python: { state: "idle" }, javascript: { state: "idle" }, typescript: { state: "idle" } });
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [solOpen, setSolOpen] = useState(false);
  const runner = useRef<LabRunner | null>(null);
  const timers = useRef<Partial<Record<LabLang, ReturnType<typeof setTimeout>>>>({});
  const latest = useRef<Docs | null>(null);

  // Load saved code for both languages once; until then the editor shows a loading line, so nothing is overwritten.
  useEffect(() => {
    let live = true;
    const db = getAdapter();
    void Promise.all(LANGS.map((l) => db.get("labCode", `${labId}:${l}`))).then((rows) => {
      if (!live) return;
      const d = Object.fromEntries(LANGS.map((l, i) => [l, rows[i] ?? fresh(labId, l, code[l].starter)])) as Docs;
      latest.current = d;
      setDocs(d);
    });
    return () => { live = false; };
  }, [labId, code]);

  // Workers are created on the first run, never on page load, and stopped when the page goes away.
  useEffect(() => {
    const t = timers.current;
    return () => {
      runner.current?.dispose();
      // Flush pending saves.
      for (const l of LANGS) if (t[l]) { clearTimeout(t[l]); if (latest.current) void getAdapter().put("labCode", latest.current[l]); }
    };
  }, []);

  const update = useCallback((l: LabLang, patch: Partial<LabCode>, now = false) => {
    const cur = latest.current;
    if (!cur) return;
    const next = { ...cur, [l]: { ...cur[l], ...patch, updatedAt: new Date().toISOString() } };
    latest.current = next;
    setDocs(next);
    clearTimeout(timers.current[l]);
    const save = () => { timers.current[l] = undefined; if (latest.current) void getAdapter().put("labCode", latest.current[l]); };
    if (now) save();
    else timers.current[l] = setTimeout(save, SAVE_DEBOUNCE_MS);
  }, []);

  const doc = docs?.[lang];

  const run = useCallback(async (kind: RunKind) => {
    const cur = latest.current?.[lang];
    if (!cur || busy || !IN_BROWSER[lang]) return; // Java and C++ run on the learner's machine
    const l = lang as BrowserLang;
    runner.current ??= new LabRunner((l, s) => setRuntime((r) => ({ ...r, [l]: s })));
    setBusy(kind === "test" ? "Running tests…" : "Running…");
    setOutcome(null);
    const out = await runner.current.run(l, kind, cur.code, code[lang].tests);
    setOutcome(out);
    setBusy(null);
    if (kind === "test") {
      const results = out.kind === "test" ? out.results : [];
      const passed = results.filter((r) => r.passed).length;
      const all = results.length > 0 && passed === results.length;
      if (!all) update(lang, { failedRuns: cur.failedRuns + 1 }, true);
      if (out.kind === "test") await recordResult(labId, passed, results.length);
    }
  }, [lang, busy, code, labId, update]);

  const switchLang = (l: LabLang) => { setLang(l); setOutcome(null); setSolOpen(false); };

  const ask = (r: ConfirmRequest) => setConfirm(r);
  const resetToStarter = () => ask({ title: "Reset to starter code?", body: `Your ${LANG_LABEL[lang]} code for this lab will be replaced by the starter code. This can't be undone.`, confirm: "Reset", danger: true, onConfirm: () => { update(lang, { code: code[lang].starter }, true); setOutcome(null); } });
  const showSolution = () => {
    const open = () => { update(lang, { solutionShown: true }, true); setSolOpen(true); };
    // Java and C++ have no failed runs to count here, so they always confirm.
    if ((IN_BROWSER[lang] && (doc?.failedRuns ?? 0) >= SOLUTION_AFTER) || doc?.solutionShown) open();
    else ask({ title: "Show the reference solution?", body: "You'll learn more by trying a little longer. The solution opens beside your code; your code stays as it is.", confirm: "Show solution", onConfirm: open });
  };
  const applySolution = () => ask({ title: "Replace your code with the solution?", body: `Your ${LANG_LABEL[lang]} code will be replaced by the reference solution. Reset to starter brings back the starter, not your code.`, confirm: "Replace my code", danger: true, onConfirm: () => update(lang, { code: code[lang].solution }, true) });

  const browser = IN_BROWSER[lang];
  const rt = browser ? runtime[lang as BrowserLang] : null;
  const status = rt?.state === "loading" ? rt.detail : rt?.state === "error" ? `Runtime error: ${rt.detail}` : null;
  const hintsShown = doc?.hintsShown ?? 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Language" className="flex flex-wrap">
          {LANGS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} disabled={!!busy} onClick={() => switchLang(l)} className={`fm-btn fm-btn--tool -ml-px first:ml-0 !h-9 ${lang === l ? "is-on" : ""}`} style={{ borderRadius: 0 }}>{LANG_LABEL[l]}</button>
          ))}
        </div>
        <p className="fm-cap">{!doc ? "Loading your code…" : browser ? `${doc.failedRuns} failed test run${doc.failedRuns === 1 ? "" : "s"} · autosaved` : "Autosaved"}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="grid min-w-0 content-start gap-3">
          {doc ? (
            <CodeEditor key={lang} lang={lang} label={`Your ${LANG_LABEL[lang]} code`} value={doc.code} onChange={(v) => update(lang, { code: v })} onSubmit={browser ? () => void run("test") : undefined} />
          ) : <p className="fm-cap" style={{ minHeight: 420 }}>Loading your code…</p>}
          <div className="flex flex-wrap gap-2">
            {browser && <>
              <button type="button" className="fm-btn fm-btn--primary !h-10" disabled={!doc || !!busy} onClick={() => void run("test")}>Run tests <span className="arr text-[12px]">Ctrl/⌘ + Enter</span></button>
              <button type="button" className="fm-btn !h-10" disabled={!doc || !!busy} onClick={() => void run("run")}>Run</button>
            </>}
            <button type="button" className="fm-btn fm-btn--tool !h-10" disabled={!doc || hintsShown >= hints.length} onClick={() => update(lang, { hintsShown: hintsShown + 1 }, true)}>{hintsShown >= hints.length ? "No more hints" : `Show hint ${hintsShown + 1} of ${hints.length}`}</button>
            <button type="button" className="fm-btn fm-btn--tool !h-10" disabled={!doc || solOpen} onClick={showSolution}>Show reference solution</button>
            <button type="button" className="fm-btn fm-btn--tool fm-btn--danger !h-10" disabled={!doc || !!busy} onClick={resetToStarter}>Reset to starter</button>
          </div>
          {hintsShown > 0 && (
            <ol className="grid gap-2" aria-label="Hints">
              {hints.slice(0, hintsShown).map((h, i) => <li key={i} className="fm-card p-3 text-[15px]"><span className="fm-cap mr-2">Hint {i + 1}</span>{h}</li>)}
            </ol>
          )}
          {solOpen && (
            <section className="grid gap-2" aria-label="Reference solution">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="fm-h4">Reference solution</h2>
                <div className="flex gap-2">
                  <button type="button" className="fm-btn fm-btn--tool !h-9" onClick={applySolution}>Replace my code with it</button>
                  <button type="button" className="fm-btn fm-btn--tool !h-9" onClick={() => setSolOpen(false)}>Hide</button>
                </div>
              </div>
              <CodeEditor key={`sol-${lang}`} lang={lang} label={`Reference ${LANG_LABEL[lang]} solution (read-only)`} value={code[lang].solution} readOnly height={320} />
            </section>
          )}
        </div>
        {browser || !doc ? <ResultsPanel outcome={outcome} busy={busy} status={status} /> : (
          <LocalRunPanel lang={lang as "java" | "cpp"} code={doc.code} tests={code[lang].tests} harness={harness[lang as "java" | "cpp"]} />
        )}
      </div>
      <ConfirmDialog req={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
