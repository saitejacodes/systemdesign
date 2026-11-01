"use client";
import { Dot, IsoBlock, Leader, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { queueLength, type QueueConfig, type QueueState } from "./model";

const SRC: [number, number] = [70, 150];
const Q_IN: [number, number] = [170, 150];
const SRV: [number, number] = [440, 150];
const SINK: [number, number] = [640, 150];
const SLOTS = 12;

export function QueueView({ state, config, t, reducedMotion }: ViewProps<QueueConfig, QueueState>) {
  const q = queueLength(state);
  const rho = config.lambda / (config.mu / state.slow);
  const tone: Tone = state.level === "over" ? "over" : state.level === "hot" || rho > 0.85 ? "hot" : state.inService ? "ok" : "idle";
  const svc = state.inService;
  const p = svc ? (t - svc.start) / (svc.end - svc.start) : 0;
  return (
    <svg viewBox="10 70 690 200" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`Queue with ${q} waiting requests feeding one server at ${Math.round(Math.min(rho, 9.99) * 100)}% offered load`}>
      <Wire from={SRC} to={Q_IN} />
      <Wire from={[Q_IN[0] + SLOTS * 18 + 4, 150]} to={[SRV[0] - 60, 150]} />
      <Wire from={[SRV[0] + 60, 150]} to={SINK} />

      <IsoBlock x={30} y={125} w={80} h={50} label="CLIENTS" sub={`λ ${config.lambda}/s`} />
      {/* Queue slots: filled squares are waiting requests. */}
      <g aria-hidden>
        {Array.from({ length: SLOTS }, (_, i) => (
          <rect key={i} x={Q_IN[0] + i * 18} y={140} width={14} height={20} fill={i < q ? "var(--cobalt)" : "var(--surface)"} stroke="var(--ink)" strokeWidth={1} />
        ))}
        <text x={Q_IN[0] + SLOTS * 18 + 8} y={130} className="sim-sub" fill="var(--ink)">{q > SLOTS ? `+${q - SLOTS}` : ""}</text>
      </g>
      <IsoBlock x={SRV[0] - 60} y={115} w={120} h={70} d={20} tone={tone} label="SERVER" sub={`μ ${state.slow > 1 ? `${Math.round(config.mu / state.slow)} (slow)` : config.mu}/s`} />
      <IsoBlock x={590} y={128} w={80} h={44} label="DONE" />

      {!reducedMotion && svc && <Dot from={[SRV[0] - 50, 200]} to={[SRV[0] + 50, 200]} p={p} />}
      {!reducedMotion && state.departed.map((d) => <Dot key={d.id} from={[SRV[0] + 60, 150]} to={[SINK[0] - 40, 150]} p={(t - d.t) / 400} color="var(--status-ok-fill)" />)}

      <Leader from={[Q_IN[0] + 7, 160]} to={[Q_IN[0] + 40, 240]}>QUEUE · {q} waiting</Leader>
      <Leader from={[SRV[0] - 40, 185]} to={[SRV[0] - 10, 245]}>ρ = λ/μ = {rho.toFixed(2)}{rho >= 1 ? " · unstable" : ""}</Leader>
      <text x={SRV[0]} y={95} textAnchor="middle" className="sim-sub" fill="var(--ink)">{tone === "over" ? "OVERLOADED" : tone === "hot" ? "HOT" : tone === "ok" ? "OK · BUSY" : "IDLE"}</text>
    </svg>
  );
}
