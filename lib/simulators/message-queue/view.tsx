"use client";
import { Dot, IsoBlock, Leader, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { COMMIT_MS, label, lagOf, totalLag, type Consumer, type Group, type MqConfig, type MqState } from "./model";

const CELLS = 16;
const CW = 8;
const SX = 200; // strip x
const CX = 540; // consumer x
const PROD: [number, number] = [130, 175];

function Strip({ y, cells }: { y: number; cells: string[] }) {
  return <g aria-hidden>{cells.map((f, k) => <rect key={k} x={SX + k * CW} y={y - 6} width={CW - 1} height={12} stroke="var(--ink)" strokeWidth={0.5} fill={f} />)}</g>;
}

function conStatus(con: Consumer, g: Group, k: number, s: MqState): { tone: Tone; text: string } {
  if (!con.alive) return { tone: "over", text: "CRASHED" };
  if (g.rebalUntil) return { tone: "hot", text: "REBALANCING" };
  const owned = s.mode === "log" ? g.parts.flatMap((gp, p) => (gp.owner === k ? [`P${p}`] : [])) : [];
  if (s.mode === "log" && !owned.length) return { tone: "idle", text: "IDLE · NO PARTITION" };
  const slow = k === 0 && s.slow > 1 ? ` · ×${s.slow} SLOW` : "";
  const w = con.cur;
  const retry = w && w.tries > 1 ? ` · TRY ${w.tries}` : "";
  return { tone: w ? (slow || retry ? "hot" : "ok") : "idle", text: `${owned.join(" ")}${owned.length ? " · " : ""}${w ? "BUSY" : "IDLE"}${slow}${retry}` };
}

const semantics = (c: MqConfig) =>
  c.commit === "before"
    ? { tone: "var(--status-over)", tag: "AT-MOST-ONCE", text: c.mode === "log" ? "Offsets are committed when a batch is fetched. A crash mid-batch loses the rest: committed, never processed." : "Messages are auto-acked on receive. A crash or a failed attempt loses them." }
    : c.idempotent
      ? { tone: "var(--status-ok)", tag: "EFFECTIVELY-ONCE", text: "At-least-once delivery, but the consumer skips message ids it has already processed, so replays are harmless." }
      : { tone: "var(--status-hot)", tag: "AT-LEAST-ONCE", text: c.mode === "log" ? `Offsets are committed after processing, every ${COMMIT_MS / 1000} s. A crash replays everything since the last commit: duplicates.` : "Ack after processing. If the visibility timeout expires first, or a consumer dies, the message is delivered again: duplicates." };

export function MqView({ state: s, config: c, t, reducedMotion, act }: ViewProps<MqConfig, MqState>) {
  const g = s.groups[0];
  const log = s.mode === "log";
  const lanes = log ? s.parts.length : 1;
  const rows = Math.max(lanes, g.consumers.length);
  const gap = Math.min(48, 300 / rows);
  const yOf = (i: number, n: number) => 175 - ((n - 1) * gap) / 2 + i * gap;
  const laneY = Array.from({ length: lanes }, (_, i) => yOf(i, lanes));
  const conY = g.consumers.map((_, k) => yOf(k, g.consumers.length));
  const bh = Math.min(34, gap - 8);
  const sem = semantics(c);
  const stats = [
    { k: "Processed", v: g.processed, bad: false },
    { k: "Duplicates", v: g.dups, bad: g.dups > 0 },
    { k: "Deduped", v: g.deduped, bad: false },
    { k: "Lost", v: g.lost, bad: g.lost > 0 },
    { k: "Out of order", v: g.ooo, bad: g.ooo > 0 },
    { k: "DLQ", v: s.dlqCount, bad: false },
  ];
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 700 350" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${log ? `Topic with ${lanes} partitions` : "One queue"}, ${g.consumers.length} consumers in group A, lag ${totalLag(s)}, ${s.dlqCount} in the DLQ`}>
          {laneY.map((y, i) => <Wire key={`p${i}`} from={PROD} to={[SX - 4, y]} />)}
          {log
            ? s.parts.map((_, p) => { const o = g.parts[p].owner; return o >= 0 && !g.rebalUntil ? <Wire key={`o${p}`} from={[SX + CELLS * CW + 4, laneY[p]]} to={[CX, conY[o]]} /> : null; })
            : conY.map((y, k) => <Wire key={`o${k}`} from={[SX + CELLS * CW + 4, laneY[0]]} to={[CX, y]} />)}

          <IsoBlock x={20} y={145} w={110} h={60} d={12} tone={s.burst ? "hot" : "idle"} label="PRODUCERS" sub={`${c.rate * (s.burst ? 5 : 1)}/s${s.burst ? " BURST" : ""}`} />
          <Leader from={[75, 145]} to={[40, 40]}>{`${c.keys} KEYS · ${c.keyDist === "hot" ? "HOT KEY 50%" : "UNIFORM"}${log ? " · hash(key) mod P" : ""}`}</Leader>

          {log ? s.parts.map((part, p) => {
            const gp = g.parts[p];
            const end = part.base + part.msgs.length;
            const owner = gp.owner >= 0 ? g.consumers[gp.owner] : undefined;
            const blocked = !!owner?.cur && owner.cur.p === p && owner.cur.tries > 1;
            const cells = Array.from({ length: CELLS }, (_, k) => {
              const off = end - CELLS + k;
              return off < 0 ? "var(--surface)" : off < gp.committed ? "var(--ink-muted)" : off < gp.done ? "var(--status-ok)" : "var(--cobalt)";
            });
            const y = laneY[p];
            return (
              <g key={p}>
                <text x={SX - 8} y={y + 4} textAnchor="end" className="sim-sub" fill="var(--ink)">P{p}</text>
                <Strip y={y} cells={cells} />
                {bh >= 20 && <text x={SX} y={y + 18} className="sim-sub" fill={blocked ? "var(--status-over)" : "var(--ink)"}>{blocked ? "BLOCKED · " : ""}lag {lagOf(s, 0, p)}{s.groups[1] ? ` · B ${lagOf(s, 1, p)}` : ""}</text>}
              </g>
            );
          }) : (
            <g>
              <Strip y={laneY[0]} cells={Array.from({ length: CELLS }, (_, k) => { const ready = s.ready.length - s.rHead; return k < Math.min(CELLS, ready) ? "var(--cobalt)" : k < Math.min(CELLS, ready + s.inflight.length) ? "var(--status-hot)" : "var(--surface)"; })} />
              <text x={SX} y={laneY[0] - 14} className="sim-sub" fill="var(--ink)">QUEUE · {s.ready.length - s.rHead} READY · {s.inflight.length} IN FLIGHT</text>
              <text x={SX} y={laneY[0] + 20} className="sim-sub" fill="var(--ink)">VISIBILITY {c.visibilityMs} ms</text>
            </g>
          )}

          {!reducedMotion && g.consumers.map((con, k) => {
            const w = con.cur;
            if (!w || !con.alive || w.doneAt <= w.startAt) return null;
            return <Dot key={`d${k}`} from={[SX + CELLS * CW + 4, laneY[log ? w.p : 0]]} to={[CX, conY[k]]} p={(t - w.startAt) / (w.doneAt - w.startAt)} color={w.tries > 1 ? "var(--status-over)" : undefined} />;
          })}

          {g.consumers.map((con, k) => {
            const st = conStatus(con, g, k, s);
            return (
              <g key={k}>
                <IsoBlock x={CX} y={conY[k] - bh / 2} w={64} h={bh} d={8} tone={st.tone} label={`C${k + 1}`} />
                <text x={CX + 80} y={conY[k] + 4} className="sim-sub" fill={st.tone === "over" ? "var(--status-over)" : "var(--ink)"}>{st.text}</text>
              </g>
            );
          })}

          <IsoBlock x={20} y={270} w={110} h={44} d={10} tone={s.dlqCount ? "over" : "idle"} label="DLQ" sub={`${s.dlqCount} msg${s.dlqCount === 1 ? "" : "s"}`} />
          <text x={CX} y={335} className="sim-sub" fill="var(--ink)">GROUP A{g.rebalUntil ? ` · PAUSED ${Math.max(0, Math.ceil((g.rebalUntil - t) / 100) / 10)} s` : ""}{s.groups[1] ? " · GROUP B READS TOO" : ""}</text>
          {log && [["var(--ink-muted)", "COMMITTED"], ["var(--status-ok)", "DONE"], ["var(--cobalt)", "LAG"]].map(([f, txt], i) => (
            <g key={txt}><rect x={SX + i * 90} y={326} width={10} height={10} fill={f} stroke="var(--ink)" strokeWidth={0.5} /><text x={SX + 14 + i * 90} y={335} className="sim-sub" fill="var(--ink)">{txt}</text></g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("poison")}>Inject poison message</button>
        {s.groups.map((_, gi) => (
          <button key={gi} type="button" className="fm-btn fm-btn--tool !h-8" disabled={!log} onClick={() => act("replay", { group: gi })}>Replay group {label(gi)} from earliest</button>
        ))}
        {!log && <span className="fm-cap">Queue mode: acked messages are deleted, so there is nothing to replay</span>}
      </div>

      <section aria-label="Delivery guarantee" className="fm-card grid gap-2 p-3" style={{ borderColor: sem.tone, borderWidth: 2 }}>
        <h3 className="fm-cap" style={{ color: sem.tone }}>{sem.tag}</h3>
        <p className="text-[14px]">{sem.text}</p>
        <dl className="grid grid-cols-3 gap-2 font-mono text-[12px] sm:grid-cols-6">
          {stats.map((x) => (
            <div key={x.k}>
              <dt className="fm-cap">{x.k}</dt>
              <dd style={{ color: x.bad ? "var(--status-over)" : undefined }}>{x.v}{x.bad ? " · BAD" : ""}</dd>
            </div>
          ))}
        </dl>
        {s.dlq.length > 0 && (
          <p className="flex flex-wrap gap-1 font-mono text-[12px]">
            <span className="fm-cap">DLQ ·</span>
            {s.dlq.slice(-8).map((d) => <span key={d.id} className="border px-1" style={{ borderColor: "var(--status-over)", borderRadius: 2 }}>#{d.id} · key {d.key} · {d.tries} tries{d.poison ? " · poison" : ""}</span>)}
          </p>
        )}
      </section>
    </div>
  );
}
