"use client";
import { IsoBlock } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { DIST, KEYS, TIMEOUT_MS, liveCount, ord, type Op, type QuorumConfig, type QuorumState } from "./model";

const COL = 96;
const X0 = 20;
const ok = "var(--status-ok)", hot = "var(--status-hot)", over = "var(--status-over)";

export function QuorumView({ state: s, config: c, act }: ViewProps<QuorumConfig, QuorumState>) {
  const { n, r, w } = s.eff;
  const live = liveCount(s);
  const overlap = r + w > n;
  const latest = s.acked;
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <section aria-label="Quorum rule" className="fm-card grid gap-1 p-3" style={{ borderColor: overlap ? ok : hot, borderWidth: 2 }}>
        <h3 className="fm-cap" style={{ color: overlap ? ok : hot }}>
          R + W = {r} + {w} = {r + w} {overlap ? ">" : "≤"} N = {n} · {overlap ? "OVERLAP GUARANTEED" : "NO OVERLAP GUARANTEE"}
        </h3>
        <p className="text-[14px]">
          {overlap
            ? `Any ${w} replicas that took a write and any ${r} a read asks share at least ${r + w - n}, so a read always meets the newest acknowledged version.`
            : `A write can land on ${w} replica${w > 1 ? "s" : ""} and a read can ask ${r} others: it may return an old version.`}
        </p>
        <p className="font-mono text-[12px]">
          <span style={{ color: live >= r ? ok : over }}>READS {live >= r ? "AVAILABLE" : "UNAVAILABLE"}</span> · survive N − R = {n - r} failure{n - r === 1 ? "" : "s"} ·{" "}
          <span style={{ color: live >= w ? ok : over }}>WRITES {live >= w ? "AVAILABLE" : "UNAVAILABLE"}</span> · survive N − W = {n - w} · {live}/{n} up
        </p>
      </section>

      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox={`0 0 ${X0 * 2 + n * COL} 300`} className="h-auto w-full max-sm:min-w-[480px]" role="group" aria-label={`${n} replicas, ${live} up. Version table of ${KEYS} keys; cells behind the latest acknowledged version are marked.`}>
          {s.nodes.slice(0, n).map((nd, i) => {
            const x = X0 + i * COL;
            const inW = s.lastWrite?.replies.slice(0, s.lastWrite.need).some((p) => p.node === i);
            const inR = s.lastRead?.replies.slice(0, s.lastRead.need).some((p) => p.node === i);
            return (
              <g aria-hidden key={i} className="cursor-pointer"
                onClick={() => act("toggle", i)}>
                <IsoBlock x={x} y={22} w={COL - 24} h={44} d={8} tone={nd.down ? "over" : nd.slow > 1 ? "hot" : "idle"} label={`N${i + 1}`} sub={nd.down ? "DOWN" : `${DIST[i] * nd.slow * c.latency} ms`} />
                <text x={x} y={84} className="sim-sub" fill="var(--ink)">{inW ? "W " : ""}{inR ? "R" : ""}</text>
                {Array.from({ length: KEYS }, (_, k) => {
                  const v = nd.data[k];
                  const behind = v < latest[k];
                  return (
                    <g key={k} aria-hidden>
                      <rect x={x} y={92 + k * 25} width={COL - 24} height={21} stroke="var(--ink)" strokeWidth={0.75} fill={behind ? "var(--status-hot-fill)" : "var(--surface)"} opacity={nd.down ? 0.5 : 1} />
                      <text x={x + 6} y={107 + k * 25} className="sim-sub" fill="var(--ink)">K{k + 1} v{v}{behind ? " OLD" : ""}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="fm-cap">Replicas</span>
        {s.nodes.slice(0, n).map((nd, i) => (
          <button key={i} type="button" aria-pressed={nd.down} className={`fm-btn fm-btn--tool !h-8 ${nd.down ? "is-on" : ""}`} onClick={() => act("toggle", i)}>
            {nd.down ? `Restart N${i + 1}` : `Crash N${i + 1}`}
          </button>
        ))}
        <span className="fm-help">OLD = behind the newest acknowledged version. Nothing repairs it except a later write.</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <Timing op={s.lastWrite} title="Last write" />
        <Timing op={s.lastRead} title="Last read" />
      </div>
    </div>
  );
}

/** Each replica's reply time; the request completes at the need-th one. */
function Timing({ op, title }: { op: Op | null; title: string }) {
  if (!op) return <section aria-label={title} className="fm-card p-3"><h3 className="fm-cap">{title}</h3><p className="text-[14px]">Press Play to send requests.</p></section>;
  const reps = [...op.replies].sort((a, b) => a.at - b.at);
  const max = Math.max(1, ...reps.map((p) => p.at));
  const scale = (v: number) => 70 + (v / max) * 200;
  const done = op.status === "ok" || op.status === "stale";
  const tone = op.status === "ok" ? ok : op.status === "stale" ? hot : over;
  const what = op.kind === "write" ? `K${op.key + 1} = v${op.ver}` : `K${op.key + 1} → v${op.ver}${op.floor ? ` (newest acked v${op.floor})` : ""}`;
  return (
    <section aria-label={title} className="fm-card grid gap-1 p-3">
      <h3 className="fm-cap">{title} · {what} · coordinator {op.coord >= 0 ? `N${op.coord + 1}` : "none"}</h3>
      <p className="font-mono text-[12px]" style={{ color: tone }}>
        {op.status === "ok" ? "OK" : op.status === "stale" ? "STALE READ" : op.status === "timeout" ? `TIMED OUT (${TIMEOUT_MS} ms)` : op.status === "unavailable" ? "UNAVAILABLE · too few replicas up" : "WAITING"}
        {done && ` · ${(op.doneAt - op.start).toFixed(1)} ms = ${ord(op.need)} fastest of ${reps.length}`}
      </p>
      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox={`0 0 340 ${16 + reps.length * 20}`} className="h-auto w-full" role="img" aria-label={`Reply times: ${reps.map((p) => `N${p.node + 1} ${p.at.toFixed(1)} ms${op.kind === "read" ? ` v${p.ver}` : ""}`).join(", ")}`}>
          {reps.map((p, k) => {
            const counted = k < op.need;
            return (
              <g key={p.node}>
                <text x={4} y={20 + k * 20} className="sim-sub" fill="var(--ink)">N{p.node + 1}{op.kind === "read" ? ` v${p.ver}` : ""}</text>
                <rect x={70} y={10 + k * 20} width={Math.max(2, scale(p.at) - 70)} height={12} fill={counted ? "var(--cobalt)" : "var(--surface)"} stroke="var(--ink)" strokeWidth={0.75} />
                <text x={scale(p.at) + 4} y={20 + k * 20} className="sim-sub" fill="var(--ink)">{p.at.toFixed(1)}{counted ? "" : " · not waited"}</text>
              </g>
            );
          })}
          {done && reps[op.need - 1] && <line x1={scale(reps[op.need - 1].at)} x2={scale(reps[op.need - 1].at)} y1={4} y2={12 + reps.length * 20} stroke={tone} strokeWidth={1.5} strokeDasharray="4 3" />}
        </svg>
      </div>
    </section>
  );
}
