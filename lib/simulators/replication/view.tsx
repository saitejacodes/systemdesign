"use client";
import { Dot, IsoBlock, Leader, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { MODES, followerIds, headOf, lagMs, type Msg, type ReplConfig, type ReplState } from "./model";

const CELLS = 20;
const CW = 6;
const L: [number, number] = [170, 175];
const FX = 380;
const MAX_DOTS = 6;

/** The last CELLS log slots up to `top`; a slot is filled once the node has applied it. */
function LogBar({ x, y, applied, top, lostFrom }: { x: number; y: number; applied: number; top: number; lostFrom?: number }) {
  return (
    <g aria-hidden>
      {Array.from({ length: CELLS }, (_, k) => {
        const seq = top - CELLS + 1 + k;
        const has = seq > 0 && seq <= applied;
        const lost = has && lostFrom !== undefined && seq > lostFrom;
        return <rect key={k} x={x + k * CW} y={y} width={CW - 1} height={10} stroke="var(--ink)" strokeWidth={0.5} fill={lost ? "var(--status-over)" : has ? "var(--cobalt)" : "var(--surface)"} />;
      })}
    </g>
  );
}

const pOf = (m: Msg, t: number) => (t - m.sent) / Math.max(1, m.at - m.sent);

export function ReplView({ state: s, config: c, t, reducedMotion }: ViewProps<ReplConfig, ReplState>) {
  const fol = followerIds(s, c);
  const ldr = s.nodes[s.leader];
  const head = headOf(s);
  const gap = Math.min(80, 330 / fol.length);
  const top = 175 - ((fol.length - 1) * gap) / 2;
  const ys = fol.map((_, k) => top + k * gap);
  const bh = Math.min(40, gap - 26);
  const mode = MODES.find((m) => m.value === c.mode)!.value.toUpperCase().replace("SEMISYNC", "SEMI-SYNC");
  // Messages held by a partition pile up just short of the break.
  const cap = (p: number) => (s.partitioned ? Math.min(p, 0.45) : p);
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox="0 0 700 350" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`Leader N${s.leader + 1} at entry ${head}, ${mode} replication to ${fol.length} followers${s.partitioned ? ", partitioned" : ""}`}>
          {fol.map((i, k) => <g key={`w${i}`} opacity={s.nodes[i].down ? 0.3 : 1}><Wire from={L} to={[FX, ys[k]]} /></g>)}
          {s.partitioned && (
            <g>
              <line x1={275} x2={275} y1={10} y2={330} stroke="var(--status-over)" strokeWidth={2} strokeDasharray="6 4" />
              <text x={281} y={22} className="sim-sub" fill="var(--status-over)">PARTITION · HOLDING</text>
            </g>
          )}

          {!reducedMotion && fol.map((i, k) => {
            const n = s.nodes[i];
            const to: [number, number] = [FX, ys[k]];
            return (
              <g key={`d${i}`}>
                {n.inbox.slice(-MAX_DOTS).map((m) => <Dot key={`r${m.seq}`} from={L} to={to} p={cap(pOf(m, t))} />)}
                {n.acks.slice(-MAX_DOTS).map((m) => <Dot key={`a${m.seq}`} from={to} to={L} p={cap(pOf(m, t))} color="var(--status-ok)" />)}
              </g>
            );
          })}

          <IsoBlock x={20} y={135} w={150} h={80} d={20} tone={ldr.down ? "over" : "idle"} label={`N${s.leader + 1} · LEADER`} sub={ldr.down ? "CRASHED" : `${mode} · #${head}`} />
          <LogBar x={20} y={225} applied={ldr.applied} top={ldr.applied} />
          <text x={20} y={250} className="sim-sub" fill="var(--ink)">{ldr.down ? (Number.isFinite(s.failoverAt) ? `FAILOVER IN ${Math.max(0, Math.ceil((s.failoverAt - t) / 100) / 10)} s` : "DOWN") : `${s.pending.length} WAITING FOR ACKS`}</text>

          {fol.map((i, k) => {
            const n = s.nodes[i];
            const lag = lagMs(s, i);
            const behind = Math.max(0, head - n.applied);
            const tone: Tone = n.down ? "over" : lag >= 1000 ? "over" : lag >= 200 ? "hot" : "ok";
            const status = n.down ? "DOWN" : lag >= 1000 ? "FAR BEHIND" : lag >= 200 ? "LAGGING" : "OK";
            const slow = (i === c.followers ? c.slowFollower : 1) * n.spike;
            return (
              <g key={i}>
                <IsoBlock x={FX} y={ys[k] - bh / 2} w={96} h={bh} d={10} tone={tone} label={`N${i + 1}`} sub={bh >= 30 ? `#${n.applied}` : undefined} />
                <LogBar x={FX + 112} y={ys[k] - 14} applied={n.applied} top={Math.max(head, n.applied)} lostFrom={n.down ? n.truncTo || undefined : undefined} />
                <text x={FX + 112} y={ys[k] + 12} className="sim-sub" fill="var(--ink)">{status}{!n.down && ` · ${Math.round(lag)} ms · ${behind} behind`}{slow > 1 && ` · ×${slow}`}</text>
              </g>
            );
          })}

          <Leader from={[95, 215]} to={[60, 300]}>{c.readFrom === "leader" ? "READS → LEADER" : `READS → FOLLOWERS${c.ryw ? ` · RYW ${c.rywMs} ms` : ""}${c.monotonic ? " · STICKY" : ""}`}</Leader>
        </svg>
      </div>

      <section aria-label="Lost writes" className="fm-card grid gap-1 p-3" style={s.lostCount ? { borderColor: "var(--status-over)", borderWidth: 2 } : undefined}>
        <h3 className="fm-cap" style={{ color: s.lostCount ? "var(--status-over)" : "var(--status-ok)" }}>
          {s.lostCount ? `LOST ON FAILOVER · ${s.lostCount} acknowledged write${s.lostCount > 1 ? "s" : ""}` : "NO LOST WRITES"}
        </h3>
        {s.lostCount > 0 ? (
          <p className="flex flex-wrap gap-1 font-mono text-[12px]">
            {s.lost.map((l) => <span key={`${l.seq}-${l.user}`} className="border px-1" style={{ borderColor: "var(--status-over)", borderRadius: 2 }}>#{l.seq} · user {l.user + 1}</span>)}
            {s.lostCount > s.lost.length && <span>… and {s.lostCount - s.lost.length} more</span>}
          </p>
        ) : (
          <p className="text-[14px]">The client got OK for these writes, then the new leader never had them. Crash the leader under async to see some.</p>
        )}
      </section>
    </div>
  );
}
