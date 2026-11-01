// Shared SVG helpers for simulator canvases: isometric blocks, leader-line labels, request dots.
import type { ReactNode } from "react";

const ISO = 0.5; // depth offset ratio for the isometric top/side faces

export type Tone = "ok" | "hot" | "over" | "idle";
const FILL: Record<Tone, string> = { ok: "var(--status-ok-fill)", hot: "var(--status-hot-fill)", over: "var(--status-over-fill)", idle: "var(--surface)" };

/** An isometric box: front face at (x, y) with size w×h, top and side faces at depth d. */
export function IsoBlock({ x, y, w, h, d = 16, tone = "idle", fill, label, sub }: { x: number; y: number; w: number; h: number; d?: number; tone?: Tone; fill?: string; label?: string; sub?: string }) {
  const dx = d, dy = -d * ISO;
  const f = fill ?? FILL[tone];
  // Status fills are light in Paper and dark in Blueprint, so ink contrasts with both.
  const text = fill ? "#121212" : "var(--ink)";
  return (
    <g>
      <path d={`M${x},${y} l${dx},${dy} h${w} l${-dx},${-dy} z`} fill={f} stroke="var(--ink)" strokeWidth={1} style={{ filter: "brightness(1.08)" }} />
      <path d={`M${x + w},${y} l${dx},${dy} v${h} l${-dx},${-dy} z`} fill={f} stroke="var(--ink)" strokeWidth={1} style={{ filter: "brightness(0.85)" }} />
      <rect x={x} y={y} width={w} height={h} fill={f} stroke="var(--ink)" strokeWidth={1.5} />
      {label && <text x={x + w / 2} y={y + h / 2 + (sub ? -2 : 4)} textAnchor="middle" className="sim-lbl" fill={text}>{label}</text>}
      {sub && <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" className="sim-sub" fill={text}>{sub}</text>}
    </g>
  );
}

/** A leader line from a point to a mono label, like a callout on a technical drawing. */
export function Leader({ from, to, children, anchor = "start" }: { from: [number, number]; to: [number, number]; children: ReactNode; anchor?: "start" | "end" | "middle" }) {
  const [x1, y1] = from, [x2, y2] = to;
  return (
    <g className="sim-leader">
      <circle cx={x1} cy={y1} r={2.5} fill="var(--ink)" />
      <polyline points={`${x1},${y1} ${x2},${y2} ${x2 + (anchor === "end" ? -24 : 24)},${y2}`} fill="none" stroke="var(--ink)" strokeWidth={1} />
      <text x={x2 + (anchor === "end" ? -28 : 28)} y={y2 + 4} textAnchor={anchor} className="sim-sub" fill="var(--ink)">{children}</text>
    </g>
  );
}

/** Point p (0–1) of the way from a to b. */
export const lerp = (a: [number, number], b: [number, number], p: number): [number, number] => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];

/** A request travelling along a straight segment; position comes from sim time, not CSS. */
export function Dot({ from, to, p, color = "var(--cobalt)" }: { from: [number, number]; to: [number, number]; p: number; color?: string }) {
  const [x, y] = lerp(from, to, Math.min(1, Math.max(0, p)));
  return <circle cx={x} cy={y} r={4} fill={color} stroke="var(--ink)" strokeWidth={1} />;
}

/** Dashed connector between components. */
export function Wire({ from, to }: { from: [number, number]; to: [number, number] }) {
  return <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="var(--ink)" strokeWidth={1} strokeDasharray="4 3" />;
}
