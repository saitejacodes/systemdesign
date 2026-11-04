"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { getAdapter } from "@/lib/db/adapter";
import { useChallengeResults } from "@/lib/db/hooks";
import { CATALOG } from "@/lib/studio/catalog";
import { analyze, azToLose, evaluateChallenge, frameMembers } from "@/lib/studio/sim";
import type { ChallengeCheck, RunChallenge, TrafficProfile } from "@/lib/studio/sim/types";
import type { StudioGraph } from "@/lib/studio/types";
import { challengeProfile, downtime, fmtMs, fmtPct, fmtQps, fmtUsd, GENERIC_CHALLENGES, nines, STATUS_TEXT, type CaseRun } from "./config";
import { fmtClock } from "./RunStrip";
import { TrafficForm } from "./TrafficForm";
import { nodeName, type RunApi } from "./useRun";

export type RunTab = "traffic" | "analysis" | "faults" | "challenges";
const TABS: [RunTab, string][] = [["traffic", "Traffic"], ["analysis", "Analysis"], ["faults", "Faults"], ["challenges", "Challenges"]];

export interface RunPanelProps {
  graph: StudioGraph;
  run: RunApi;
  profile: TrafficProfile;
  onProfile: (p: TrafficProfile) => void;
  onResetProfile: () => void;
  defaultFrom: string;
  selection: string[];
  select: (id: string) => void;
  caseRun?: { caseId: string } & CaseRun;
  onClose: () => void;
}

export function RunPanel(p: RunPanelProps) {
  const [tab, setTab] = useState<RunTab>("traffic");
  const sel = p.selection.length === 1 ? p.graph.nodes.find((n) => n.id === p.selection[0] && n.kind !== "note" && n.kind !== "frame") : undefined;
  return (
    <>
      <div className="flex items-end gap-2 pl-3 pr-1 pt-2">
        <div role="tablist" aria-label="Run panel" className="fm-tabs min-w-0 flex-1 overflow-x-auto">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`sdl-rtab-${id}`} aria-controls={`sdl-rpanel-${id}`} aria-selected={tab === id} className="fm-tab !px-2" onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <button type="button" className="fm-btn fm-btn--tool mb-1 shrink-0 !px-2 lg:hidden" aria-label="Close panel" onClick={p.onClose}><X size={14} aria-hidden /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {sel && <Inspector {...p} id={sel.id} />}
        <div role="tabpanel" id={`sdl-rpanel-${tab}`} aria-labelledby={`sdl-rtab-${tab}`}>
          {tab === "traffic" && (
            <TrafficForm graph={p.graph} profile={p.profile} onChange={p.onProfile} peak={p.run.faults.peak} defaultFrom={p.defaultFrom} onResetDefault={p.onResetProfile}
              onPeak={(on) => p.run.setFaults({ ...p.run.faults, peak: on }, on ? `Peak traffic on (${p.profile.peakMultiplier}×)` : "Peak traffic off", "info")} />
          )}
          {tab === "analysis" && <AnalysisTab {...p} />}
          {tab === "faults" && <FaultsTab {...p} />}
          {tab === "challenges" && <ChallengesTab {...p} />}
        </div>
      </div>
    </>
  );
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="grid gap-2 border-b border-line px-3 py-3" aria-label={title} data-testid={testId}>
      <h3 className="fm-cap">{title}</h3>
      {children}
    </section>
  );
}

function FaultButtons({ graph, run, id }: { graph: StudioGraph; run: RunApi; id: string }) {
  const f = run.faults;
  const name = nodeName(graph, id);
  const killed = f.killed.includes(id), slowed = f.slowed.includes(id);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Faults for ${name}`}>
      <button type="button" className="fm-btn fm-btn--tool fm-btn--danger" disabled={killed} onClick={() => run.setFaults({ ...f, killed: [...f.killed, id] }, `Killed ${name}`, "error")}>Kill</button>
      <button type="button" className="fm-btn fm-btn--tool" disabled={killed || slowed} onClick={() => run.setFaults({ ...f, slowed: [...f.slowed, id] }, `Slowed ${name} (latency ×5, capacity ÷5)`)}>Slow down</button>
      <button type="button" className="fm-btn fm-btn--tool" disabled={!killed && !slowed} onClick={() => run.setFaults({ ...f, killed: f.killed.filter((x) => x !== id), slowed: f.slowed.filter((x) => x !== id) }, `Restored ${name}`, "info")}>Restore</button>
    </div>
  );
}

/** Every number for the selected component, plus its fault buttons. */
function Inspector({ graph, run, id }: RunPanelProps & { id: string }) {
  const node = graph.nodes.find((n) => n.id === id)!;
  const n = run.state?.nodes[id];
  const status = n?.status ?? (run.faults.killed.includes(id) ? "down" : "ok");
  const st = STATUS_TEXT[status];
  const rows: [string, string][] = n ? [
    ["Incoming", `${fmtQps(n.inQps)} QPS`], ["Served", `${fmtQps(n.okQps)} QPS`], ["Dropped (errors)", `${fmtQps(n.droppedQps)} QPS`],
    ["Utilization ρ", n.rho.toFixed(3)], ["Latency", fmtMs(n.latencyMs)],
    ...(n.queueDepth !== undefined ? [["Queue depth", `${Math.round(n.queueDepth).toLocaleString("en-US")} msgs`] as [string, string]] : []),
    ...(n.hitRate !== undefined ? [["Hit rate", `${Math.round(n.hitRate)}%`] as [string, string]] : []),
  ] : [];
  return (
    <Section title={`Selected · ${CATALOG[node.kind as keyof typeof CATALOG]?.title ?? node.kind}`} testId="run-inspector">
      <p className="flex flex-wrap items-center gap-2 font-semibold">{nodeName(graph, id)}
        <span className={`fm-status fm-status--${status === "overloaded" ? "over" : status === "down" ? "ok" : status}`} style={status === "down" ? { background: "var(--surface-sunk)" } : undefined}>
          <span className="g" aria-hidden>{st.glyph}</span>{st.word}
        </span>
        {run.faults.slowed.includes(id) && status !== "down" && <span className="fm-cap">Slowed</span>}
      </p>
      {n ? (
        <table className="sdl-runtable"><tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className="n">{v}</td></tr>)}</tbody></table>
      ) : <p className="fm-help">Press Play or Step to send traffic.</p>}
      <FaultButtons graph={graph} run={run} id={id} />
    </Section>
  );
}

function AnalysisTab({ graph, run, profile, select }: RunPanelProps) {
  const a = useMemo(() => (run.state ? analyze(graph, profile, run.state, run.faults) : null), [graph, profile, run.state, run.faults]);
  if (!a) return <p className="fm-help p-3">Press Play or Step first.</p>;
  const typeName = (rid: string) => profile.requestTypes.find((t) => t.id === rid)?.name ?? rid;
  const n9 = nines(a.availabilityPct);
  return (
    <div>
      <Section title={`Bottlenecks · ${a.bottlenecks.length}`} testId="analysis-bottlenecks">
        {a.bottlenecks.length === 0 ? <p className="fm-help">Nothing above ρ 0.8 at the current traffic.</p> : (
          <ul className="grid gap-0.5">
            {a.bottlenecks.map((b) => {
              const s = run.state?.nodes[b.id]?.status ?? "hot";
              return (
                <li key={b.id}><button type="button" className="sdl-row-btn" onClick={() => select(b.id)}>
                  <span aria-hidden>{STATUS_TEXT[s].glyph}</span><span className="min-w-0 flex-1 truncate">{nodeName(graph, b.id)}</span>
                  <span className="sdl-num text-[12px]">ρ {b.rho.toFixed(2)} · {STATUS_TEXT[s].word}</span>
                </button></li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title={`Single points of failure · ${a.spofs.length}`} testId="analysis-spofs">
        {a.spofs.length === 0 ? <p className="fm-help">No single component cuts a client off from where its requests go.</p> : (
          <ul className="grid gap-2">
            {a.spofs.map((s) => {
              const clients = [...new Set(s.disconnects.map((d) => d.clientId))].map((c) => nodeName(graph, c));
              const types = [...new Set(s.disconnects.map((d) => d.requestTypeId))].map(typeName);
              return (
                <li key={s.id}>
                  <button type="button" className="sdl-row-btn" onClick={() => select(s.id)}><span aria-hidden>■</span><b className="min-w-0 flex-1 truncate">{nodeName(graph, s.id)}</b></button>
                  <p className="fm-help pl-6">If it fails, {clients.join(", ")} lose{clients.length === 1 ? "s" : ""}: {types.join(", ")}.</p>
                </li>
              );
            })}
          </ul>
        )}
        {a.redundantCuts.length > 0 && (
          <p className="fm-help">Also on every path, but redundant inside (2+ instances or a managed service), so not counted: {a.redundantCuts.map((id) => nodeName(graph, id)).join(", ")}. A bad deploy or config push can still take all of its instances down at once.</p>
        )}
      </Section>
      <Section title="Availability (estimate)" testId="analysis-availability">
        <p><span className="sdl-num text-[20px] font-medium">{fmtPct(a.availabilityPct, 3)}</span> <span className="fm-cap">· {Number.isFinite(n9) ? n9.toFixed(1) : "∞"} nines · ≈ {downtime(a.availabilityPct)} down</span></p>
        <table className="sdl-runtable"><tbody>
          {Object.entries(a.availabilityByType).map(([rid, v]) => <tr key={rid}><th scope="row">{typeName(rid)}</th><td className="n">{fmtPct(v, 3)} · {nines(v) === Infinity ? "∞" : nines(v).toFixed(1)} nines</td></tr>)}
        </tbody></table>
        <p className="fm-help">From each component&apos;s per-instance availability (Properties → Run mode): instances and split targets in parallel, hops in series. Killed components count as down.</p>
      </Section>
      <Section title="Cost" testId="analysis-cost">
        <p className="sdl-num text-[20px] font-medium">{fmtUsd(a.costPerMonth)}<span className="fm-cap"> /month</span></p>
        {a.costPerMonth === 0 && <p className="fm-help">Set “Cost per instance” on components in Edit mode to estimate it.</p>}
      </Section>
    </div>
  );
}

function FaultsTab({ graph, run, selection }: RunPanelProps) {
  const f = run.faults;
  const az = useMemo(() => azToLose(graph), [graph]);
  const azMembers = useMemo(() => (az ? frameMembers(graph, az) : []), [graph, az]);
  const x10 = f.trafficMultiplier >= 10;
  const any = f.killed.length + f.slowed.length > 0 || f.trafficMultiplier !== 1 || f.cacheFlushAt !== undefined;
  const sel = selection.length === 1 ? graph.nodes.find((n) => n.id === selection[0] && n.kind !== "frame" && n.kind !== "note") : undefined;
  return (
    <div>
      <Section title="Component faults">
        {sel ? <><p className="text-[14px]">{nodeName(graph, sel.id)}</p><FaultButtons graph={graph} run={run} id={sel.id} /></> : <p className="fm-help">Select a component on the canvas to kill it, slow it down or restore it.</p>}
      </Section>
      <Section title="Scenarios">
        <div className="grid gap-2">
          <button type="button" aria-pressed={x10} className={`fm-btn fm-btn--tool justify-self-start ${x10 ? "is-on" : ""}`}
            onClick={() => run.setFaults({ ...f, trafficMultiplier: x10 ? 1 : 10 }, x10 ? "Traffic back to normal" : "Traffic ×10", x10 ? "info" : "warn")}>Traffic ×10</button>
          <div className="grid gap-1">
            <button type="button" className="fm-btn fm-btn--tool fm-btn--danger justify-self-start" disabled={!az} aria-describedby="sdl-az-why"
              onClick={() => az && run.setFaults({ ...f, killed: [...new Set([...f.killed, ...azMembers])] }, `Lost ${nodeName(graph, az)}: ${azMembers.length} component${azMembers.length === 1 ? "" : "s"} down`, "error")}>Lose an AZ</button>
            <p id="sdl-az-why" className="fm-help">{az ? `Kills everything in ${nodeName(graph, az)}.` : "Needs a frame with Scope “az” around some components (add one in Edit mode)."}</p>
          </div>
          <div className="grid gap-1">
            <button type="button" className="fm-btn fm-btn--tool justify-self-start" disabled={!graph.nodes.some((n) => n.kind === "cache" || n.kind === "cdn")}
              onClick={() => run.setFaults({ ...f, cacheFlushAt: run.state?.t ?? 0 }, "Cache flush: hit rates drop to 0 and recover over 60 s")}>Cache flush</button>
            <p className="fm-help">Every cache and CDN starts cold; misses fall through to what is behind it.</p>
          </div>
          <button type="button" className="fm-btn fm-btn--tool justify-self-start" disabled={!any}
            onClick={() => run.setFaults({ killed: [], slowed: [], trafficMultiplier: 1, peak: f.peak }, "All faults cleared", "info")}>Reset faults</button>
        </div>
      </Section>
      <Section title={`Event log · ${run.log.length}`}>
        <ol className="sdl-log" aria-live="off" data-testid="run-log">
          {run.log.length === 0 && <li className="text-ink-muted">Faults and status changes appear here.</li>}
          {[...run.log].reverse().map((e) => (
            <li key={e.id}><span className="text-ink-muted">{fmtClock(e.t)}</span><span style={e.level === "info" ? undefined : { color: `var(--status-${e.level === "warn" ? "hot" : "over"})` }}>{e.text}</span></li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

type Entry = { key: string; challenge: RunChallenge; generic: boolean; disabled?: string };

function fmtTarget(key: string, v: number) {
  if (key === "minOkQps") return `${fmtQps(v)} QPS`;
  if (key === "maxP99Ms") return fmtMs(v);
  if (key === "maxErrorRatePct" || key === "minAvailabilityPct") return fmtPct(v, key === "minAvailabilityPct" ? 3 : 2);
  if (key === "maxCostPerMonth") return fmtUsd(v);
  return String(Math.round(v));
}

function ChallengesTab({ graph, profile, caseRun }: RunPanelProps) {
  const results = useChallengeResults()?.filter((r) => r.simulatorId === "studio") ?? [];
  const [checks, setChecks] = useState<Record<string, ChallengeCheck>>({});
  const [busy, setBusy] = useState("");
  const hasAz = useMemo(() => !!azToLose(graph), [graph]);
  const entries: Entry[] = [
    ...(caseRun ? [{ key: `${caseRun.caseId}:${caseRun.runChallenge.id}`, challenge: caseRun.runChallenge, generic: false }] : []),
    ...GENERIC_CHALLENGES.map((c) => ({ key: `generic:${c.id}`, challenge: c, generic: true, disabled: c.scenario === "lose-az" && !hasAz ? "Needs a frame with Scope “az” around some components." : undefined })),
  ];
  const check = (e: Entry) => {
    setBusy(e.key);
    // Let the "Checking…" state paint before the synchronous headless run.
    setTimeout(async () => {
      // A case challenge is written for the case's own traffic, so it is checked with that, not the edited profile.
      const prof = e.generic ? challengeProfile(e.challenge, profile, true) : caseRun?.trafficProfile ?? profile;
      let out: ChallengeCheck;
      try { out = evaluateChallenge(graph, e.challenge, prof); } catch (err) { setBusy(""); console.warn(err); return; }
      setChecks((c) => ({ ...c, [e.key]: out }));
      setBusy("");
      const db = getAdapter();
      const prev = await db.get("challengeResults", ["studio", e.key]);
      const best = out.results.filter((r) => r.passed).length;
      await db.put("challengeResults", { simulatorId: "studio", challengeId: e.key, passed: !!prev?.passed || out.passed, bestValue: Math.max(prev?.bestValue ?? 0, best), attempts: (prev?.attempts ?? 0) + 1, updatedAt: new Date().toISOString() });
    }, 0);
  };
  return (
    <div>
      {entries.map((e, i) => {
        const r = results.find((x) => x.challengeId === e.key);
        const c = checks[e.key];
        const ch = e.challenge;
        return (
          <section key={e.key} className="grid gap-2 border-b border-line px-3 py-3" aria-label={ch.title} data-testid={`challenge-${e.key}`}>
            <div className="flex items-start gap-2">
              <span className="fm-num !size-6 !text-[11px]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold leading-snug">{ch.title}</h3>
                <p className="fm-cap mt-0.5">{e.generic ? "Any design" : `Case study · ${caseRun?.title}`}{r ? ` · ${r.passed ? "passed" : "not yet"} · ${r.attempts} tr${r.attempts === 1 ? "y" : "ies"}` : ""}</p>
              </div>
            </div>
            <p className="text-[14px] leading-snug text-ink-muted">{ch.description}</p>
            <p className="fm-cap">{e.generic ? "Your traffic" : "The case's traffic"} · {ch.durationS} s{ch.atPeak ? " · at peak" : ""}{ch.scenario ? ` · ${ch.scenario.replace("-", " ")} at 10 s` : ""}{e.generic && ch.id === "serve-10k" ? " at 10,000 QPS" : ""}</p>
            <button type="button" className="fm-btn fm-btn--tool is-on justify-self-start" disabled={!!e.disabled || busy === e.key} aria-describedby={e.disabled ? `${e.key}-why` : undefined} onClick={() => check(e)}>
              {busy === e.key ? "Checking…" : c ? "Check again" : "Check"}
            </button>
            {e.disabled && <p id={`${e.key}-why`} className="fm-help">{e.disabled}</p>}
            {c && (
              <div role="status" className="grid gap-1.5">
                <span className={`fm-status fm-status--${c.passed ? "ok" : "over"} justify-self-start`}><span className="g" aria-hidden>{c.passed ? "●" : "■"}</span>{c.passed ? "Passed" : "Not passed"}</span>
                <table className="sdl-runtable">
                  <thead><tr><th>Target</th><th className="!text-right">Actual</th><th className="!text-right">Goal</th></tr></thead>
                  <tbody>
                    {c.results.map((x) => (
                      <tr key={x.key}>
                        <td><span aria-hidden>{x.passed ? "● " : "■ "}</span>{x.label}<span className="sr-only">{x.passed ? " (met)" : " (missed)"}</span></td>
                        <td className="n" style={x.passed ? undefined : { color: "var(--status-over)" }}>{fmtTarget(x.key, x.actual)}</td>
                        <td className="n">{x.key.startsWith("min") ? "≥ " : "≤ "}{fmtTarget(x.key, x.target)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
