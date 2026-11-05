"use client";
import { useState } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { KEY_SPACE, L0_MAX, btLevels, btWA, lsmWA, type BNode, type IvConfig, type IvState } from "./model";

// M leaves room either side for the "+N more nodes" counts.
const W = 640, M = 40, MAX_NODES = 9;

export function IvView({ state, config, reducedMotion, act }: ViewProps<IvConfig, IvState>) {
  const [key, setKey] = useState(42);
  const last = state.last;
  const valid = Number.isInteger(key) && key >= 0 && key < KEY_SPACE;
  const run = (kind: "insert" | "search" | "delete") => valid && act(kind, { key, batch: config.batch, bloom: config.bloom });
  return (
    <div className="grid gap-4 p-3 text-[14px] [&>*]:min-w-0">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="fm-cap">Key (0–{KEY_SPACE - 1})</span>
          <input type="number" className="fm-input fm-input--mono !h-8 !w-28" min={0} max={KEY_SPACE - 1} value={key} onChange={(e) => setKey(Number(e.target.value))} aria-invalid={!valid} />
        </label>
        <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={!valid} onClick={() => run("insert")}>Insert</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!valid} onClick={() => run("search")}>Search</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!valid} onClick={() => run("delete")}>Delete</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={state.inserted >= 5000} onClick={() => act("bulk", { n: 1000, config, seed: 1 })}>Insert 1,000 {config.pattern}</button>
      </div>
      {last && (
        <p role="status" className="font-mono text-[12px]">
          {last.kind.toUpperCase()} {last.key}: B-tree visited {last.path.length} node{last.path.length === 1 ? "" : "s"}{last.split.length ? `, split ${last.split.length}` : ""}
          {last.kind === "search" && ` · ${last.found ? "found" : "not found"} · LSM opened ${last.files.length} SSTable${last.files.length === 1 ? "" : "s"}${config.bloom ? " (Bloom on)" : ""}`}
          {last.kind === "delete" && (last.found ? " · removed; LSM wrote a tombstone" : " · key not present")}
        </p>
      )}

      <section aria-label="B-tree" className="grid gap-1">
        <h3 className="fm-cap !text-ink">B-tree · order {state.tree.order} · height {btLevels(state.tree).length} · {btWA(state).toFixed(1)}× write amplification</h3>
        <div className="overflow-x-auto" tabIndex={0}><BTreeSvg state={state} anim={!reducedMotion} /></div>
      </section>

      <section aria-label="LSM tree" className="grid gap-1">
        <h3 className="fm-cap !text-ink">LSM tree · memtable {config.batch} · {state.lsm.files.length} SSTables · {lsmWA(state).toFixed(1)}× write amplification</h3>
        <div className="overflow-x-auto" tabIndex={0}><LsmSvg state={state} config={config} anim={!reducedMotion} /></div>
      </section>

      <section aria-label="Write cost question" className="fm-card grid gap-2 p-3">
        <p>After {state.inserted.toLocaleString()} inserts{state.inserted < 1000 ? " (insert at least 1,000 first)" : ""}, which structure wrote fewer bytes to disk?</p>
        <div className="flex flex-wrap gap-2">
          {(["btree", "lsm"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={state.answer === a} className={`fm-btn fm-btn--tool !h-8 ${state.answer === a ? "is-on" : ""}`} onClick={() => act("answer", a)}>{a === "btree" ? "B-tree" : "LSM tree"}</button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** One row per level; wide levels show a window of nodes around the last operation's path. */
function BTreeSvg({ state, anim }: { state: IvState; anim: boolean }) {
  const levels = btLevels(state.tree);
  const path = new Set(state.last?.path ?? []), flash = new Set(state.flash);
  const rowH = 46, h = levels.length * rowH + 10;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="h-auto w-full max-sm:min-w-[520px]" role="img" aria-label={`B-tree with ${levels.length} levels; level sizes ${levels.map((l) => l.length).join(", ")} nodes`}>
      {levels.map((nodes, d) => {
        const at = nodes.findIndex((n) => path.has(n.id));
        const start = nodes.length <= MAX_NODES ? 0 : Math.min(Math.max(0, (at < 0 ? 0 : at) - Math.floor(MAX_NODES / 2)), nodes.length - MAX_NODES);
        const shown = nodes.slice(start, start + MAX_NODES);
        const slot = (W - 2 * M) / shown.length;
        const y = 8 + d * rowH;
        return (
          <g key={d}>
            {start > 0 && <text x={4} y={y + 18} className="sim-sub" fill="var(--ink-muted)">+{start}</text>}
            {start + MAX_NODES < nodes.length && <text x={W - 4} y={y + 18} textAnchor="end" className="sim-sub" fill="var(--ink-muted)">+{nodes.length - start - MAX_NODES}</text>}
            {shown.map((n, i) => <Node key={n.id} n={n} x={M + i * slot + 2} y={y} w={slot - 4} on={path.has(n.id)} hot={flash.has(n.id)} target={state.last?.key} anim={anim} />)}
          </g>
        );
      })}
    </svg>
  );
}

function Node({ n, x, y, w, on, hot, target, anim }: { n: BNode; x: number; y: number; w: number; on: boolean; hot: boolean; target?: number; anim: boolean }) {
  const text = n.keys.length ? n.keys.join(" · ") : "∅";
  return (
    <g style={anim ? { transition: "opacity 250ms" } : undefined}>
      <rect x={x} y={y} width={w} height={26} rx={2} fill={hot ? "var(--status-hot-fill)" : "var(--surface)"} stroke={on ? "var(--cobalt)" : "var(--ink)"} strokeWidth={on ? 2.5 : 1} />
      <text x={x + w / 2} y={y + 17} textAnchor="middle" className="sim-sub" fill={hot ? "#121212" : "var(--ink)"} fontWeight={n.keys.includes(target ?? -1) && on ? 700 : 400}>
        {w < 7 * text.length ? `${n.keys[0] ?? "∅"}…` : text}
      </text>
      {hot && <text x={x + w / 2} y={y + 38} textAnchor="middle" className="sim-sub" fill="var(--ink)">SPLIT</text>}
    </g>
  );
}

function LsmSvg({ state, config, anim }: { state: IvState; config: IvConfig; anim: boolean }) {
  const memN = Object.keys(state.lsm.mem).length;
  const touched = new Set(state.last?.kind === "search" ? state.last.files : []), flash = new Set(state.flash);
  const X0 = 70, span = W - X0 - 10;
  const rows = [0, 1, 2].map((level) => state.lsm.files.filter((f) => f.level === level));
  return (
    <svg viewBox={`0 0 ${W} 210`} className="h-auto w-full max-sm:min-w-[520px]" role="img" aria-label={`LSM tree: memtable ${memN} of ${config.batch}; L0 ${rows[0].length} files, L1 ${rows[1].length}, L2 ${rows[2].length}`}>
      <text x={8} y={24} className="sim-lbl" fill="var(--ink)">MEMTABLE</text>
      <rect x={X0} y={10} width={span} height={20} rx={2} fill="var(--surface)" stroke="var(--ink)" />
      <rect x={X0} y={10} width={(span * memN) / config.batch} height={20} rx={2} fill="var(--status-ok-fill)" style={anim ? { transition: "width 300ms" } : undefined} />
      <text x={X0 + span - 6} y={24} textAnchor="end" className="sim-sub" fill="var(--ink)">{memN}/{config.batch} IN RAM</text>
      <text x={8} y={46} className="sim-sub" fill="var(--ink-muted)">DISK · KEY RANGE 0 → {KEY_SPACE - 1}</text>
      {rows.map((files, level) => {
        const y = 56 + level * 50;
        return (
          <g key={level}>
            <text x={8} y={y + 16} className="sim-lbl" fill="var(--ink)">L{level}</text>
            <text x={8} y={y + 30} className="sim-sub" fill="var(--ink-muted)">{level === 0 ? `${files.length}/${L0_MAX}` : `${files.length} files`}</text>
            <line x1={X0} x2={X0 + span} y1={y + 38} y2={y + 38} stroke="var(--line)" />
            {files.map((f, i) => {
              // L0 files overlap, so stack them in thin lanes; deeper levels are one sorted run.
              const lane = level === 0 ? i : 0, lanes = level === 0 ? Math.max(1, files.length) : 1;
              const x = X0 + (f.min / KEY_SPACE) * span, w = Math.max(3, ((f.max - f.min) / KEY_SPACE) * span);
              const hit = touched.has(f.id), fresh = flash.has(f.id);
              return (
                <rect key={f.id} x={x} y={y + (lane * 34) / lanes} width={w} height={Math.max(4, 34 / lanes - 2)} rx={1}
                  fill={hit ? "var(--status-hot-fill)" : fresh ? "var(--status-ok-fill)" : "var(--surface-sunk)"} stroke={hit ? "var(--status-hot)" : "var(--ink)"} strokeWidth={hit ? 2 : 0.75}>
                  <title>{`SSTable #${f.id} · L${level} · keys ${f.min}–${f.max} · ${f.entries.length} entries`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      <text x={8} y={204} className="sim-sub" fill="var(--ink-muted)">ORANGE = OPENED BY THE LAST SEARCH · GREEN = JUST WRITTEN</text>
    </svg>
  );
}
