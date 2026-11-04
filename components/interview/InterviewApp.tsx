"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Pause, Play, Send } from "lucide-react";
import { DesignViewer } from "@/components/case-studies/DesignViewer";
import { DesignEditor } from "@/components/studio/Editor";
import type { Lessons } from "@/components/studio/PropertiesPanel";
import type { CaseRuns } from "@/components/studio/run/config";
import type { CaseStudyMeta, Rubric } from "@/lib/content/schemas";
import { useInterviewAttempts } from "@/lib/db/hooks";
import { COMPARE_ROWS, runDesign, type RunResult } from "@/lib/interview/compare";
import { groupByStep, hintsUsed, scoreTotal } from "@/lib/interview/scoring";
import { attemptScore, submit } from "@/lib/interview/session";
import { discardDraft, loadDraft, readDesign, saveAttempt, saveDraft, startAttempt } from "@/lib/interview/store";
import { elapsedMs, fmtMinutes, formatClock, minuteMark, pause, resume, splitTime, stepElapsed, switchStep } from "@/lib/interview/timing";
import { DURATIONS, STEPS, type DurationMin, type InterviewSession, type Mode, type Step } from "@/lib/interview/types";
import type { StudioGraph } from "@/lib/studio/types";
import { StepPanel } from "./StepPanels";

export interface InterviewCase { meta: CaseStudyMeta; rubric: Rubric; reference: StudioGraph | null }

type View = { v: "loading" } | { v: "start" } | { v: "session"; s: InterviewSession } | { v: "saved"; attemptId: string; pct: number };

/**
 * Interview Mode for one case: start screen → timed session (step panels, the Design Studio canvas, notes) →
 * self-review (rubric, reference design, both designs run against the case's traffic, common mistakes) → saved attempt.
 * The running session is a Dexie draft, so a reload resumes it with the clock still counting in Mock mode.
 */
export function InterviewApp({ c, solution, lessons, caseRuns }: { c: InterviewCase; solution: ReactNode; lessons: Lessons; caseRuns: CaseRuns }) {
  const [view, setView] = useState<View>({ v: "loading" });
  useEffect(() => {
    let live = true;
    loadDraft(c.meta.id).then((s) => { if (live) setView(s ? { v: "session", s } : { v: "start" }); }, () => { if (live) setView({ v: "start" }); });
    return () => { live = false; };
  }, [c.meta.id]);

  if (view.v === "loading") return <p className="p-8 text-ink-muted">Loading…</p>;
  if (view.v === "start") return <StartScreen c={c} onStart={(s) => setView({ v: "session", s })} />;
  if (view.v === "saved") return <Saved c={c} pct={view.pct} onAgain={() => setView({ v: "start" })} />;
  return <Session key={view.s.designId} c={c} initial={view.s} solution={solution} lessons={lessons} caseRuns={caseRuns} onSaved={(attemptId, pct) => setView({ v: "saved", attemptId, pct })} onDiscard={() => setView({ v: "start" })} />;
}

function StartScreen({ c, onStart }: { c: InterviewCase; onStart: (s: InterviewSession) => void }) {
  const [mode, setMode] = useState<Mode>("mock");
  const [duration, setDuration] = useState<DurationMin>(45);
  const [hintsOn, setHintsOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const split = splitTime(duration);
  const go = async () => {
    setBusy(true);
    try {
      onStart(await startAttempt({ caseStudyId: c.meta.id, caseTitle: c.meta.title, interviewerPrompt: c.meta.interviewerPrompt, mode, durationMin: duration, hintsOn }));
    } catch (e) {
      setError(`Could not start: ${(e as Error).message}`);
      setBusy(false);
    }
  };
  return (
    <div className="grid max-w-3xl gap-6 px-4 py-8 sm:px-8">
      <section aria-labelledby="prompt-h" className="grid gap-2 border border-ink p-4" style={{ borderRadius: 4 }}>
        <h2 id="prompt-h" className="fm-cap">Interviewer</h2>
        <p className="text-[18px] leading-relaxed">{c.meta.interviewerPrompt}</p>
      </section>
      <fieldset className="grid gap-2">
        <legend className="fm-label mb-1">Mode</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["mock", "Mock", "Timed, no pause. Each hint costs a rubric point."], ["practice", "Practice", "Pause any time. Hints are free, and you can ask for deep dives early."]] as const).map(([v, t, d]) => (
            <label key={v} className={`grid cursor-pointer gap-1 border p-3 ${mode === v ? "border-cobalt" : "border-ink"}`} style={{ borderRadius: 2 }}>
              <span className="flex items-center gap-2 font-medium"><input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} /> {t}</span>
              <span className="text-[15px] text-ink-muted">{d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="fm-label mb-1">Duration</legend>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <label key={d} className={`fm-btn fm-btn--tool cursor-pointer ${duration === d ? "!border-cobalt" : ""}`}>
              <input type="radio" name="duration" className="sr-only" value={d} checked={duration === d} onChange={() => setDuration(d)} /> {d} min
            </label>
          ))}
        </div>
        <p className="fm-help">Suggested split: {STEPS.map((s) => `${s} ${split[s]}`).join(" · ")} min.</p>
      </fieldset>
      <label className="flex items-center gap-2"><input type="checkbox" checked={hintsOn} onChange={(e) => setHintsOn(e.target.checked)} /> Show hint buttons (up to 2 per step)</label>
      {error && <p role="alert" className="text-status-over">{error}</p>}
      <button type="button" className="fm-btn fm-btn--primary justify-self-start" disabled={busy} onClick={go}><Play size={14} aria-hidden /> Start</button>
      <p className="fm-help">Your canvas opens from the case&apos;s Design Studio starter. Work is saved in this browser as you go.</p>
    </div>
  );
}

function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

function Session({ c, initial, solution, lessons, caseRuns, onSaved, onDiscard }: {
  c: InterviewCase; initial: InterviewSession; solution: ReactNode; lessons: Lessons; caseRuns: CaseRuns;
  onSaved: (attemptId: string, pct: number) => void; onDiscard: () => void;
}) {
  const [s, setS] = useState(initial);
  const sRef = useRef(s);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const set = useCallback((fn: (x: InterviewSession) => InterviewSession) => {
    setS((prev) => {
      const next = fn(prev);
      sRef.current = next;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void saveDraft(sRef.current); }, 500);
      return next;
    });
  }, []);
  useEffect(() => () => { clearTimeout(saveTimer.current); void saveDraft(sRef.current).catch(() => {}); }, []);

  const now = useNow(s.since !== null);
  const elapsed = elapsedMs(s, now);
  const remaining = s.durationMin * 60_000 - elapsed;
  const split = splitTime(s.durationMin);
  const review = s.phase === "review";
  const announce = minuteMark(remaining);

  const openStep = (step: Step) => set((x) => {
    const t = Date.now();
    const y = switchStep(x, step, t);
    return step === "Deep Dives" && y.deepDivesOpenedAt === null ? { ...y, deepDivesOpenedAt: elapsedMs(y, t) } : y;
  });
  const doSubmit = () => {
    if (!window.confirm("Submit and move to self-review? The clock stops and the step panels become read-only.")) return;
    set((x) => submit(x));
  };
  const discard = async () => {
    if (!window.confirm("Discard this attempt? Its step answers are deleted; the canvas stays in your Design Studio list.")) return;
    await discardDraft(s.caseStudyId);
    onDiscard();
  };

  const stepOver = stepElapsed(s, s.activeStep, now) > split[s.activeStep] * 60_000;

  return (
    <div className="grid gap-0">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-ink bg-paper px-4 py-2 sm:px-6" data-testid="interview-bar">
        <span className="fm-cap">{s.mode === "mock" ? "Mock" : "Practice"} · {s.durationMin} min</span>
        <span className={`font-mono text-[32px] leading-none tabular-nums ${remaining < 0 ? "text-status-over" : ""}`} data-testid="interview-clock" aria-label={`Time remaining ${formatClock(remaining)}`}>
          {formatClock(review ? s.durationMin * 60_000 - (s.elapsedAtSubmit ?? elapsed) : remaining)}
        </span>
        <span className="sr-only" aria-live="polite">{review ? "" : announce}</span>
        {remaining < 0 && !review && <span className="fm-cap !text-status-over">■ Over time</span>}
        <span className="flex-1" />
        {!review && s.mode === "practice" && (
          s.since === null
            ? <button type="button" className="fm-btn fm-btn--tool" onClick={() => set((x) => resume(x, Date.now()))}><Play size={14} aria-hidden /> Resume</button>
            : <button type="button" className="fm-btn fm-btn--tool" onClick={() => set((x) => pause(x, Date.now()))}><Pause size={14} aria-hidden /> Pause</button>
        )}
        {!review && <button type="button" className="fm-btn fm-btn--tool" onClick={discard}>Discard</button>}
        {!review && <button type="button" className="fm-btn fm-btn--primary" onClick={doSubmit}><Send size={14} aria-hidden /> Submit</button>}
      </div>

      {s.since === null && !review && <p className="border-b border-line bg-paper-2 px-4 py-2 text-[15px] sm:px-6">Paused. The clock and deep-dive questions wait until you resume.</p>}

      {review ? (
        <Review c={c} s={s} set={set} elapsed={elapsed} solution={solution} onSaved={onSaved} />
      ) : (
        <div className="grid min-h-[720px] lg:grid-cols-[minmax(320px,400px)_1fr]">
          <aside className="grid content-start gap-3 border-b border-ink p-4 lg:border-b-0 lg:border-r" aria-label="Interview steps">
            <div role="tablist" aria-label="Framework steps" className="grid gap-1">
              {STEPS.map((step, i) => {
                const spent = stepElapsed(s, step, now);
                const over = spent > split[step] * 60_000;
                const active = step === s.activeStep;
                return (
                  <button key={step} role="tab" type="button" aria-selected={active} aria-controls="step-panel" id={`tab-${i}`}
                    className={`grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 border px-2 py-1.5 text-left ${active ? "border-cobalt" : "border-line hover:border-ink"}`} style={{ borderRadius: 2 }}
                    onClick={() => openStep(step)}>
                    <span className="fm-cap">{i + 1}</span>
                    <span className="text-[15px]">{step}</span>
                    <span className={`font-mono text-[12px] tabular-nums ${over ? "text-status-over" : "text-ink-muted"}`}>{fmtMinutes(spent)} / {split[step]}:00</span>
                  </button>
                );
              })}
            </div>
            <section id="step-panel" role="tabpanel" aria-labelledby={`tab-${STEPS.indexOf(s.activeStep)}`} className="grid gap-3 border-t border-ink pt-3">
              <h2 className="fm-h4">{s.activeStep}</h2>
              {stepOver && <p className="border-l-2 border-status-hot pl-3 text-[15px]" role="status">▲ Over the suggested {split[s.activeStep]} min for this step. Wrap it up and move on; you can come back.</p>}
              <StepPanel step={s.activeStep} meta={c.meta} s={s} set={set} elapsed={elapsed} />
            </section>
          </aside>
          <div className="min-w-0">
            <DesignEditor designId={s.designId} lessons={lessons} caseRuns={caseRuns} />
          </div>
        </div>
      )}
    </div>
  );
}

function Review({ c, s, set, elapsed, solution, onSaved }: {
  c: InterviewCase; s: InterviewSession; set: (fn: (x: InterviewSession) => InterviewSession) => void; elapsed: number; solution: ReactNode;
  onSaved: (attemptId: string, pct: number) => void;
}) {
  const [mine, setMine] = useState<StudioGraph | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    readDesign(s.designId).then((d) => { if (live) setMine(d?.graph ?? null); });
    return () => { live = false; };
  }, [s.designId]);

  const total = scoreTotal(c.rubric, s.selfScores, s.mode, s.hints);
  const groups = groupByStep(c.rubric);
  const runs = useMemo(() => {
    const tp = c.meta.trafficProfile, rc = c.meta.runChallenge;
    return { mine: mine ? runDesign(mine, tp, rc) : null, ref: c.reference ? runDesign(c.reference, tp, rc) : null };
  }, [mine, c]);

  const save = async () => {
    setSaving(true);
    try {
      const a = await saveAttempt(s);
      onSaved(a.id, total.pct);
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-8 px-4 py-6 sm:px-8">
      <section aria-labelledby="sum-h" className="grid gap-2">
        <h2 id="sum-h" className="fm-h3">Self-review</h2>
        <p className="text-ink-muted">Took {fmtMinutes(s.elapsedAtSubmit ?? elapsed)} of {s.durationMin}:00 · {hintsUsed(s.hints)} hint{hintsUsed(s.hints) === 1 ? "" : "s"} used{s.mode === "mock" ? ` (−${total.hintPenalty} point${total.hintPenalty === 1 ? "" : "s"})` : ""}. Score each criterion honestly against what you actually said or drew, not what you meant.</p>
      </section>

      <section aria-labelledby="rubric-h" className="grid gap-4" data-testid="rubric">
        <h3 id="rubric-h" className="fm-cap border-b border-ink pb-1">Rubric · {total.scored}/{c.rubric.criteria.length} scored · {total.raw}/{total.max}{total.hintPenalty ? ` − ${total.hintPenalty}` : ""} = {total.pct}%</h3>
        {groups.map((g) => (
          <fieldset key={g.step} className="grid gap-3">
            <legend className="fm-label">{g.step}</legend>
            {g.criteria.map((cr) => (
              <div key={cr.id} role="radiogroup" aria-label={cr.title} className="grid gap-2 border border-line p-3" style={{ borderRadius: 2 }}>
                <p className="font-medium">{cr.title}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {(["0", "1", "2"] as const).map((lv) => {
                    const on = s.selfScores[cr.id] === Number(lv);
                    return (
                      <label key={lv} className={`grid cursor-pointer gap-1 border p-2 text-[15px] ${on ? "border-cobalt" : "border-line hover:border-ink"}`} style={{ borderRadius: 2 }}>
                        <span className="flex items-center gap-2"><input type="radio" name={`score-${cr.id}`} checked={on} onChange={() => set((x) => ({ ...x, selfScores: { ...x.selfScores, [cr.id]: Number(lv) } }))} /><span className="fm-cap">{lv} point{lv === "1" ? "" : "s"}</span></span>
                        <span>{cr.levels[lv]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="cmp-h" className="grid gap-3">
        <h3 id="cmp-h" className="fm-cap border-b border-ink pb-1">Your design vs the reference</h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {mine ? <DesignViewer graph={mine} label="Your design" height={380} /> : <p className="text-ink-muted">Loading your design…</p>}
          {c.reference ? <DesignViewer graph={c.reference} label="Reference design" height={380} markers={false} /> : <p className="text-ink-muted">This case has no reference design yet.</p>}
        </div>
        <RunCompare mine={runs.mine} ref_={runs.ref} c={c} />
      </section>

      <details className="grid gap-3 border-t border-ink pt-3">
        <summary className="fm-cap cursor-pointer !text-ink">Reference walkthrough</summary>
        <div className="max-w-[75ch] pt-3">{solution}</div>
      </details>

      <section aria-labelledby="mist-h" className="grid gap-2">
        <h3 id="mist-h" className="fm-cap border-b border-ink pb-1">Common mistakes · tick the ones you made</h3>
        <ul className="grid gap-1.5">
          {c.meta.commonMistakes.map((m, i) => (
            <li key={i}>
              <label className="flex items-start gap-2 text-[15px]">
                <input type="checkbox" className="mt-1" checked={s.mistakesChecked.includes(i)} onChange={(e) => set((x) => ({ ...x, mistakesChecked: e.target.checked ? [...x.mistakesChecked, i] : x.mistakesChecked.filter((k) => k !== i) }))} />
                <span>{m}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink pt-4">
        {error && <p role="alert" className="text-status-over">{error}</p>}
        <button type="button" className="fm-btn fm-btn--primary" disabled={saving || total.scored < c.rubric.criteria.length} onClick={save}><Check size={14} aria-hidden /> Save attempt · {total.pct}%</button>
        {total.scored < c.rubric.criteria.length && <span className="fm-help">Score all {c.rubric.criteria.length} criteria to save ({c.rubric.criteria.length - total.scored} left).</span>}
      </div>
    </div>
  );
}

function RunCompare({ mine, ref_, c }: { mine: RunResult | null; ref_: RunResult | null; c: InterviewCase }) {
  if (!mine && !ref_) return null;
  const tp = c.meta.trafficProfile;
  return (
    <div className="grid gap-2" data-testid="run-compare">
      <p className="text-[15px]">Both designs run headlessly at the case&apos;s peak traffic ({Math.round(tp.qps * tp.peakMultiplier).toLocaleString("en-US")} QPS). Challenge: <span className="font-medium">{c.meta.runChallenge.title}</span>.</p>
      <div className="overflow-x-auto">
        <table className="fm-parts">
          <thead><tr><th scope="col">Metric at peak</th><th scope="col">Yours</th><th scope="col">Reference</th></tr></thead>
          <tbody>
            {COMPARE_ROWS.map((r) => {
              const a = mine?.peak[r.key], b = ref_?.peak[r.key];
              const worse = a !== undefined && b !== undefined && (r.better === "lower" ? a > b * 1.05 + 1e-9 : a < b * 0.95 - 1e-9);
              return (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td className={worse ? "text-status-over" : ""}>{a === undefined ? "—" : `${r.fmt(a)}${worse ? " ▲" : ""}`}</td>
                  <td>{b === undefined ? "—" : r.fmt(b)}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row">Run challenge</th>
              <td>{mine ? (mine.challenge.passed ? "● Passed" : "■ Failed") : "—"}</td>
              <td>{ref_ ? (ref_.challenge.passed ? "● Passed" : "■ Failed") : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="fm-help">▲ marks a metric more than 5% worse than the reference. Open your design in Design Studio and press Run to see where traffic piles up.</p>
    </div>
  );
}

function Saved({ c, pct, onAgain }: { c: InterviewCase; pct: number; onAgain: () => void }) {
  const attempts = useInterviewAttempts();
  const max = c.rubric.criteria.length * 2;
  const mine = (attempts ?? []).filter((a) => a.caseStudyId === c.meta.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <div className="grid max-w-3xl gap-4 px-4 py-8 sm:px-8">
      <h2 className="fm-h3">Saved · {pct}%</h2>
      {mine.length > 0 && (
        <ol className="grid gap-1" aria-label="Your attempts at this case">
          {mine.map((a, i) => {
            const sc = attemptScore(a);
            return <li key={a.id} className="font-mono text-[14px]">#{i + 1} · {new Date(a.createdAt).toLocaleDateString()} · {a.panels.mode ?? "mock"} · {sc.raw}{sc.hintPenalty ? ` − ${sc.hintPenalty}` : ""}/{max} = {sc.pct}%</li>;
          })}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="fm-btn fm-btn--primary" onClick={onAgain}>Try again</button>
        <Link href={`/case-studies/${c.meta.id}`} className="fm-btn fm-btn--tool">Read the case study</Link>
        <Link href="/dashboard" className="fm-btn fm-btn--tool">Dashboard</Link>
      </div>
    </div>
  );
}
