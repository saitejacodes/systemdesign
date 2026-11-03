"use client";
import { useRef, useState, type PointerEvent as PE } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { MAJORITY, N, leaderOf, partitioned, sideSize, type Msg, type RaftConfig, type RaftState, type RNode } from "./model";

const W = 700;
const H = 300;
const MID = W / 2;
const R = 26;
const COLS = 16;
const CW = 38;
const ROW = 26;
const LX = 92;

const ROLE = {
  leader: { fill: "var(--cobalt)", text: "var(--on-cobalt)", label: "LEADER" },
  candidate: { fill: "var(--status-hot-fill)", text: "var(--ink)", label: "CANDIDATE" },
  follower: { fill: "var(--surface)", text: "var(--ink)", label: "FOLLOWER" },
} as const;
const MSG = {
  RV: { color: "var(--status-hot)", label: "RequestVote" },
  RVR: { color: "var(--status-hot)", label: "vote reply" },
  AE: { color: "var(--cobalt)", label: "AppendEntries" },
  AER: { color: "var(--status-ok)", label: "append reply" },
} as const;
const TERM_COLORS = [1, 2, 3, 4, 6].map((k) => `var(--phase-${k})`);
const termColor = (t: number) => TERM_COLORS[t % TERM_COLORS.length];

/** Nodes in a group sit on a small circle centred in their half of the canvas. */
function positions(s: RaftState): [number, number][] {
  const out: [number, number][] = [];
  for (const g of [0, 1] as const) {
    const ids = s.nodes.map((n, i) => (n.group === g ? i : -1)).filter((i) => i >= 0);
    const r = ids.length === 1 ? 0 : ids.length === 2 ? 60 : 95;
    ids.forEach((i, k) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / ids.length;
      out[i] = [MID / 2 + g * MID + r * Math.cos(a), 150 + r * Math.sin(a)];
    });
  }
  return out;
}

function Node({ n, i, at, t, onDown }: { n: RNode; i: number; at: [number, number]; t: number; onDown(e: PE): void }) {
  const r = ROLE[n.role];
  const left = n.role === "leader" || n.down ? 0 : Math.max(0, Math.min(1, (n.deadline - t) / Math.max(1, n.timeoutLen)));
  const C = 2 * Math.PI * (R + 5);
  return (
    <g transform={`translate(${at[0]},${at[1]})`} opacity={n.down ? 0.45 : 1} onPointerDown={onDown} style={{ cursor: "grab", touchAction: "none" }} aria-hidden>
      {left > 0 && <circle r={R + 5} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray={`${C * left} ${C}`} transform="rotate(-90)" />}
      <circle r={R} fill={n.down ? "var(--surface-sunk)" : r.fill} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray={n.down ? "4 3" : undefined} />
      <text y={-3} textAnchor="middle" className="sim-lbl" fill={n.down ? "var(--ink)" : r.text}>N{i + 1}</text>
      <text y={12} textAnchor="middle" className="sim-sub" fontSize={10} fill={n.down ? "var(--ink)" : r.text}>T{n.term}</text>
      <text y={R + 18} textAnchor="middle" className="sim-sub" fontSize={10.5} fill="var(--ink)">{n.down ? "DOWN" : r.label}{n.slow ? " · SLOW" : ""}</text>
      <text y={R + 31} textAnchor="middle" className="sim-sub" fontSize={10} fill="var(--ink-muted)">
        {n.role === "candidate" ? `${n.votes.length}/${MAJORITY} votes` : n.votedFor !== null && n.role === "follower" ? `voted N${n.votedFor + 1}` : ""}
      </text>
    </g>
  );
}

function Dots({ s, pos, t }: { s: RaftState; pos: [number, number][]; t: number }) {
  return (
    <g aria-hidden>
      {s.msgs.slice(-60).map((m: Msg) => {
        const a = pos[m.from], b = pos[m.to];
        let p = Math.min(1, Math.max(0, (t - m.sent) / Math.max(1, m.at - m.sent)));
        const cut = s.nodes[m.from].group !== s.nodes[m.to].group;
        if (cut) p = Math.min(p, Math.abs(MID - a[0]) / Math.max(1, Math.abs(b[0] - a[0])) - 0.03); // stops at the cut
        const x = a[0] + (b[0] - a[0]) * p, y = a[1] + (b[1] - a[1]) * p;
        const big = m.kind === "RV" || (m.kind === "AE" && m.entries.length > 0);
        const reply = m.kind === "RVR" || m.kind === "AER";
        return <circle key={m.id} cx={x} cy={y} r={big ? 5 : 3.5} fill={reply ? "var(--surface)" : MSG[m.kind].color} stroke={reply ? MSG[m.kind].color : "var(--ink)"} strokeWidth={reply ? 2 : 1} opacity={cut ? 0.5 : 1} />;
      })}
    </g>
  );
}

function LogTable({ s }: { s: RaftState }) {
  const longest = Math.max(1, ...s.nodes.map((n) => n.log.length));
  const from = Math.max(1, longest - COLS + 1);
  const h = 22 + N * ROW;
  return (
    <svg viewBox={`0 0 ${LX + COLS * CW} ${h}`} className="h-auto w-full max-sm:min-w-[560px]" role="img"
      aria-label={`Logs from index ${from}. ${s.nodes.map((n, i) => `N${i + 1}: ${n.log.length} entries, commit ${n.commit}`).join("; ")}`}>
      {Array.from({ length: COLS }, (_, k) => <text key={k} x={LX + k * CW + CW / 2} y={13} textAnchor="middle" className="sim-sub" fontSize={10} fill="var(--ink-muted)">#{from + k}</text>)}
      {s.nodes.map((n, i) => {
        const y = 20 + i * ROW;
        return (
          <g key={i} opacity={n.down ? 0.45 : 1}>
            <text x={4} y={y + 15} className="sim-sub" fontSize={11} fill="var(--ink)">N{i + 1} c={n.commit}</text>
            {Array.from({ length: COLS }, (_, k) => {
              const idx = from + k;
              const e = n.log[idx - 1];
              if (!e) return null;
              const done = idx <= n.commit;
              const x = LX + k * CW + 2;
              return (
                <g key={k}>
                  <title>{`#${idx} · term ${e.term} · ${e.id ? `write w${e.id}` : "no-op"} · ${done ? "committed" : "not committed"}`}</title>
                  <rect x={x} y={y + 2} width={CW - 4} height={ROW - 6} rx={2} fill={done ? "var(--ink)" : "var(--surface)"} stroke="var(--ink)" strokeWidth={1} strokeDasharray={done ? undefined : "3 2"} />
                  <rect x={x + 2} y={y + 4} width={CW - 8} height={3} fill={termColor(e.term)} />
                  <text x={x + (CW - 4) / 2} y={y + 17} textAnchor="middle" className="sim-sub" fontSize={10.5} fill={done ? "var(--paper)" : "var(--ink)"}>{e.id ? `T${e.term}` : `T${e.term}·∅`}</text>
                </g>
              );
            })}
            {n.commit >= from && n.commit < from + COLS && <line x1={LX + (n.commit - from + 1) * CW} x2={LX + (n.commit - from + 1) * CW} y1={y} y2={y + ROW - 2} stroke="var(--ink)" strokeWidth={2.5} />}
          </g>
        );
      })}
    </svg>
  );
}

export function RaftView({ state: s, t, reducedMotion, act }: ViewProps<RaftConfig, RaftState>) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ i: number; x: number; y: number } | null>(null);
  const pos = positions(s);
  if (drag) pos[drag.i] = [drag.x, drag.y];
  const L = leaderOf(s);
  const part = partitioned(s);
  const pt = (e: PE) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.max(R, Math.min(W - R, p.x)), y: Math.max(R, Math.min(H - R, p.y)) };
  };
  const sideLabel = (g: 0 | 1) => {
    const k = s.nodes.filter((n) => n.group === g).length;
    if (!k) return g ? "SIDE B · DRAG A NODE HERE TO PARTITION" : "SIDE A · EMPTY";
    return `SIDE ${g ? "B" : "A"} · ${k}/${N} ${!part ? "" : k >= MAJORITY ? "· MAJORITY, CAN COMMIT" : "· MINORITY, CANNOT COMMIT"}`;
  };
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-sm:min-w-[560px] select-none" role="img"
          aria-label={`${L >= 0 ? `Leader N${L + 1} in term ${s.nodes[L].term}` : "No leader"}. ${s.nodes.map((n, i) => `N${i + 1} ${n.down ? "down" : n.role} term ${n.term} side ${n.group ? "B" : "A"}`).join(", ")}.`}
          onPointerMove={(e) => drag && setDrag({ i: drag.i, ...pt(e) })}
          onPointerUp={(e) => { if (!drag) return; const g = pt(e).x > MID ? 1 : 0; if (g !== s.nodes[drag.i].group) act("move", { node: drag.i, group: g }); setDrag(null); }}
          onPointerLeave={() => setDrag(null)}>
          <rect x={MID + 4} y={4} width={MID - 8} height={H - 8} fill={part ? "var(--surface-sunk)" : "none"} stroke="var(--line)" strokeDasharray="4 4" rx={3} />
          <line x1={MID} x2={MID} y1={8} y2={H - 8} stroke={part ? "var(--status-over)" : "var(--line)"} strokeWidth={part ? 2 : 1} strokeDasharray="6 4" />
          {[0, 1].map((g) => <text key={g} x={g * MID + 12} y={22} className="sim-sub" fontSize={11} fill={part && sideSize(s, s.nodes.findIndex((n) => n.group === g)) < MAJORITY ? "var(--status-over)" : "var(--ink)"}>{sideLabel(g as 0 | 1)}</text>)}
          {!reducedMotion && <Dots s={s} pos={pos} t={t} />}
          {s.nodes.map((n, i) => <Node key={i} n={n} i={i} at={pos[i]} t={t} onDown={(e) => setDrag({ i, ...pt(e) })} />)}
          <text x={12} y={H - 12} className="sim-sub" fontSize={10.5} fill="var(--ink)">
            {reducedMotion ? `${s.msgs.length} MESSAGES IN FLIGHT · ` : ""}RING = ELECTION TIMER LEFT
          </text>
        </svg>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 fm-cap" aria-label="Message legend">
        {(Object.keys(MSG) as (keyof typeof MSG)[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill={k === "RVR" || k === "AER" ? "var(--surface)" : MSG[k].color} stroke={k === "RVR" || k === "AER" ? MSG[k].color : "var(--ink)"} strokeWidth={k === "RVR" || k === "AER" ? 2 : 1} /></svg>
            {MSG[k].label}
          </li>
        ))}
        <li>Big dot = carries entries</li>
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={L < 0} onClick={() => act("write")}>Client write{L >= 0 ? ` → N${L + 1}` : " (no leader)"}</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={L < 0} onClick={() => act("crash", { node: L })}>Crash leader</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!part} onClick={() => act("heal")}>Heal partition</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full font-mono text-[12px]">
          <caption className="fm-cap mb-1 text-left">Nodes · drag a node across the line, or use Side</caption>
          <thead><tr>{["Node", "Role", "Term", "Log / commit", "", "", ""].map((h, k) => <th key={k} className="border-b border-ink px-2 py-1 text-left whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {s.nodes.map((n, i) => (
              <tr key={i}>
                <td className="border-b border-line px-2 py-0.5">N{i + 1}</td>
                <td className="border-b border-line px-2 py-0.5" style={{ color: n.down ? "var(--status-over)" : undefined }}>{n.down ? "DOWN" : ROLE[n.role].label}</td>
                <td className="border-b border-line px-2 py-0.5">{n.term}</td>
                <td className="border-b border-line px-2 py-0.5">{n.log.length} / {n.commit}</td>
                <td className="border-b border-line px-1 py-0.5"><button type="button" className="fm-btn fm-btn--tool !h-7" onClick={() => act("toggleCrash", { node: i })}>{n.down ? "Restart" : "Crash"}</button></td>
                <td className="border-b border-line px-1 py-0.5"><button type="button" className="fm-btn fm-btn--tool !h-7" aria-pressed={n.slow} onClick={() => act("toggleSlow", { node: i })}>{n.slow ? "Slow ×6" : "Slow"}</button></td>
                <td className="border-b border-line px-1 py-0.5"><button type="button" className="fm-btn fm-btn--tool !h-7" aria-label={`Move N${i + 1} to side ${n.group ? "A" : "B"}`} onClick={() => act("move", { node: i, group: n.group ? 0 : 1 })}>Side {n.group ? "B → A" : "A → B"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figure className="grid gap-1">
        <figcaption className="fm-cap">Logs by index · solid = committed, dashed outline = not yet · T = term, ∅ = leader no-op · bar = commit index</figcaption>
        <div className="overflow-x-auto"><LogTable s={s} /></div>
      </figure>
    </div>
  );
}
