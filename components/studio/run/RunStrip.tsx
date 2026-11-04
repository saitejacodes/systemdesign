"use client";
import { Info, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { SPEEDS } from "@/lib/sim/engine";
import type { SimState } from "@/lib/studio/sim/types";
import { fmtMs, fmtPct, fmtQps } from "./config";
import type { RunApi } from "./useRun";

export const fmtClock = (t: number) => `${t.toFixed(1)} s`;

/** Transport (Play/Pause/Step/Reset, speed, sim clock) and the live metrics strip: per request type throughput and p99. */
export function RunStrip({ run, onInfo }: { run: RunApi; onInfo: () => void }) {
  const s = run.state;
  return (
    <div className="sdl-strip" data-testid="run-strip">
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Simulation controls">
        <button type="button" className="fm-btn fm-btn--tool is-on !h-8" onClick={run.playing ? run.pause : run.play}>
          {run.playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}{run.playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={run.step} disabled={run.playing} aria-label="Step 0.5 seconds"><StepForward className="size-3.5" aria-hidden />Step</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={run.reset}><RotateCcw className="size-3.5" aria-hidden />Reset</button>
        <label className="fm-cap flex items-center gap-1.5">Speed
          <select className="fm-input fm-input--mono !h-8 !w-auto !py-0 !text-[12px]" value={run.speed} onChange={(e) => run.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((x) => <option key={x} value={x}>{x}×</option>)}
          </select>
        </label>
        <span className="sdl-metric" data-testid="sim-clock"><span className="k">t</span><span className="v">{fmtClock(s?.t ?? 0)}</span></span>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={onInfo}><Info className="size-3.5" aria-hidden />What this models</button>
      </div>
      <Metrics state={s} />
    </div>
  );
}

function Metrics({ state }: { state: SimState | null }) {
  if (!state) return null;
  const tot = state.totals;
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:ml-auto" aria-label="Live metrics" data-testid="run-metrics">
      <div className="sdl-metric"><dt className="k">Served</dt><dd className="v">{fmtQps(tot.okQps)}/s</dd></div>
      <div className={`sdl-metric ${tot.errorRatePct >= 1 ? "is-bad" : ""}`}><dt className="k">Errors</dt><dd className="v">{fmtPct(tot.errorRatePct, 1)}</dd></div>
      {state.requestTypes.map((r) => (
        <div key={r.id} className={`sdl-metric ${!r.reachable || r.errorQps > r.offeredQps * 0.01 ? "is-bad" : ""}`} data-testid={`rt-${r.id}`}>
          <dt className="k">{r.name}</dt>
          <dd className="v">{r.reachable ? `${fmtQps(r.okQps)}/s · p99 ${fmtMs(r.p99Ms)}` : "unreachable"}</dd>
        </div>
      ))}
    </dl>
  );
}
