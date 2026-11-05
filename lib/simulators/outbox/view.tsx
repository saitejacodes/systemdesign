"use client";
import { Dot, IsoBlock, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { MODES, inconsistencies, type FailKind, type NodeId, type OutboxConfig, type OutboxState } from "./model";

/** Wire anchor of each block. */
const P: Record<NodeId, [number, number]> = { svc: [130, 190], db: [255, 95], relay: [445, 95], broker: [445, 190], consumer: [570, 190] };
const MAX_DOTS = 24;
const FLASH_MS = 800;

const STEPS: Record<OutboxConfig["mode"], string[]> = {
  "commit-publish": ["INSERT order · COMMIT", "publish OrderPlaced to the broker", "return 201"],
  "publish-commit": ["publish OrderPlaced to the broker", "INSERT order · COMMIT", "return 201"],
  outbox: ["BEGIN · INSERT order · INSERT outbox row · COMMIT", "relay: SELECT unpublished rows", "relay: publish each row, wait for acks", "relay: UPDATE outbox SET published_at"],
};
/** Which step the last failure hit, per kind. */
const FAIL_STEP: Record<FailKind, number> = { missing: 1, phantom: 1, rollback: 0, relay: 2, rejected: 0 };
const FAIL_TEXT: Record<FailKind, string> = {
  missing: "ORDER WITH NO EVENT · saved and acknowledged, never announced",
  phantom: "EVENT WITH NO ORDER · announced, then the commit failed",
  rollback: "ROLLED BACK · no order and no event: consistent",
  relay: "RELAY CRASHED BEFORE MARKING · rows will be published again",
  rejected: "PUBLISH FAILED FIRST · error returned, nothing saved: consistent",
};
const BAD = new Set<FailKind>(["missing", "phantom"]);

export function OutboxView({ state: s, config: c, t, reducedMotion }: ViewProps<OutboxConfig, OutboxState>) {
  const ob = c.mode === "outbox";
  const relayDown = t < s.relayUpAt;
  const f = s.lastFail;
  const flash = f && t - f.t < FLASH_MS ? f : null;
  const n = inconsistencies(s);
  const relayTone: Tone = relayDown ? "over" : s.outbox.length > c.batch ? "hot" : "idle";
  const dots = reducedMotion ? [] : [
    ...s.flights.filter((x) => x.sent <= t && x.at >= t).slice(-MAX_DOTS).map((x, i) => ({ k: `f${i}-${x.sent}`, from: P[x.from], to: P[x.to], p: (t - x.sent) / Math.max(1, x.at - x.sent) })),
    ...s.deliveries.filter((d) => d.sent <= t).slice(-MAX_DOTS).map((d) => ({ k: `d${d.id}-${d.sent}`, from: P.broker, to: P.consumer, p: (t - d.sent) / Math.max(1, d.at - d.sent) })),
  ];
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox="0 0 700 290" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${MODES.find((m) => m.value === c.mode)!.label}. ${s.committed} orders saved, ${s.consumed} events processed, ${n} inconsistencies, ${s.outbox.length} outbox rows waiting.`}>
          <g opacity={ob ? 0.25 : 1}><Wire from={P.svc} to={P.broker} /></g>
          <Wire from={P.svc} to={P.db} />
          <g opacity={ob ? 1 : 0.25}><Wire from={P.db} to={P.relay} /><Wire from={P.relay} to={P.broker} /></g>
          <Wire from={P.broker} to={P.consumer} />
          {dots.map((d) => <Dot key={d.k} from={d.from} to={d.to} p={d.p} />)}

          <IsoBlock x={20} y={160} w={110} h={60} tone={flash && flash.kind !== "relay" ? (BAD.has(flash.kind) ? "over" : "hot") : "idle"} label="ORDER SVC" sub={flash && flash.kind !== "relay" ? "CRASH" : `${s.placed} placed`} />
          <IsoBlock x={170} y={40} w={130} h={70} tone="idle" label="DATABASE" sub={`orders ${s.committed}${ob || s.outbox.length ? ` · outbox ${s.outbox.length}` : ""}`} />
          <g opacity={ob || s.outbox.length ? 1 : 0.3}>
            <IsoBlock x={400} y={55} w={90} h={45} tone={relayTone} label="RELAY" sub={relayDown ? "RESTARTING" : `every ${c.pollMs} ms`} />
          </g>
          <IsoBlock x={400} y={160} w={90} h={60} tone={s.brokerDown ? "over" : "idle"} label="BROKER" sub={s.brokerDown ? "UNREACHABLE" : `${s.published} events`} />
          <IsoBlock x={560} y={160} w={120} h={60} tone={s.doubleProcessed ? "over" : "idle"} label="CONSUMER" sub={c.dedupe ? `dedupe · ${s.deduped} dropped` : `${s.consumed} handled`} />

          {flash && (
            <text x={20} y={252} className="sim-sub" fill={BAD.has(flash.kind) ? "var(--status-over)" : "var(--status-hot)"}>✕ #{flash.id} · {FAIL_TEXT[flash.kind]}</text>
          )}
          <text x={20} y={274} className="sim-sub" fill="var(--ink)">
            {reducedMotion ? `IN FLIGHT ${s.deliveries.length} · ` : ""}DB ↔ EVENTS: {n ? `DIVERGED ×${n}` : "AGREE"} · DUPLICATES {s.duplicates}{s.doubleProcessed ? ` · PROCESSED TWICE ${s.doubleProcessed}` : ""}
          </text>
        </svg>
      </div>

      <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <section aria-label="Sequence" className="fm-card grid content-start gap-1 p-3">
          <h3 className="fm-cap">Sequence · {MODES.find((m) => m.value === c.mode)!.label}</h3>
          <ol className="grid gap-1 font-mono text-[12px]">
            {STEPS[c.mode].map((step, i) => {
              const hit = f && FAIL_STEP[f.kind] === i && (ob ? f.kind === "rollback" || f.kind === "relay" : f.kind !== "rollback" && f.kind !== "relay");
              return (
                <li key={i} className="border border-ink px-2 py-1" style={{ borderRadius: 2, borderLeft: `4px solid ${hit ? (BAD.has(f!.kind) ? "var(--status-over)" : "var(--status-hot)") : "var(--status-ok)"}` }}>
                  {i + 1}. {step}{hit && <span className="block" style={{ color: BAD.has(f!.kind) ? "var(--status-over)" : "var(--status-hot)" }}>LAST FAILURE HERE · #{f!.id}</span>}
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-label="Consistency" className="fm-card grid content-start gap-1 p-3" style={n ? { borderColor: "var(--status-over)", borderWidth: 2 } : undefined}>
          <h3 className="fm-cap" style={{ color: n ? "var(--status-over)" : "var(--status-ok)" }}>{n ? `DIVERGED · ${n} inconsistenc${n > 1 ? "ies" : "y"}` : "CONSISTENT · database and events agree"}</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 font-mono text-[12px]">
            <dt>Orders with no event</dt><dd style={{ color: s.missing ? "var(--status-over)" : undefined }}>{s.missing}</dd>
            <dt>Events with no order</dt><dd style={{ color: s.phantom ? "var(--status-over)" : undefined }}>{s.phantom}</dd>
            <dt>Rolled back / rejected</dt><dd>{s.failed - s.phantom}</dd>
            <dt>Duplicate events published</dt><dd>{s.duplicates}</dd>
            <dt>Dropped by dedupe</dt><dd>{s.deduped}</dd>
            <dt>Orders processed twice</dt><dd style={{ color: s.doubleProcessed ? "var(--status-over)" : undefined }}>{s.doubleProcessed}</dd>
            <dt>Relay crashes</dt><dd>{s.relayCrashes}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
