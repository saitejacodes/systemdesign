"use client";
import { Dot, IsoBlock, Leader, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { ALGORITHMS, activeServers, serverLoad, type LbConfig, type LbState } from "./model";

const LB: [number, number] = [215, 190];
const SX = 350;

export function LbView({ state, config, t, reducedMotion }: ViewProps<LbConfig, LbState>) {
  const servers = activeServers(state, config);
  const gap = Math.min(60, 330 / servers.length);
  const top = 190 - ((servers.length - 1) * gap) / 2;
  const ys = servers.map((_, i) => top + i * gap);
  const bh = Math.min(36, gap - 12);
  const spiking = t < state.spikeUntil;
  const algo = ALGORITHMS.find((a) => a.value === config.algorithm)?.label ?? "";
  return (
    <svg viewBox="0 0 640 380" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${algo} load balancer in front of ${servers.length} servers; ${servers.filter((s) => s.dead).length} dead`}>
      <Wire from={[90, 190]} to={[LB[0] - 65, LB[1]]} />
      {servers.map((sv, i) => (
        <g key={`w${i}`} opacity={sv.up ? 1 : 0.3}><Wire from={[LB[0] + 65, LB[1]]} to={[SX, ys[i]]} /></g>
      ))}

      <IsoBlock x={6} y={160} w={84} h={60} label="CLIENTS" sub={`${spiking ? config.rps * 3 : config.rps}/s${spiking ? " ×3" : ""}`} tone={spiking ? "hot" : "idle"} />
      <IsoBlock x={LB[0] - 65} y={LB[1] - 34} w={130} h={68} d={24} label="LOAD BALANCER" sub={algo.toUpperCase()} />

      {!reducedMotion && state.recent.map((r) => (
        r.s < servers.length && <Dot key={r.id} from={[LB[0] + 65, LB[1]]} to={[SX, ys[r.s]]} p={(t - r.t) / 250} color={r.error ? "var(--status-over)" : "var(--cobalt)"} />
      ))}

      {servers.map((sv, i) => {
        const load = serverLoad(sv);
        const tone: Tone = sv.dead ? "over" : load >= 1 ? "over" : load >= 0.75 ? "hot" : load > 0.02 ? "ok" : "idle";
        const status = sv.dead ? "DEAD" : !sv.up ? "DOWN" : load >= 1 ? "OVERLOADED" : load >= 0.75 ? "HOT" : "OK";
        const flags = [sv.slow > 1 && "SLOW", sv.flaky && "FLAKY", config.hetero && i % 2 === 0 && "2× CAP"].filter(Boolean).join(" · ");
        return (
          <g key={i}>
            <IsoBlock x={SX} y={ys[i] - bh / 2} w={90} h={bh} d={10} tone={tone} label={`S${i + 1}`} sub={bh >= 30 ? `${sv.busy + sv.queue.length} conn` : undefined} />
            {/* Load bar: share of concurrency slots in use, queue beyond 100% */}
            <rect x={SX + 108} y={ys[i] - 4} width={60} height={8} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1} />
            <rect x={SX + 108} y={ys[i] - 4} width={60 * Math.min(1, load / 2)} height={8} fill={tone === "idle" ? "var(--surface)" : `var(--status-${tone}-fill)`} />
            <line x1={SX + 138} x2={SX + 138} y1={ys[i] - 7} y2={ys[i] + 7} stroke="var(--ink)" strokeWidth={1} />
            <text x={SX + 174} y={ys[i] + 4} className="sim-sub" fill="var(--ink)">{status}{flags && ` · ${flags}`}</text>
          </g>
        );
      })}

      <Leader from={[LB[0], LB[1] + 34]} to={[LB[0] - 90, 330]}>HEALTH CHECK · {config.checkMs} ms × {config.threshold}</Leader>
      <text x={SX + 108} y={Math.max(16, top - bh / 2 - 14)} className="sim-sub" fill="var(--ink-muted)">LOAD · TICK = FULL</text>
    </svg>
  );
}
