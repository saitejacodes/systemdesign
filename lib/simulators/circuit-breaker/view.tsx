"use client";
import { Dot, IsoBlock, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { bDown, bWarm, fault, type BState, type CbConfig, type CbState } from "./model";

const A: [number, number] = [210, 75];
const SW: [number, number] = [330, 75];
const B: [number, number] = [470, 75];
const MAX_DOTS = 14;
const NODES: Record<BState, { x: number; y: number; label: string; tone: Tone }> = {
  closed: { x: 110, y: 220, label: "CLOSED", tone: "ok" },
  open: { x: 590, y: 220, label: "OPEN", tone: "over" },
  half: { x: 350, y: 320, label: "HALF-OPEN", tone: "hot" },
};

function Arrow({ from, to, label, dy = 0, active }: { from: [number, number]; to: [number, number]; label: string; dy?: number; active: boolean }) {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2 + dy;
  return (
    <g>
      <path d={`M${from[0]},${from[1]} Q${mx},${my} ${to[0]},${to[1]}`} fill="none" stroke="var(--ink)" strokeWidth={active ? 2 : 1} markerEnd="url(#cb-arrow)" opacity={active ? 1 : 0.6} />
      <text x={mx} y={(from[1] + to[1]) / 2 + dy / 2 + (dy < 0 ? -4 : 12)} textAnchor="middle" className="sim-sub" fill="var(--ink)">{label}</text>
    </g>
  );
}

export function CbView({ state: s, config: c, t, reducedMotion }: ViewProps<CbConfig, CbState>) {
  const st: BState = c.breaker ? s.st : "closed";
  const down = bDown(s);
  const warm = bWarm(s);
  const f = fault(s);
  const wait = Math.max(0, s.bBusy - t);
  const bTone: Tone = down || f === "errors" ? "over" : warm < 1 || f === "slow" || wait > 200 ? "hot" : "ok";
  const bText = down ? "DOWN" : f === "errors" ? "500s" : f === "slow" ? "SLOW ×10" : warm < 1 ? `COLD · ${Math.round(warm * 100)}%` : "OK";
  const left = Math.max(0, c.waitMs - (t - s.since));
  const min = c.windowType === "count" ? Math.min(c.minCalls, c.windowSize) : c.minCalls;
  const n = c.windowType === "count" ? s.ringN : s.recent.length;
  const flying = reducedMotion ? [] : s.calls.slice(-MAX_DOTS);
  const stText = !c.breaker ? "BREAKER OFF · EVERY CALL GOES TO B"
    : st === "open" ? `OPEN · FAIL FAST · HALF-OPEN IN ${(left / 1000).toFixed(1)} s`
    : st === "half" ? `HALF-OPEN · TRIALS ${s.halfDone}/${c.probes} DONE · ${s.halfFail} FAILED`
    : `CLOSED · FAILURE RATE ${s.failPct.toFixed(0)}% OF ${c.threshold}%`;

  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 700 370" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`Service A calls B through a circuit breaker. ${stText}. B is ${bText}.`}>
          <defs>
            <marker id="cb-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink)" /></marker>
          </defs>
          <Wire from={[90, 75]} to={[140, 75]} />
          <Wire from={A} to={[SW[0] - 22, 75]} />
          {st !== "open" && <Wire from={[SW[0] + 22, 75]} to={B} />}
          <text x={20} y={79} className="sim-sub" fill="var(--ink)">{c.rate}/s →</text>

          <IsoBlock x={140} y={45} w={110} h={60} d={12} tone="idle" label="SERVICE A" sub={`TIMEOUT ${c.timeoutMs} ms`} />
          {/* The breaker drawn as a switch: the blade lifts when it opens. */}
          <g aria-hidden>
            <circle cx={SW[0] - 22} cy={75} r={4} fill="var(--ink)" />
            <circle cx={SW[0] + 22} cy={75} r={4} fill="var(--ink)" />
            <line x1={SW[0] - 22} y1={75} x2={SW[0] + 22} y2={st === "open" ? 50 : st === "half" ? 64 : 75} stroke={`var(--status-${NODES[st].tone})`} strokeWidth={4} />
            <text x={SW[0]} y={110} textAnchor="middle" className="sim-sub" fill="var(--ink)">BREAKER</text>
          </g>
          <IsoBlock x={B[0]} y={45} w={130} h={60} d={12} tone={bTone} label="SERVICE B" sub={bText} />
          <text x={B[0]} y={130} className="sim-sub" fill="var(--ink)">{down ? "NOT ANSWERING" : `${Math.round(s.bCapEff)}/s · QUEUE ${Math.round(wait)} ms`}</text>
          {s.reCrashes > 0 && <text x={B[0]} y={146} className="sim-sub" fill="var(--status-over)">FELL OVER AGAIN ×{s.reCrashes}</text>}
          {flying.map((k, i) => {
            const end = Math.min(k.due, k.at + c.timeoutMs);
            return <Dot key={`${k.at}-${i}`} from={[SW[0] + 22, 75]} to={B} p={(t - k.at) / Math.max(1, end - k.at)} color={k.probe ? "var(--status-hot)" : "var(--cobalt)"} />;
          })}
          {c.breaker && st !== "closed" && (
            <text x={SW[0]} y={34} textAnchor="middle" className="sim-sub" fill="var(--status-over)">↩ {s.rejected.toLocaleString()} REJECTED → {c.fallback ? "CACHED FALLBACK" : "ERROR"}</text>
          )}

          <Arrow from={[170, 205]} to={[530, 205]} dy={-50} label={`failure rate ≥ ${c.threshold}% (≥ ${min} calls)`} active={st === "closed"} />
          <Arrow from={[600, 245]} to={[425, 315]} dy={20} label={`after ${c.waitMs / 1000} s`} active={st === "open"} />
          <Arrow from={[300, 330]} to={[120, 245]} dy={20} label={`${c.probes} trials < ${c.threshold}% fail`} active={st === "half"} />
          <Arrow from={[420, 300]} to={[575, 245]} dy={-24} label="trials fail" active={st === "half"} />
          {(Object.keys(NODES) as BState[]).map((k) => {
            const nd = NODES[k];
            const on = k === st;
            return (
              <g key={k}>
                <rect x={nd.x - 60} y={nd.y - 20} width={120} height={40} rx={3} fill={on ? `var(--status-${nd.tone}-fill)` : "var(--surface)"} stroke="var(--ink)" strokeWidth={on ? 2.5 : 1} />
                <text x={nd.x} y={nd.y + 5} textAnchor="middle" className="sim-lbl" fill="var(--ink)">{on ? "● " : ""}{nd.label}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <section aria-label="Breaker window" className="fm-card grid gap-2 p-3">
        <h3 className="fm-cap" style={{ color: `var(--status-${NODES[st].tone})` }}>{stText}</h3>
        <p className="font-mono text-[12px]">
          {c.windowType === "count" ? `WINDOW: LAST ${c.windowSize} CALLS` : `WINDOW: LAST ${c.windowSize} s`} · {n} RECORDED · MIN {min} · {s.openCount} TRIPS
        </p>
        <div className="flex flex-wrap gap-[2px]" aria-hidden>
          {s.recent.slice(-SHOWN).map((fail, i) => <span key={i} className="inline-block h-3 w-[6px]" style={{ background: fail ? "var(--status-over)" : "var(--status-ok)" }} />)}
        </div>
        <p className="text-[14px]">The last {Math.min(SHOWN, s.recent.length)} outcomes the breaker recorded, newest last (red = failure or timeout). Calls rejected while open are not recorded: the breaker learns nothing about B until it tries again.</p>
      </section>
    </div>
  );
}

const SHOWN = 100;
