"use client";
import { useState } from "react";
import { Dot, IsoBlock, Leader, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { APP_SERVERS, NODES, NODE_CAPACITY, raceTimeline, type CacheConfig, type CacheState, type RaceMode } from "./model";

const AX = 20, CX = 270, DX = 540;
const rowY = (i: number, n: number) => 30 + (i * 240) / (n - 1);
const DB: [number, number] = [DX + 70, 170];
const utilTone = (u: number): Tone => (u >= 1 ? "over" : u >= 0.7 ? "hot" : "ok");
const TONE_TEXT = { ok: "OK", hot: "HOT", over: "OVERLOADED", idle: "" } as const;

export function CacheView({ state: s, config: c, t, reducedMotion }: ViewProps<CacheConfig, CacheState>) {
  const last = s.secs.at(-1);
  const dbU = last?.dbUtil ?? 0;
  const perNode = Array.from({ length: NODES }, () => 0);
  for (const k of s.cache.keys()) perNode[((k * 2654435761) >>> 0) % NODES]++;
  const hist = s.secs.slice(-60);
  // A few dots per wire, phase-shifted by sim time, show traffic without one dot per request.
  const phase = (k: number) => ((t / 600 + k * 0.29) % 1);
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox="0 0 700 340" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${s.cache.size} keys cached, hit rate ${Math.round((last && last.reads ? last.hits / last.reads : 0) * 100)}%, database at ${Math.round(dbU * 100)}% of capacity`}>
          {Array.from({ length: APP_SERVERS }, (_, i) => Array.from({ length: NODES }, (_, j) => <Wire key={`a${i}${j}`} from={[AX + 110, rowY(i, APP_SERVERS) + 14]} to={[CX, rowY(j, NODES) + 14]} />))}
          {Array.from({ length: NODES }, (_, j) => <g key={`d${j}`} opacity={s.down[j] ? 0.3 : 1}><Wire from={[CX + 120, rowY(j, NODES) + 14]} to={DB} /></g>)}
          {!reducedMotion && Array.from({ length: NODES }, (_, j) => (
            <g key={`m${j}`}>
              {!s.down[j] && <Dot from={[AX + 110, rowY(j, APP_SERVERS) + 14]} to={[CX, rowY(j, NODES) + 14]} p={phase(j)} color="var(--status-ok)" />}
              {(dbU > 0.05 || s.down[j]) && <Dot from={[CX + 120, rowY(j, NODES) + 14]} to={DB} p={phase(j + 2)} color={dbU >= 0.7 ? "var(--status-over)" : "var(--cobalt)"} />}
            </g>
          ))}

          {Array.from({ length: APP_SERVERS }, (_, i) => (
            <IsoBlock key={i} x={AX} y={rowY(i, APP_SERVERS)} w={110} h={28} d={8} label={`APP ${i + 1}`} sub={c.localCache ? `LOCAL ${s.local[i].size}` : undefined} />
          ))}
          {Array.from({ length: NODES }, (_, j) => {
            const u = s.nodes[j].backlog / NODE_CAPACITY;
            const tone: Tone = s.down[j] ? "over" : utilTone(u * 10);
            return (
              <g key={j}>
                <IsoBlock x={CX} y={rowY(j, NODES)} w={120} h={28} d={8} tone={tone} label={`CACHE ${j + 1}`} sub={s.down[j] ? "DOWN" : `${perNode[j]} KEYS`} />
              </g>
            );
          })}
          <IsoBlock x={DX} y={130} w={140} h={80} d={18} tone={utilTone(dbU)} label="DATABASE" sub={`${Math.round(dbU * 100)}% · ${TONE_TEXT[utilTone(dbU)]}`} />
          <Leader from={[DX + 70, 210]} to={[DX + 140, 250]} anchor="end">{`MAX ${c.dbCapacity} Q/S · ${Math.round(c.dbLatency * s.dbSlow)} MS`}</Leader>
          <text x={CX} y={330} className="sim-sub" fill="var(--ink)">{`${c.strategy.toUpperCase()} · ${c.eviction.toUpperCase()} · TTL ${c.ttl} S${c.jitter ? " ±10%" : ""}${c.coalescing ? " · COALESCE" : ""}${c.mutex ? " · LOCK" : ""}${s.hotKey ? " · HOT KEY" : ""}`}</text>
        </svg>
      </div>

      <figure className="grid gap-1">
        <figcaption className="fm-cap">Last {hist.length} s · bar = hit rate, red tick = DB over 70% of capacity</figcaption>
        <div className="flex h-16 items-end gap-px border border-ink p-1" style={{ borderRadius: 2 }} aria-hidden>
          {hist.map((x) => {
            const hr = x.reads ? x.hits / x.reads : 0;
            return (
              <div key={x.t} className="flex flex-col justify-end" style={{ height: "100%", width: `${100 / 60}%` }}>
                <div style={{ height: `${hr * 100}%`, background: "var(--cobalt)" }} />
                {x.dbUtil >= 0.7 && <div style={{ height: 3, background: "var(--status-over)" }} />}
              </div>
            );
          })}
        </div>
      </figure>

      <RaceDemo />
    </div>
  );
}

/** A step-through of the classic write race: update the cache on write vs delete it. */
function RaceDemo() {
  const [mode, setMode] = useState<RaceMode>("update");
  const [step, setStep] = useState(0);
  const steps = raceTimeline(mode);
  const cur = steps[Math.min(step, steps.length - 1)];
  const pick = (m: RaceMode) => { setMode(m); setStep(0); };
  return (
    <section aria-label="Write race demo" className="fm-card grid gap-2 p-3 text-[14px]">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="fm-cap !text-ink">Race demo · two writers, one key</h3>
        {(["update", "delete"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} className={`fm-btn fm-btn--tool !h-8 ${mode === m ? "is-on" : ""}`} onClick={() => pick(m)}>{m === "update" ? "Update cache on write" : "Delete on write"}</button>
        ))}
      </header>
      <ol className="grid gap-1 font-mono text-[12px]">
        {steps.slice(0, step + 1).map((x, i) => (
          <li key={i} className="border px-2 py-1" style={{ borderRadius: 2, borderColor: x.bad ? "var(--status-over)" : "var(--line)" }}>
            <span className="text-ink-muted">{i + 1}. </span>{x.text}
            <span className="block opacity-80">DB {x.db} · CACHE {x.cache}{x.bad ? " · STALE" : ""}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={step >= steps.length - 1} onClick={() => setStep(step + 1)}>Next step</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => setStep(0)}>Restart</button>
        <span role="status" className="fm-cap" style={{ color: cur.bad ? "var(--status-over)" : step === steps.length - 1 ? "var(--status-ok)" : undefined }}>
          {step < steps.length - 1 ? `Step ${step + 1} / ${steps.length}` : cur.bad ? "STALE until the TTL expires" : "CONSISTENT · the next read repairs it"}
        </span>
      </div>
    </section>
  );
}
