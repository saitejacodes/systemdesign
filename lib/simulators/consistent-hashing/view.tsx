"use client";
import type { ViewProps } from "@/lib/sim/definition";
import { MAX_NODES, MIN_NODES, counts, spread, type ChConfig, type ChState } from "./model";

const COLORS = ["var(--phase-1)", "var(--phase-3)", "var(--phase-4)", "var(--phase-6)", "var(--phase-2)", "var(--phase-5)", "var(--status-hot)", "var(--status-over)", "var(--ink-muted)", "var(--cobalt)"];
const CX = 175, CY = 185, R = 140;
const MAX_TICKS = 1200;
const KEY_DOTS = 260;
const FLASH_MS = 1500;

const at = (pos: number, r: number): [number, number] => {
  const a = (pos / 2 ** 32) * 2 * Math.PI - Math.PI / 2;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};

export function ChView({ state, t, reducedMotion, act }: ViewProps<ChConfig, ChState>) {
  const color = (id: number) => COLORS[id % COLORS.length];
  const c = counts(state, state.ownerC);
  const m = counts(state, state.ownerM);
  const max = Math.max(...c, ...m, 1);
  const mean = state.k / state.ids.length;
  const step = Math.max(1, Math.ceil(state.ring.length / MAX_TICKS));
  const keyStep = Math.max(1, Math.floor(state.k / KEY_DOTS));
  const last = state.last;
  const flashing = last && (reducedMotion || t - last.t < FLASH_MS);
  const bw = Math.min(26, 200 / state.ids.length);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={state.ids.length >= MAX_NODES} onClick={() => act("add")}>+ Add node</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={state.ids.length <= MIN_NODES} onClick={() => act("remove")}>− Remove node</button>
        <span className="fm-cap">{state.ids.length} nodes · {state.v} virtual each · {state.k.toLocaleString()} keys</span>
      </div>
      <div className="min-w-0 overflow-x-auto">
      <svg viewBox="0 0 640 370" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`Hash ring with ${state.ids.length} nodes and ${state.v} virtual nodes each; keys per node from ${Math.min(...c)} to ${Math.max(...c)}`}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
        <text x={CX} y={CY - R - 10} textAnchor="middle" className="sim-sub" fill="var(--ink-muted)">0 · 2³²</text>
        {/* Virtual nodes as ticks on the ring */}
        {state.ring.filter((_, i) => i % step === 0).map((p, i) => {
          const [x1, y1] = at(p.pos, R - 7), [x2, y2] = at(p.pos, R + 9);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color(p.id)} strokeWidth={state.ring.length > 200 ? 1.5 : 3} />;
        })}
        {/* A sample of keys inside the ring; keys that just moved flash larger */}
        {Array.from({ length: Math.ceil(state.k / keyStep) }, (_, j) => {
          const i = j * keyStep;
          const [x, y] = at(state.keyPos[i], R - 22);
          const moved = flashing && last.moved[i];
          return <circle key={i} cx={x} cy={y} r={moved ? 4.5 : 2} fill={color(state.ownerC[i])} stroke={moved ? "var(--ink)" : "none"} strokeWidth={1} />;
        })}
        <text x={CX} y={CY - 6} textAnchor="middle" className="sim-lbl" fill="var(--ink)">HASH RING</text>
        <text x={CX} y={CY + 12} textAnchor="middle" className="sim-sub" fill="var(--ink-muted)">SPREAD {(spread(c) * 100).toFixed(1)}%</text>

        {/* Keys per node: consistent (solid) vs modulo (outline) */}
        <text x={360} y={30} className="sim-sub" fill="var(--ink)">KEYS PER NODE · RING ▮ MODULO ▯</text>
        <line x1={360} x2={620} y1={190 - (mean / max) * 140} y2={190 - (mean / max) * 140} stroke="var(--ink)" strokeDasharray="3 3" />
        <text x={622} y={186 - (mean / max) * 140} textAnchor="end" className="sim-sub" fill="var(--ink-muted)">MEAN</text>
        {state.ids.map((id, i) => {
          const x = 366 + i * (250 / state.ids.length);
          return (
            <g key={id}>
              <rect x={x} y={190 - (c[i] / max) * 140} width={bw / 2} height={(c[i] / max) * 140} fill={color(id)} stroke="var(--ink)" strokeWidth={1} />
              <rect x={x + bw / 2} y={190 - (m[i] / max) * 140} width={bw / 2} height={(m[i] / max) * 140} fill="none" stroke="var(--ink)" strokeWidth={1} />
              <text x={x + bw / 2} y={206} textAnchor="middle" className="sim-sub" fill="var(--ink)">N{id + 1}</text>
            </g>
          );
        })}

        {/* Keys moved by the last change */}
        <text x={360} y={250} className="sim-sub" fill="var(--ink)">MOVED BY LAST CHANGE{last ? ` · ${last.kind === "vnodes" ? `V ${last.from}→${last.to}` : `${last.from}→${last.to} NODES`}` : ""}</text>
        {[["RING", last?.movedC ?? 0], ["MODULO", last?.movedM ?? 0]].map(([label, v], i) => (
          <g key={label as string}>
            <text x={360} y={280 + i * 34} className="sim-sub" fill="var(--ink)">{label}</text>
            <rect x={420} y={268 + i * 34} width={160} height={16} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1} />
            <rect x={420} y={268 + i * 34} width={160 * (v as number)} height={16} fill={i ? "var(--status-over-fill)" : "var(--status-ok-fill)"} />
            <text x={586} y={281 + i * 34} className="sim-sub" fill="var(--ink)">{last ? `${((v as number) * 100).toFixed(0)}%` : "—"}</text>
          </g>
        ))}
        {!last && <text x={360} y={350} className="sim-sub" fill="var(--ink-muted)">ADD OR REMOVE A NODE TO COMPARE</text>}
      </svg>
      </div>
    </div>
  );
}
