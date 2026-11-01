"use client";
import type { ViewProps } from "@/lib/sim/definition";
import { ALGOS, NODES, memoryBytes, type RlConfig, type RlState } from "./model";

const X0 = 190, X1 = 625, SPAN = 6_000;
const LANE_H = 52, TOP = 40;
const MARK = { 1: "var(--status-ok)", 0: "var(--status-over)", 2: "var(--ink-muted)" } as const;

export function RlView({ state, config, t }: ViewProps<RlConfig, RlState>) {
  const x = (time: number) => X1 - ((t - time) / SPAN) * (X1 - X0);
  const W = config.window * 1000;
  const L = Math.round(config.rate * config.window);
  const bounds: number[] = [];
  for (let b = Math.ceil((t - SPAN) / W) * W; b <= t; b += W) if (b >= 0) bounds.push(b);
  const sec = Math.max(t, 1) / 1000;
  const shared = state.lanes.tb.allowed / sec, local = state.localAllowed / sec;
  const h = TOP + ALGOS.length * LANE_H + (config.distributed ? 90 : 20);
  return (
    <svg viewBox={`0 0 640 ${h}`} className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`Five rate limiters on the same traffic. Allowed per second: ${ALGOS.map((a) => `${a.label} ${(state.lanes[a.id].allowed / sec).toFixed(1)}`).join(", ")}`}>
      <text x={8} y={20} className="sim-sub" fill="var(--ink)">LIMIT {L} PER {config.window} s · LAST 6 s</text>
      {([[1, "ALLOWED"], [2, "QUEUED"], [0, "REJECTED"]] as const).map(([v, label], i) => (
        <g key={label}><rect x={X0 + 90 + i * 110} y={11} width={6} height={12} fill={MARK[v]} /><text x={X0 + 100 + i * 110} y={20} className="sim-sub" fill="var(--ink)">{label}</text></g>
      ))}
      {bounds.map((b) => (
        <g key={b}>
          <line x1={x(b)} x2={x(b)} y1={TOP - 6} y2={TOP + ALGOS.length * LANE_H - 8} stroke="var(--ink)" strokeOpacity={0.35} strokeDasharray="2 3" />
        </g>
      ))}
      {ALGOS.map((a, i) => {
        const l = state.lanes[a.id];
        const y = TOP + i * LANE_H;
        // Buckets may burst above R × W by design; only window algorithms promise a hard cap per window.
        const over = l.maxInWindow > L && (a.id === "fw" || a.id === "sl" || a.id === "sc");
        return (
          <g key={a.id}>
            <text x={8} y={y + 14} className="sim-lbl" fill="var(--ink)">{a.label.toUpperCase()}</text>
            <text x={8} y={y + 30} className="sim-sub" fill="var(--ink-muted)">{(l.allowed / sec).toFixed(1)}/s OK · {(l.rejected / sec).toFixed(1)}/s NO</text>
            <text x={8} y={y + 44} className="sim-sub" fill={over ? "var(--status-over)" : "var(--ink-muted)"}>PEAK {l.maxInWindow}/{config.window}s{over ? " · OVER" : ""} · {memoryBytes(state, a.id)} B</text>
            <line x1={X0} x2={X1} y1={y + 22} y2={y + 22} stroke="var(--ink)" strokeWidth={1} />
            {l.marks.filter((m) => m.t > t - SPAN).map((m, j) => (
              <rect key={j} x={x(m.t) - 1.5} y={m.v === 1 ? y + 8 : m.v === 0 ? y + 24 : y + 16} width={3} height={12} fill={MARK[m.v]} />
            ))}
          </g>
        );
      })}
      {config.distributed && (
        <g transform={`translate(0 ${TOP + ALGOS.length * LANE_H + 4})`}>
          <rect x={8} y={0} width={617} height={74} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1} />
          <text x={20} y={22} className="sim-lbl" fill="var(--ink)">DISTRIBUTED · {NODES} APP SERVERS</text>
          <text x={20} y={42} className="sim-sub" fill="var(--ink)">LOCAL BUCKET ON EACH NODE: {local.toFixed(1)}/s ADMITTED</text>
          <text x={20} y={60} className="sim-sub" fill="var(--ink)">ONE SHARED BUCKET (E.G. REDIS): {shared.toFixed(1)}/s ADMITTED</text>
          <text x={612} y={52} textAnchor="end" className="sim-lbl" fill={local > shared * 1.2 ? "var(--status-over)" : "var(--ink)"}>{shared > 0 ? `${(local / shared).toFixed(1)}× OVER` : "—"}</text>
        </g>
      )}
    </svg>
  );
}
