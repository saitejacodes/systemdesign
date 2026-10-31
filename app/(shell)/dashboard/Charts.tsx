"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Plotted like a technical graph: mono axes, hairline grid, flat ink/cobalt marks.
const tick = { fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--ink-muted)" };
const axis = { stroke: "var(--ink)", tickLine: false, tick };
const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--ink)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11 }, cursor: { fill: "var(--line)" } };

export function Figure({ code, title, empty, children }: { code: string; title: string; empty?: string; children: React.ReactNode }) {
  return (
    <figure className="fm-card min-w-0">
      <figcaption className="fm-card__head"><span>{code} · {title}</span></figcaption>
      <div className="fm-card__body">{empty ? <p className="grid h-[180px] place-items-center text-center text-ink-muted">{empty}</p> : children}</div>
    </figure>
  );
}

export function DailyBars({ data, color, label }: { data: { day: string; v: number }[]; color: string; label: string }) {
  return (
    <ResponsiveContainer width="100%" height={180} initialDimension={{ width: 320, height: 180 }}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="day" {...axis} interval={6} />
        <YAxis {...axis} allowDecimals={false} width={48} />
        <Tooltip {...tip} formatter={(v) => [v, label]} />
        <Bar dataKey="v" fill={color} stroke="var(--ink)" strokeWidth={1} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AccuracyLine({ data }: { data: { n: number; pct: number; label: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180} initialDimension={{ width: 320, height: 180 }}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" />
        <XAxis dataKey="n" {...axis} />
        <YAxis {...axis} domain={[0, 100]} ticks={[0, 25, 50, 80, 100]} width={48} unit="%" />
        <Tooltip {...tip} labelFormatter={(_, p) => p?.[0]?.payload.label ?? ""} formatter={(v) => [`${v}%`, "Score"]} />
        <Line dataKey="pct" stroke="var(--cobalt)" strokeWidth={2} dot={{ r: 3, fill: "var(--surface)", stroke: "var(--cobalt)" }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
