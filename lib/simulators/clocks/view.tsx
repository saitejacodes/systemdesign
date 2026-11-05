"use client";
import type { ViewProps } from "@/lib/sim/definition";
import { MAX_EVENTS, N, NAMES, evById, full, hb, inFlight, pickedPair, relation, skewsOf, type ClocksConfig, type ClocksState, type Ev } from "./model";

const X0 = 46;
const STEP = 18;
const W = X0 + MAX_EVENTS * STEP + 20;
const laneY = (p: number) => 40 + p * 80;
const xOf = (i: number) => X0 + i * STEP + STEP / 2;
const PAST = "var(--cobalt)";
const FUTURE = "var(--phase-3)";

function Verdict({ a, b }: { a: Ev; b: Ev }) {
  const r = relation(a, b);
  const [x, y] = r === "after" ? [b, a] : [a, b];
  const hbText = r === "concurrent" ? `${a.name} ∥ ${b.name} · CONCURRENT` : `${x.name} → ${y.name} · HAPPENED BEFORE`;
  const lamFirst = a.L === b.L ? undefined : a.L < b.L ? a : b;
  const wallFirst = a.wall === b.wall ? undefined : a.wall < b.wall ? a : b;
  const lamBad = r === "concurrent" && !!lamFirst;
  const wallBad = r !== "concurrent" && y.wall <= x.wall;
  const row = (label: string, text: string, bad: boolean) => (
    <li className="flex flex-wrap gap-x-2"><span className="fm-cap">{label}</span><span style={{ color: bad ? "var(--status-over)" : undefined }}>{text}{bad ? " · MISLEADING" : ""}</span></li>
  );
  return (
    <section role="status" aria-label="Relation between the picked events" className="fm-card grid gap-1 p-3" style={{ borderWidth: 2, borderColor: lamBad || wallBad ? "var(--status-over)" : "var(--ink)" }}>
      <h3 className="font-mono font-semibold">{hbText}</h3>
      <ul className="grid gap-0.5 font-mono text-[12px]">
        {row("Vectors", `[${a.V}] vs [${b.V}] · ${r === "concurrent" ? "neither ≤ the other" : `[${x.V}] ≤ [${y.V}]`}`, false)}
        {row("Lamport", lamFirst ? `says ${lamFirst.name} first (${a.L} vs ${b.L})` : `tie at ${a.L}; P-id breaks it`, lamBad)}
        {row("Wall clock", wallFirst ? `says ${wallFirst.name} first (${a.wall} vs ${b.wall} ms)` : "tie", wallBad)}
      </ul>
    </section>
  );
}

export function ClocksView({ state: s, config: c, act }: ViewProps<ClocksConfig, ClocksState>) {
  const skews = skewsOf(c);
  const pair = pickedPair(s);
  const focus = s.picked.length ? evById(s, s.picked.at(-1)!) : undefined;
  const tone = (e: Ev) => (!focus || e.id === focus.id ? undefined : hb(e, focus) ? PAST : hb(focus, e) ? FUTURE : undefined);
  const flying = inFlight(s);
  const nowX = X0 + Math.min(s.events.length, MAX_EVENTS) * STEP + STEP / 2;
  const pickEv = (id: number) => act("pick", { id });
  return (
    <div className="grid gap-3 text-[14px] [&>*]:min-w-0">
      <div className="grid gap-2 sm:grid-cols-3">
        {Array.from({ length: N }, (_, p) => {
          const waiting = flying.filter((m) => m.to === p).length;
          return (
            <fieldset key={p} className="fm-card grid gap-1.5 p-2" disabled={full(s)}>
              <legend className="fm-cap px-1">{NAMES[p]} · L={s.L[p]} · V=[{s.V[p].join(",")}]{skews[p] + s.stepped[p] ? ` · skew ${skews[p] + s.stepped[p] > 0 ? "+" : ""}${skews[p] + s.stepped[p]} ms` : ""}</legend>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("local", { p, skews })}>Local</button>
                {Array.from({ length: N }, (_, to) => to !== p && (
                  <button key={to} type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("send", { p, to, skews, delay: c.delay })}>Send → {NAMES[to]}</button>
                ))}
                <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!waiting} onClick={() => act("receive", { p, skews })}>Receive{waiting ? ` (${waiting})` : ""}</button>
              </div>
            </fieldset>
          );
        })}
      </div>

      <figure className="grid gap-1">
        <figcaption className="fm-cap">Space-time diagram · time runs right · number under each event = Lamport L · click or Tab+Enter to pick events{focus ? ` · ${focus.name}: blue = its causal past, coral = its future, plain = concurrent` : ""}</figcaption>
        <div className="overflow-x-auto border border-ink" tabIndex={0} style={{ borderRadius: 2 }}>
          <svg viewBox={`0 0 ${W} 210`} className="h-auto w-full max-sm:min-w-[620px]" role="group" aria-label={`Space-time diagram with ${s.events.length} events and ${flying.length} messages in flight`}>
            {Array.from({ length: N }, (_, p) => (
              <g key={p}>
                <line x1={X0 - 6} x2={W - 8} y1={laneY(p)} y2={laneY(p)} stroke="var(--ink)" strokeWidth={1} />
                <text x={6} y={laneY(p) + 4} className="sim-sub" fill="var(--ink)">{NAMES[p]}</text>
              </g>
            ))}
            {s.msgs.map((m) => {
              const a = s.events[m.send];
              const b = m.recv !== undefined ? s.events[m.recv] : undefined;
              // A delivered message lies on a causal chain into (or out of) the focused event.
              const col = !focus || !b ? undefined : b.id === focus.id || hb(b, focus) ? PAST : a.id === focus.id || hb(focus, a) ? FUTURE : undefined;
              return (
                <line key={m.id} x1={xOf(a.id)} y1={laneY(a.p)} x2={b ? xOf(b.id) : nowX} y2={b ? laneY(b.p) : (laneY(a.p) + laneY(m.to)) / 2}
                  stroke={col ?? "var(--ink-muted)"} strokeWidth={col ? 2 : 1} strokeDasharray={b ? undefined : "4 3"} markerEnd={b ? "url(#clk-arrow)" : undefined} />
              );
            })}
            <defs>
              <marker id="clk-arrow" viewBox="0 0 8 8" refX="11" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="var(--ink-muted)" /></marker>
            </defs>
            {s.events.map((e) => {
              const picked = s.picked.includes(e.id);
              const col = tone(e);
              return (
                <g aria-hidden key={e.id} className="cursor-pointer"
                  onClick={() => pickEv(e.id)}>
                  <circle cx={xOf(e.id)} cy={laneY(e.p)} r={picked ? 8 : 6} fill={col ?? (e.kind === "local" ? "var(--surface)" : "var(--ink)")} stroke={picked ? "var(--status-hot)" : "var(--ink)"} strokeWidth={picked ? 3 : 1} />
                  <text x={xOf(e.id)} y={laneY(e.p) - 12} textAnchor="middle" className="sim-sub" fill="var(--ink)">{e.name}</text>
                  <text x={xOf(e.id)} y={laneY(e.p) + 20} textAnchor="middle" className="sim-sub" fill="var(--ink-muted)">{e.L}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </figure>

      {pair ? <Verdict a={pair[0]} b={pair[1]} /> : <p className="fm-cap">Pick two events to compare: A → B, B → A, or concurrent. {s.picked.length === 1 ? "One picked." : ""}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("clear")}>Clear diagram</button>
        <span className="fm-cap">{s.events.length}/{MAX_EVENTS} events · {flying.length} in flight · delay {c.delay} ms{c.auto ? " · auto events on" : ""}</span>
      </div>

      <figure className="grid gap-1">
        <figcaption className="fm-cap">Every event · L = Lamport, V = vector [P1,P2,P3], wall = true time + skew</figcaption>
        <div className="max-h-64 overflow-auto border border-ink" style={{ borderRadius: 2 }}>
          <table className="w-full font-mono text-[12px]">
            <thead><tr>{["Event", "Kind", "L", "V", "True ms", "Wall ms"].map((h) => <th key={h} className="whitespace-nowrap border-b border-ink px-2 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {s.events.map((e) => {
                const m = e.msg !== undefined ? s.msgs[e.msg] : undefined;
                const kind = e.kind === "local" ? "local" : e.kind === "send" ? `send → ${NAMES[m!.to]}` : `recv ← ${NAMES[m!.from]}`;
                return (
                  <tr key={e.id} style={{ color: tone(e) }}>
                    <td className="border-b border-line px-1 py-0.5"><button type="button" aria-pressed={s.picked.includes(e.id)} className="underline" onClick={() => pickEv(e.id)}>{s.picked.includes(e.id) ? "● " : ""}{e.name}</button></td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{kind}</td>
                    <td className="border-b border-line px-2 py-0.5">{e.L}</td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-0.5">[{e.V.join(",")}]</td>
                    <td className="border-b border-line px-2 py-0.5">{e.tru}</td>
                    <td className="border-b border-line px-2 py-0.5">{e.wall}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </figure>
    </div>
  );
}
