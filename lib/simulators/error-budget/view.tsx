"use client";
import { useState } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { RULES, budgetLeft, budgetMinutes, burn, fmtMinute, incidentErrMinutes, monthDone, pendingReview, threshold, type EbConfig, type EbState, type RuleId } from "./model";

const DAY = 1440;
const W = 760, X0 = 118, X1 = 748;
const BURN_TOP = 14, BURN_H = 110; // log scale 0.1× … 1000×
const BUD_TOP = 150, BUD_H = 70; // 100% … −25%
const LANE_TOP = 238, LANE_H = 16;
const PRESETS = [
  { label: "Hard outage · 100% · 15 min", minutes: 15, errPct: 100 },
  { label: "Degraded · 10% · 1 h", minutes: 60, errPct: 10 },
  { label: "Bad canary · 2% · 30 min", minutes: 30, errPct: 2 },
];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const by = (b: number) => BURN_TOP + BURN_H * (1 - (Math.log10(Math.max(0.1, Math.min(1000, b))) + 1) / 4);
const buy = (f: number) => BUD_TOP + BUD_H * (1 - (Math.max(-0.25, Math.min(1, f)) + 0.25) / 1.25);
const tone = (on: boolean, sev: "page" | "ticket") => (on ? (sev === "page" ? "var(--status-over)" : "var(--status-hot)") : "var(--status-ok)");

export function EbView({ state: s, act }: ViewProps<EbConfig, EbState>) {
  const xm = (m: number) => X0 + ((X1 - X0) * m) / s.windowMin;
  const bins = Math.min(360, s.windowMin / 60);
  const bm = s.windowMin / bins;
  // Per-bin average burn and end-of-bin budget straight from the prefix sums: no per-frame scans.
  let burnPath = "", budPts = "";
  for (let i = 0; i < bins; i++) {
    const a = Math.round(i * bm), b = Math.round((i + 1) * bm);
    if (a >= s.minute) break;
    const e = Math.min(b, s.minute);
    const br = (s.cum[e] - s.cum[a]) / (e - a) / (1 - s.slo);
    if (br > 0.1) burnPath += `M${xm(a).toFixed(1)} ${(BURN_TOP + BURN_H).toFixed(1)}V${by(br).toFixed(1)}H${xm(e).toFixed(1)}V${BURN_TOP + BURN_H}`;
    budPts += `${xm(e).toFixed(1)},${buy(budgetLeft(s, e)).toFixed(1)} `;
  }
  const review = pendingReview(s);
  const left = budgetLeft(s);
  const days = s.windowMin / DAY;
  return (
    <div className="grid gap-4 p-3 text-[14px] [&>*]:min-w-0">
      <section aria-label="Error budget" className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-[22px] font-semibold tabular-nums" style={{ color: left <= 0 ? "var(--status-over)" : left < 0.25 ? "var(--status-hot)" : "var(--status-ok)" }}>
          {left <= 0 ? "BUDGET SPENT · " : "BUDGET LEFT · "}{pct(left)}
        </p>
        <p className="fm-cap">{(left * budgetMinutes(s)).toFixed(1)} of {budgetMinutes(s).toFixed(1)} full-outage min · SLO {(s.slo * 100).toFixed(2).replace(/\.?0+$/, "")}% over {days} d · {fmtMinute(Math.min(s.minute, s.windowMin))}{monthDone(s) ? " · WINDOW DONE" : ""}</p>
      </section>

      {review && review.expected && (
        <section role="alertdialog" aria-label="Release review" className="fm-card grid gap-2 p-3" style={{ borderColor: "var(--cobalt)", borderWidth: 2 }}>
          <h3 className="fm-cap !text-ink">RELEASE REVIEW · {fmtMinute(review.minute)} · TIME IS STOPPED</h3>
          <p><strong>{review.name}</strong> wants to ship. Policy: <em>hold</em> if this window&apos;s error budget is spent (the SRE workbook&apos;s example policy) or a page is firing; tickets don&apos;t block. Otherwise <em>ship</em>.</p>
          <p className="fm-cap">Now: budget {pct(review.budgetLeft ?? 0)} · page {review.paging ? "FIRING" : "quiet"} · ticket {review.ticket ? "OPEN" : "none"}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="fm-btn fm-btn--tool is-on !h-8" onClick={() => act("decide", { id: review.id, verdict: "ship" })}>Ship it</button>
            <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("decide", { id: review.id, verdict: "hold" })}>Hold the release</button>
          </div>
        </section>
      )}

      <figure className="grid gap-1">
        <figcaption className="fm-cap">Burn rate per {bm >= 60 ? `${bm / 60} h` : `${bm} min`} (log) · budget left · alert lanes · day 0–{days}</figcaption>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} 300`} className="h-auto w-full max-sm:min-w-[600px]" role="img" aria-label={`Budget ${pct(left)} left at ${fmtMinute(s.minute)}; ${s.pages} pages, ${s.tickets} tickets so far`}>
            {[1, 10, 100].map((b) => <g key={b}><line x1={X0} x2={X1} y1={by(b)} y2={by(b)} stroke="var(--line)" /><text x={X0 - 6} y={by(b) + 4} textAnchor="end" className="sim-sub" fill="var(--ink-muted)">{b}×</text></g>)}
            {/* The three thresholds sit close on the log axis, so their labels are staggered. */}
            {RULES.map((r, i) => {
              const thr = threshold(r, s.windowMin);
              return <g key={r.id}><line x1={X0} x2={X1} y1={by(thr)} y2={by(thr)} stroke={r.severity === "page" ? "var(--status-over)" : "var(--status-hot)"} strokeDasharray="5 4" /><text x={X1 - i * 48} y={by(thr) - 3} textAnchor="end" className="sim-sub" fill={r.severity === "page" ? "var(--status-over)" : "var(--status-hot)"}>{thr.toFixed(1)}×</text></g>;
            })}
            <path d={burnPath} fill="var(--phase-5)" stroke="var(--ink)" strokeWidth={0.6} />
            <text x={4} y={BURN_TOP + 10} className="sim-sub" fill="var(--ink)">BURN RATE</text>

            {[1, 0.5, 0].map((f) => <g key={f}><line x1={X0} x2={X1} y1={buy(f)} y2={buy(f)} stroke={f === 0 ? "var(--status-over)" : "var(--line)"} /><text x={X0 - 6} y={buy(f) + 4} textAnchor="end" className="sim-sub" fill="var(--ink-muted)">{f * 100}%</text></g>)}
            <polyline points={budPts} fill="none" stroke="var(--cobalt)" strokeWidth={2} />
            <text x={4} y={BUD_TOP + 10} className="sim-sub" fill="var(--ink)">BUDGET LEFT</text>

            {RULES.map((r, k) => {
              const y = LANE_TOP + k * (LANE_H + 4);
              return (
                <g key={r.id}>
                  <text x={4} y={y + 12} className="sim-sub" fill="var(--ink)">{r.severity === "page" ? `PAGE ${r.longMin / 60} h` : "TICKET 3 d"}</text>
                  <rect x={X0} y={y} width={X1 - X0} height={LANE_H} fill="var(--surface-sunk)" stroke="var(--line)" />
                  {s.firings.filter((f) => f.rule === r.id).map((f, i) => (
                    <rect key={i} x={xm(f.start)} y={y} width={Math.max(2, xm(f.end ?? s.minute) - xm(f.start))} height={LANE_H} fill={r.severity === "page" ? "var(--status-over)" : "var(--status-hot)"} />
                  ))}
                </g>
              );
            })}
            {s.incidents.filter((i) => i.start <= s.minute).map((i) => <path key={i.id} d={`M${xm(i.start)} ${BURN_TOP + BURN_H + 2}l-4 7h8z`} fill={i.source === "you" ? "var(--cobalt)" : "var(--ink)"} />)}
            {s.reviews.map((r) => {
              const ok = r.decision ? r.decision === r.expected : undefined;
              return <g key={r.id}><line x1={xm(r.minute)} x2={xm(r.minute)} y1={BURN_TOP} y2={LANE_TOP + 58} stroke="var(--cobalt)" strokeDasharray="2 3" /><text x={xm(r.minute) + 3} y={BUD_TOP - 6} className="sim-sub" fill={ok === false ? "var(--status-over)" : "var(--cobalt)"}>R{r.id}{r.decision ? ` ${r.decision.toUpperCase()} ${ok ? "✓" : "✗"}` : ""}</text></g>;
            })}
            <line x1={xm(s.minute)} x2={xm(s.minute)} y1={BURN_TOP - 4} y2={LANE_TOP + 60} stroke="var(--ink)" strokeWidth={1.5} />
            {Array.from({ length: Math.floor(days / 5) + 1 }, (_, d) => <text key={d} x={xm(d * 5 * DAY)} y={296} textAnchor="middle" className="sim-sub" fill="var(--ink-muted)">d{d * 5}</text>)}
          </svg>
        </div>
      </figure>

      <Rules s={s} />
      <Inject s={s} act={act} />
      <Incidents s={s} />
    </div>
  );
}

function Rules({ s }: { s: EbState }) {
  const hours = (b: number) => (b > 0 ? (s.windowMin / 60 / b) : Infinity);
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">Multiwindow, multi-burn-rate alerts (SRE workbook, ch. 5) · fires when BOTH windows burn ≥ threshold</figcaption>
      <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
        <table className="w-full font-mono text-[12px]">
          <thead><tr>{["Rule", "Long window", "Short window", "Threshold", "Budget spent if sustained", "Status"].map((h) => <th key={h} className="whitespace-nowrap border-b border-ink px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {RULES.map((r) => {
              const thr = threshold(r, s.windowMin);
              const on = s.firing[r.id as RuleId];
              const L = burn(s, r.longMin), S = burn(s, r.shortMin);
              const cell = (b: number) => <span style={{ color: b >= thr ? tone(true, r.severity) : undefined }}>{b.toFixed(2)}×{b >= thr ? " ▲" : ""}</span>;
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap border-b border-line px-2 py-1">{r.label}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-1">{fmtW(r.longMin)}: {cell(L)}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-1">{fmtW(r.shortMin)}: {cell(S)}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-1">{thr.toFixed(1)}×</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-1">{r.budgetFrac * 100}% in {fmtW(r.longMin)} · all in {hours(thr).toFixed(0)} h</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-1 font-semibold" style={{ color: tone(on, r.severity) }}>{on ? "FIRING" : "QUIET"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px]">Burn rate = error ratio ÷ (1 − SLO). The long window makes the alert significant (it has already cost {RULES[0].budgetFrac * 100}% of the budget); the short window, 1/12 as long, lets it stop within minutes of the fix.</p>
    </figure>
  );
}

const fmtW = (m: number) => (m >= DAY ? `${m / DAY} d` : m >= 60 ? `${m / 60} h` : `${m} m`);

function Inject({ s, act }: { s: EbState; act: ViewProps<EbConfig, EbState>["act"] }) {
  const [minutes, setMinutes] = useState(30);
  const [errPct, setErrPct] = useState(1);
  const off = monthDone(s);
  const cost = (m: number, e: number) => pct(((e / 100) * m) / budgetMinutes(s));
  return (
    <fieldset className="fm-card grid gap-2 p-3">
      <legend className="fm-cap px-1">Inject an incident at {fmtMinute(s.minute)}</legend>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => <button key={p.label} type="button" disabled={off} className="fm-btn fm-btn--tool !h-8" onClick={() => act("inject", p)}>{p.label} · {cost(p.minutes, p.errPct)}</button>)}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1"><span className="fm-cap">Duration (min)</span><input className="fm-input !h-8 !w-28" type="number" min={1} max={20160} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 1)} /></label>
        <label className="grid gap-1"><span className="fm-cap">Errors (%)</span><input className="fm-input !h-8 !w-24" type="number" min={0.01} max={100} step={0.05} value={errPct} onChange={(e) => setErrPct(Number(e.target.value) || 0.01)} /></label>
        <button type="button" disabled={off} className="fm-btn fm-btn--tool is-on !h-8" onClick={() => act("inject", { minutes, errPct })}>Inject</button>
        <span className="fm-cap">≈ {(errPct / 100 / (1 - s.slo)).toFixed(1)}× burn · spends {cost(minutes, errPct)} of the budget</span>
      </div>
    </fieldset>
  );
}

function Incidents({ s }: { s: EbState }) {
  const seen = s.incidents.filter((i) => i.start <= s.minute);
  if (!seen.length) return <p className="fm-cap">No incidents yet in this window.</p>;
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">Incidents so far · budget cost · first alert and how long it took</figcaption>
      <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
        <table className="w-full font-mono text-[12px]">
          <thead><tr>{["Start", "Length", "Errors", "Burn", "Budget", "First alert", "Source"].map((h) => <th key={h} className="whitespace-nowrap border-b border-ink px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {seen.map((i) => {
              const f = s.firings.find((x) => x.start >= i.start && x.start <= i.start + i.minutes);
              const rule = f && RULES.find((r) => r.id === f.rule)!;
              return (
                <tr key={i.id}>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{fmtMinute(i.start)}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{fmtW(i.minutes)}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{(i.err * 100).toFixed(i.err < 0.01 ? 2 : 0)}%</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{(i.err / (1 - s.slo)).toFixed(1)}×</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{pct(incidentErrMinutes(i) / budgetMinutes(s))}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5" style={{ color: rule ? tone(true, rule.severity) : undefined }}>{rule ? `${rule.label} after ${f.start - i.start} min` : "none"}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{i.source === "you" ? "you" : i.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
