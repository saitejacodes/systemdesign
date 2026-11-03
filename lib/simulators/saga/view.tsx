"use client";
import { Fragment } from "react";
import { Dot, IsoBlock, Wire, lerp, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { KINDS, MODES, SVCS, doubtAge, type Flight, type NodeId, type SagaConfig, type SagaState, type TraceLine } from "./model";

const HUB: [number, number] = [350, 92];
const X = [20, 195, 370, 545];
const P: Record<NodeId, [number, number]> = { hub: HUB, order: [X[0] + 67, 172], payment: [X[1] + 67, 172], inventory: [X[2] + 67, 172], shipping: [X[3] + 67, 172] };
const NAME = { order: "ORDER", payment: "PAYMENT", inventory: "INVENTORY", shipping: "SHIPPING" } as const;
const HUB_NAME = { orchestration: "ORCHESTRATOR", choreography: "EVENT BROKER", "2pc": "COORDINATOR" } as const;
const TONE: Record<TraceLine["tone"], string> = { ok: "var(--status-ok)", hot: "var(--status-hot)", over: "var(--status-over)", info: "var(--ink-muted)" };
const MAX_DOTS = 30;
const LOST_SHOW_MS = 400;

function pos(f: Flight, t: number): [number, number] {
  const p = Math.min(1, Math.max(0, (t - f.sent) / Math.max(0.1, f.at - f.sent)));
  if (!f.via) return lerp(P[f.from], P[f.to], p);
  // Choreography: every event goes through the broker.
  return f.lost ? lerp(P[f.from], HUB, p) : p < 0.5 ? lerp(P[f.from], HUB, p * 2) : lerp(HUB, P[f.to], p * 2 - 1);
}

export function SagaView({ state: s, config: c, t, reducedMotion, act }: ViewProps<SagaConfig, SagaState>) {
  const two = c.mode === "2pc";
  const age = doubtAge(s);
  const flights = reducedMotion ? [] : s.flights.filter((f) => f.sent <= t && t <= f.at + (f.lost ? LOST_SHOW_MS : 0)).slice(-MAX_DOTS);
  const exposed = s.live.filter((g) => !g.settled && g.order === "pending" && (g.charged > 0 || g.reserved > 0)).length;
  const sub = (i: number): string => {
    const a = s.agg;
    if (two) return i === 2 ? `locks ${s.plocks[2]} · queue ${s.hot.queue.length}` : `locks ${s.plocks[i]}`;
    if (i === 1 && s.paymentDown) return "DOWN · msgs lost";
    return [`pend ${a.pending} · ok ${a.confirmed} · ✕ ${a.cancelled}`, `captured ${a.charged}`, `reserved ${a.reserved}`, `${a.shipped} shipped`][i];
  };
  const tone = (i: number): Tone => {
    if (two) return s.doubt.some((x) => x.lockAt[i] >= 0) ? "over" : i === 2 && s.hot.queue.length ? "hot" : "idle";
    return i === 1 && s.paymentDown ? "over" : "idle";
  };
  const bad = s.inconsistent > 0;
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 700 290" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${MODES.find((m) => m.value === c.mode)!.label}. ${s.completed} completed, ${s.compensated} ${two ? "aborted" : "compensated"}, ${s.stuck + s.doubt.length} stuck, ${s.inconsistent} inconsistent.${two ? ` ${s.locks} locks held, ${s.hot.queue.length} transactions blocked on the stock row.` : ""}`}>
          {SVCS.map((v) => <Wire key={v} from={HUB} to={P[v]} />)}
          {flights.map((f, i) => {
            const at = pos(f, t);
            const col = f.lost ? "var(--status-over)" : f.comp ? "var(--status-hot)" : "var(--cobalt)";
            return f.lost && t >= f.at
              ? <text key={`${i}-${f.sent}`} x={at[0]} y={at[1] + 5} textAnchor="middle" className="sim-lbl" fill="var(--status-over)">✕</text>
              : <Dot key={`${i}-${f.sent}`} from={at} to={at} p={0} color={col} />;
          })}

          <IsoBlock x={270} y={36} w={160} h={56} tone={s.doubt.length ? "over" : "idle"} label={HUB_NAME[c.mode]} sub={s.doubt.length ? "CRASHED · decision unknown" : s.crashArmed ? "will crash after PREPARE" : `${s.open} ${two ? "txs" : "orders"} open`} />
          {SVCS.map((v, i) => <IsoBlock key={v} x={X[i]} y={180} w={135} h={56} tone={tone(i)} label={NAME[v]} sub={sub(i)} />)}

          <text x={20} y={262} className="sim-sub" fill="var(--ink)">
            {reducedMotion ? `MESSAGES IN FLIGHT ${s.msgs.length} · ` : ""}
            {two
              ? `LOCKS HELD ${s.locks} · BLOCKED ON STOCK ROW ${s.hot.queue.length}${s.doubt.length ? ` · IN DOUBT ${(age / 1000).toFixed(1)} s` : ""}`
              : `COMPLETED ${s.completed} · COMPENSATED ${s.compensated} · STUCK ${s.stuck}${s.failed ? ` · UNCOMPENSATED ${s.failed}` : ""}`}
          </text>
          <text x={20} y={280} className="sim-sub" fill={bad ? "var(--status-over)" : "var(--status-ok)"}>
            {bad ? `INCONSISTENT ×${s.inconsistent} · services disagree about settled orders` : "CONSISTENT · every settled order agrees across services"}
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Inject a failure">
        <span className="fm-cap">Fail next order at</span>
        {([1, 2, 3] as const).map((step) => (
          <button key={step} type="button" aria-pressed={s.forceFail === step} className={`fm-btn fm-btn--tool !h-8 ${s.forceFail === step ? "is-on" : ""}`} onClick={() => act("failNext", { step: s.forceFail === step ? 0 : step })}>
            {NAME[SVCS[step]]}{two ? " (votes NO)" : ""}
          </button>
        ))}
        {two && (
          <>
            <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={s.crashArmed || s.doubt.length > 0} onClick={() => act("crashCoordinator")}>Crash coordinator after next PREPARE</button>
            <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!s.crashArmed && !s.doubt.length} onClick={() => act("recoverCoordinator")}>Recover coordinator</button>
          </>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <section aria-label="Trace" className="fm-card grid content-start gap-1 p-3">
          <h3 className="fm-cap">{s.trace ? `Trace · ${s.trace.two ? "tx" : "order"} #${s.trace.id}` : "Trace"}</h3>
          <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
            {two ? "PREPARE → 4 votes → coordinator logs the decision (commit point) → COMMIT/ABORT → locks released." : "T1 order → T2 payment → T3 stock → T4 shipment → T5 confirm. On failure: C3 → C2 → C1, newest first."}
          </p>
          {s.trace ? (
            <ol className="grid gap-1 font-mono text-[12px]">
              {s.trace.lines.map((l, i) => (
                <li key={i} className="border border-ink px-2 py-0.5" style={{ borderRadius: 2, borderLeft: `4px solid ${TONE[l.tone]}` }}>
                  <span style={{ color: "var(--ink-muted)" }}>{Math.round(l.t)} ms · </span>{l.text}
                </li>
              ))}
            </ol>
          ) : <p className="font-mono text-[12px]">Press Play. The first order, and later every order that fails, is traced here.</p>}
        </section>

        {two ? (
          <section aria-label="Locks" className="fm-card grid content-start gap-1 p-3" style={s.doubt.length ? { borderColor: "var(--status-over)", borderWidth: 2 } : undefined}>
            <h3 className="fm-cap" style={{ color: s.doubt.length ? "var(--status-over)" : "var(--status-ok)" }}>{s.doubt.length ? `BLOCKED · tx #${s.doubt[0].id} in doubt for ${(age / 1000).toFixed(1)} s` : "Locks · every transaction decides in milliseconds"}</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 font-mono text-[12px]">
              {SVCS.map((v, i) => <Fragment key={v}><dt>{NAME[v]} row locks held</dt><dd>{s.plocks[i]}</dd></Fragment>)}
              <dt>Waiting for the stock row</dt><dd style={{ color: s.hot.queue.length ? "var(--status-hot)" : undefined }}>{s.hot.queue.length}</dd>
              <dt>Stock row held by</dt><dd>{s.hot.owner ? `tx #${s.hot.owner.id}${s.hot.owner.inDoubt ? " (IN DOUBT)" : ""}` : "nobody"}</dd>
              <dt>Committed / aborted</dt><dd>{s.completed} / {s.compensated}</dd>
              {s.rejected > 0 && <><dt>Checkouts timed out</dt><dd style={{ color: "var(--status-over)" }}>{s.rejected}</dd></>}
            </dl>
            <p className="text-[13px]">A participant that voted YES may not abort on its own: only the coordinator knows whether it logged COMMIT.</p>
          </section>
        ) : (
          <section aria-label="Consistency" className="fm-card grid content-start gap-1 p-3" style={bad ? { borderColor: "var(--status-over)", borderWidth: 2 } : undefined}>
            <h3 className="fm-cap" style={{ color: bad ? "var(--status-over)" : "var(--status-ok)" }}>{bad ? `INCONSISTENT · ${s.inconsistent} order${s.inconsistent > 1 ? "s" : ""}` : "CONSISTENT"}</h3>
            <p className="text-[13px]">Inconsistent means an order with nothing left in flight whose services disagree. Settled orders must be CONFIRMED with exactly one charge, reservation and shipment, or CANCELLED with none.</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 font-mono text-[12px]">
              {KINDS.map((k) => <Fragment key={k.k}><dt>{k.label} <span style={{ color: "var(--ink-muted)" }}>· {k.rule}</span></dt><dd style={{ color: s.kinds[k.k] ? "var(--status-over)" : undefined }}>{s.kinds[k.k]}</dd></Fragment>)}
              <dt>Stuck (lost message, never re-sent)</dt><dd style={{ color: s.stuck ? "var(--status-over)" : undefined }}>{s.stuck}</dd>
              <dt>Retries · duplicates dropped</dt><dd>{s.retries} · {s.deduped}</dd>
              <dt>Pending orders already charged or holding stock now</dt><dd>{exposed}</dd>
            </dl>
            <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>That last line is the missing isolation: those states are visible to everyone until the saga finishes.</p>
          </section>
        )}
      </div>
    </div>
  );
}
