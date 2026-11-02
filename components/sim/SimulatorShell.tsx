"use client";
import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info, Maximize2, Pause, Play, RotateCcw, StepForward, X } from "lucide-react";
import { DepthStamp, SpecLabel, StatusLabel } from "@/components/brand";
import { SetHud } from "@/components/layout/SetHud";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useChallengeResults } from "@/lib/db/hooks";
import { SPEEDS, type LogEntry, type LogLevel, type MetricHistory, type MetricSnapshot } from "@/lib/sim/engine";
import type { ChartDef, ControlDef, MetricCard, SimDefinition } from "@/lib/sim/definition";
import type { SimEntry } from "@/lib/simulators/registry";
import { GuidedTour } from "./GuidedTour";
import { useSimulation, type ChallengeRun } from "./useSimulation";

const fmtTime = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
const fmt = (c: MetricCard, v = 0) => (c.unit === "%" ? (v * 100).toFixed(c.digits ?? 0) : v.toFixed(c.digits ?? 0));
const TOUR_KEY = (id: string) => `sdl-tour-${id}`;

/** Wraps Greek letters so uppercase labels keep λ, μ, ρ readable. */
export function Greek({ text }: { text: string }) {
  return <>{text.split(/([\u0370-\u03ff])/).map((part, i) => (i % 2 ? <span key={i} className="greek">{part}</span> : part))}</>;
}

function Panel({ title, tour, children, className = "", right }: { title: string; tour?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section data-tour={tour} aria-label={title} className={`fm-card min-w-0 ${className}`}>
      <div className="fm-card__head"><h2>{title}</h2>{right}</div>
      <div className="fm-card__body">{children}</div>
    </section>
  );
}

function Control({ c, value, disabled, onChange }: { c: ControlDef<Record<string, unknown>>; value: unknown; disabled?: boolean; onChange(v: unknown): void }) {
  const id = `ctl-${c.key}`;
  if (c.type === "number") {
    return (
      <div className="fm-slider !min-w-0">
        <label htmlFor={id} className="fm-label"><Greek text={c.label} /></label>
        <output htmlFor={id}>{String(value)}{c.unit}</output>
        <input id={id} type="range" min={c.min} max={c.max} step={c.step} value={Number(value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-describedby={c.help ? `${id}-h` : undefined} />
        <div className="ticks" aria-hidden><span>{c.min}</span><span>{(c.min + c.max) / 2}</span><span>{c.max}</span></div>
        {c.help && <p id={`${id}-h`} className="fm-help col-span-2">{c.help}</p>}
      </div>
    );
  }
  if (c.type === "select") {
    return (
      <div className="fm-field !min-w-0">
        <label htmlFor={id}><Greek text={c.label} /></label>
        <select id={id} className="fm-input" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  return (
    <button type="button" role="switch" aria-checked={!!value} className="fm-toggle" disabled={disabled} onClick={() => onChange(!value)}>
      <span className="track" /><span className="state">{value ? "On" : "Off"}</span><Greek text={c.label} />
    </button>
  );
}

const Cards = memo(function Cards({ cards, m, wide = false }: { cards: MetricCard[]; m: MetricSnapshot; wide?: boolean }) {
  return (
    <dl className={`grid grid-cols-2 gap-px border border-ink bg-ink ${wide ? "sm:grid-cols-3" : ""}`} style={{ borderRadius: 2 }}>
      {cards.map((c) => {
        const tone = c.tone?.(m[c.key] ?? 0);
        return (
          <div key={c.key} className="bg-surface p-2.5">
            <dt className="fm-cap break-words"><Greek text={c.label} /></dt>
            <dd className="mt-1 font-mono text-[20px] font-medium tabular-nums" style={tone && tone !== "ok" ? { color: `var(--status-${tone})` } : undefined}>
              {fmt(c, m[c.key])}<span className="ml-0.5 text-[11px] text-ink-muted">{c.unit}</span>
              {tone && tone !== "ok" && <span className="sr-only"> ({tone === "hot" ? "hot" : "overloaded"})</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
});

const tick = { fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--ink-muted)" };
const Charts = memo(function Charts({ charts, history }: { charts: ChartDef[]; history: MetricHistory; samples: number }) {
  return (
    <>
      {charts.map((c) => {
        const rows = (history[c.keys[0].key] ?? []).map((s, i) => Object.fromEntries([["t", s.t / 1000], ...c.keys.map((k) => [k.key, history[k.key]?.[i]?.v ?? 0])]));
        return (
          <figure key={c.title} className="grid gap-1">
            <figcaption className="fm-cap flex flex-wrap gap-x-3">
              <span>{c.title}{c.unit && ` · ${c.unit}`}</span>
              {c.keys.map((k) => <span key={k.key} className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-3" style={{ background: k.color }} />{k.label}</span>)}
            </figcaption>
            <ResponsiveContainer width="100%" height={110} initialDimension={{ width: 260, height: 110 }}>
              <LineChart data={rows} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => `${Math.round(v)}s`} stroke="var(--ink)" tickLine={false} tick={tick} />
                <YAxis stroke="var(--ink)" tickLine={false} tick={tick} width={48} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--ink)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11 }} labelFormatter={(v) => `t = ${Number(v).toFixed(2)} s`} formatter={(v) => Number(v).toFixed(c.unit === "ms" ? 0 : 2)} />
                {c.keys.map((k) => <Line key={k.key} dataKey={k.key} name={k.label} stroke={k.color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </figure>
        );
      })}
    </>
  );
}, (a, b) => a.samples === b.samples && a.charts === b.charts);

const LEVELS: LogLevel[] = ["info", "warn", "error"];
function EventLogPanel({ entries }: { entries: LogEntry[] }) {
  const [show, setShow] = useState<Set<LogLevel>>(new Set(LEVELS));
  const [follow, setFollow] = useState(true);
  const list = useRef<HTMLOListElement>(null);
  const rows = entries.filter((e) => show.has(e.level));
  useEffect(() => { if (follow && list.current) list.current.scrollTop = list.current.scrollHeight; }, [rows.length, follow]);
  return (
    <Panel title="Event log" tour="log" right={
      <span className="flex flex-wrap gap-1">
        {LEVELS.map((l) => <button key={l} type="button" aria-pressed={show.has(l)} className={`fm-btn fm-btn--tool !h-6 ${show.has(l) ? "is-on" : ""}`} onClick={() => { const n = new Set(show); if (n.has(l)) n.delete(l); else n.add(l); setShow(n); }}>{l}</button>)}
        <button type="button" aria-pressed={follow} className={`fm-btn fm-btn--tool !h-6 ${follow ? "is-on" : ""}`} onClick={() => setFollow(!follow)}>Auto-scroll</button>
      </span>
    }>
      <ol ref={list} className="max-h-40 overflow-y-auto font-mono text-[12px] leading-relaxed" aria-live="off">
        {rows.length === 0 && <li className="text-ink-muted">Nothing yet. Press Play.</li>}
        {rows.map((e) => (
          <li key={e.id} className="grid grid-cols-[5.5rem_3.5rem_1fr] gap-2">
            <span className="text-ink-muted tabular-nums">{fmtTime(e.t)}</span>
            <span className="uppercase" style={{ color: e.level === "info" ? "var(--ink-muted)" : `var(--status-${e.level === "warn" ? "hot" : "over"})` }}>{e.level}</span>
            <span>{e.message}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function ChallengesPanel({ simId, def, run, onStart, onStop }: { simId: string; def: SimDefinition; run: ChallengeRun | null; onStart(id: string): void; onStop(): void }) {
  const results = useChallengeResults()?.filter((r) => r.simulatorId === simId) ?? [];
  const [hint, setHint] = useState<string | null>(null);
  return (
    <Panel title={`Challenges · ${results.filter((r) => r.passed).length}/${def.challenges.length}`} tour="challenges">
      <ul className="grid gap-3">
        {def.challenges.map((c, i) => {
          const r = results.find((x) => x.challengeId === c.id);
          const mine = run?.id === c.id ? run : null;
          return (
            <li key={c.id} className="grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start gap-2">
                <span className="fm-num !size-6 !text-[11px]">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold leading-snug">{c.title}</h3>
                  {r && <p className="fm-cap mt-0.5">{r.passed ? "Passed" : "Not yet"} · best {r.bestValue} · {r.attempts} tr{r.attempts === 1 ? "y" : "ies"}</p>}
                </div>
              </div>
              <p className="text-[14px] leading-snug text-ink-muted">{c.description}</p>
              {mine?.status === "done" && mine.outcome && (
                <div role="status" className="grid gap-1">
                  <StatusLabel status={mine.outcome.passed ? "ok" : "over"} detail={mine.outcome.passed ? "Passed" : "Failed"} />
                  <p className="text-[14px]">{mine.outcome.detail}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {mine?.status === "running"
                  ? <button type="button" className="fm-btn fm-btn--tool" onClick={onStop}>Stop challenge</button>
                  : <button type="button" className="fm-btn fm-btn--tool is-on" onClick={() => onStart(c.id)}>{mine ? "Try again" : "Start"} · {c.durationMs / 1000}s</button>}
                <button type="button" className="fm-btn fm-btn--tool" aria-expanded={hint === c.id} onClick={() => setHint(hint === c.id ? null : c.id)}>Hint</button>
              </div>
              {hint === c.id && <p className="border-l-2 border-cobalt pl-3 text-[14px]">{c.hint}</p>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function SimulatorShell({ entry, def, compact = false }: { entry: SimEntry; def: SimDefinition; compact?: boolean }) {
  const s = useSimulation(entry.id, def);
  const { sim, run } = s;
  const root = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState(false);
  const [tour, setTour] = useState(false);
  const [seedText, setSeedText] = useState(String(sim.seed));
  const [reduced, setReduced] = useState(false);
  const [faultMenu, setFaultMenu] = useState(false);

  useEffect(() => {
    // Defaults read from the browser after mount: reduced motion and the first-visit tour.
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let first = false;
    if (!compact) { try { first = !localStorage.getItem(TOUR_KEY(entry.id)); localStorage.setItem(TOUR_KEY(entry.id), "1"); } catch { /* storage blocked */ } }
    const id = setTimeout(() => { setReduced(rm); if (first) setTour(true); }, 0);
    return () => clearTimeout(id);
  }, [compact, entry.id]);

  const locked = run?.status === "running" ? new Set(Object.keys(def.challenges.find((c) => c.id === run.id)?.setup ?? {})) : new Set<string>();
  const config = sim.config as Record<string, unknown>;
  const m = sim.latest;
  const playing = !sim.clock.paused;
  const challenge = run ? def.challenges.find((c) => c.id === run.id) : undefined;

  const transport = (
    <div data-tour="transport" className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Simulation controls">
      <button type="button" className="fm-btn fm-btn--tool is-on !h-8" onClick={playing ? s.pause : s.play} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={s.step} disabled={playing} aria-label="Step one tick"><StepForward className="size-3.5" />Step</button>
      <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => s.reset()} aria-label="Reset"><RotateCcw className="size-3.5" />Reset</button>
      <label className="fm-cap flex items-center gap-1.5">Speed
        <select className="fm-input fm-input--mono !h-8 !w-auto !py-0 !text-[12px]" value={sim.clock.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}>
          {SPEEDS.map((x) => <option key={x} value={x}>{x}×</option>)}
        </select>
      </label>
      {!compact && (
        <form className="fm-cap flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const n = Number.parseInt(seedText, 10); if (Number.isFinite(n)) s.reset(n); }}>
          <label htmlFor={`seed-${entry.id}`}>Seed</label>
          <input id={`seed-${entry.id}`} inputMode="numeric" className="fm-input fm-input--mono !h-8 !w-20 !text-[12px]" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
          <button type="submit" className="fm-btn fm-btn--tool !h-8">Apply</button>
        </form>
      )}
      <button type="button" role="switch" aria-checked={reduced} className="fm-toggle" onClick={() => setReduced(!reduced)}><span className="track" /><span className="state">{reduced ? "On" : "Off"}</span>Reduced animation</button>
      <span className="fm-cap ml-auto tabular-nums" aria-live="off">t = {fmtTime(sim.clock.t)}{challenge && run?.status === "running" && ` / ${fmtTime(challenge.durationMs)}`}</span>
    </div>
  );

  const faults = (
    <div data-tour="faults" className="relative flex flex-wrap items-center gap-2">
      <button type="button" className="fm-btn fm-btn--tool fm-btn--danger !h-8" aria-expanded={faultMenu} aria-haspopup="menu" onClick={() => setFaultMenu(!faultMenu)}>Break it ▾</button>
      {faultMenu && (
        <ul role="menu" className="fm-card fm-card--raised absolute left-0 top-10 z-20 grid w-72 gap-0 p-1">
          {def.model.faults.map((f) => (
            <li key={f.id} role="none">
              <button type="button" role="menuitemcheckbox" aria-checked={sim.faults.has(f.id)} className="grid w-full gap-0.5 p-2 text-left hover:bg-paper" onClick={() => { s.toggleFault(f.id); setFaultMenu(false); }}>
                <span className="font-semibold">{sim.faults.has(f.id) ? "✓ " : ""}{f.label}</span>
                <span className="text-[13px] text-ink-muted">{f.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {[...sim.faults].map((id) => {
        const f = def.model.faults.find((x) => x.id === id)!;
        return (
          <button key={id} type="button" className="fm-btn fm-btn--tool !h-7 border-[var(--status-over)]" style={{ background: "var(--status-over-fill)", color: "var(--ink)" }} onClick={() => s.toggleFault(id)} aria-label={`Remove fault: ${f.label}`}>
            {f.label}<X className="size-3" />
          </button>
        );
      })}
    </div>
  );

  const canvas = (
    <div data-tour="canvas" className="fm-grid fm-grid--fine relative overflow-x-auto border border-ink p-3 sm:p-6" style={{ borderRadius: 2 }}>
      <span className="fm-cross tl" /><span className="fm-cross tr" /><span className="fm-cross bl" /><span className="fm-cross br" />
      {/* Views give their SVG drawings a min width; narrow screens scroll those sideways instead of shrinking labels to nothing. */}
      <div><def.View state={sim.state} config={sim.config} t={sim.clock.t} reducedMotion={reduced} act={s.act} /></div>
    </div>
  );

  const controls = (
    <Panel title="Controls" tour="controls">
      <div className="grid gap-5">
        {def.controls.map((c) => <Control key={c.key} c={c as ControlDef<Record<string, unknown>>} value={config[c.key]} disabled={locked.has(c.key)} onChange={(v) => s.setConfig({ [c.key]: v })} />)}
        {locked.size > 0 && <p className="fm-help">Locked by the running challenge: {[...locked].join(", ")}.</p>}
      </div>
    </Panel>
  );

  const metrics = (
    <Panel title="Live metrics" tour="metrics">
      <div className="grid gap-4">
        <Cards cards={def.cards} m={m} />
        <Charts charts={def.charts} history={sim.metrics.history()} samples={sim.samples} />
      </div>
    </Panel>
  );

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <SpecLabel code={entry.code} parts={[entry.title.toUpperCase()]} note="NTS" />
      <DepthStamp depth={entry.depth} />
      <span className="ml-auto flex flex-wrap gap-2">
        <button type="button" className="fm-btn fm-btn--tool" onClick={() => setInfo(true)}><Info className="size-3.5" />What this models</button>
        {!compact && <button type="button" className="fm-btn fm-btn--tool" onClick={() => setTour(true)}>Guided tour</button>}
        {compact && <Link href={`/simulators/${entry.id}`} className="fm-btn fm-btn--tool no-underline"><Maximize2 className="size-3.5" />Open full screen</Link>}
      </span>
    </div>
  );

  return (
    <div ref={root} className="grid min-w-0 gap-4" data-sim={entry.id}>
      {!compact && <SetHud live={`Sim · ${entry.title}${playing ? " · running" : " · paused"}`} items={[{ k: "T", v: fmtTime(sim.clock.t) }, ...def.hud(m)]} right={`Seed ${sim.seed} · ${sim.clock.speed}×`} />}
      {header}
      {transport}
      {def.model.faults.length > 0 && faults}
      {compact ? (
        <div className="grid gap-4">
          {canvas}
          <Cards cards={def.cards} m={m} wide />
          <details className="fm-card"><summary className="fm-card__head cursor-pointer">Controls and challenges</summary><div className="grid gap-4 p-4">{controls}<ChallengesPanel simId={entry.id} def={def} run={run} onStart={s.startChallenge} onStop={s.stopChallenge} /></div></details>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
          <div className="grid content-start gap-4 max-xl:order-2">{controls}<ChallengesPanel simId={entry.id} def={def} run={run} onStart={s.startChallenge} onStop={s.stopChallenge} /></div>
          <div className="grid min-w-0 content-start gap-4 max-xl:order-1">{canvas}<EventLogPanel entries={sim.log.entries()} /></div>
          <div className="min-w-0 max-xl:order-3">{metrics}</div>
        </div>
      )}

      <Dialog open={info} onOpenChange={setInfo}>
        <DialogContent>
          <DialogTitle className="fm-h4">{entry.title}</DialogTitle>
          <DialogDescription>{entry.summary}</DialogDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><h3 className="fm-cap mb-2">What this models</h3><ul className="grid list-disc gap-1 pl-5 text-[15px]">{entry.models.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><h3 className="fm-cap mb-2">What it simplifies</h3><ul className="grid list-disc gap-1 pl-5 text-[15px]">{entry.simplifies.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
        </DialogContent>
      </Dialog>
      {tour && <GuidedTour steps={def.tour} root={root} onClose={() => setTour(false)} />}
    </div>
  );
}
