"use client";
import { Dot, IsoBlock, Leader, Wire, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { BIN_MS, BINS, BUCKET_MAX, POLICIES, abandoned, capFactor, errorRate, queueLen, recoverMs, userRate, type RetryConfig, type RetryState } from "./model";

const CL: [number, number] = [150, 120];
const QX = 220;
const QW = 260;
const SV: [number, number] = [530, 120];
const TONE = { ok: "var(--status-ok)", hot: "var(--status-hot)", over: "var(--status-over)", idle: "var(--ink)" } as const;

/** Bins oldest → newest; the newest bin is still filling, so it is left out. */
function bins(s: RetryState) {
  return Array.from({ length: BINS - 1 }, (_, k) => {
    const i = (s.binIdx + 1 + k) % BINS;
    return { all: s.sent[i], first: s.firstSent[i] };
  });
}

export function RetryView({ state: s, config: c, t, reducedMotion }: ViewProps<RetryConfig, RetryState>) {
  const b = bins(s);
  const last = b.slice(-1000 / BIN_MS);
  const per = 1000 / (last.length * BIN_MS);
  const offered = last.reduce((x, y) => x + y.all, 0) * per;
  const first = last.reduce((x, y) => x + y.first, 0) * per;
  const amp = first ? offered / first : 1;
  const ql = queueLen(s);
  const dead = abandoned(s);
  const wait = (ql / Math.max(1, s.capEff)) * 1000;
  const err = errorRate(s, c);
  const brown = capFactor(s, c) < 1;
  const tone: Tone = wait >= c.timeoutMs ? "over" : wait >= c.timeoutMs / 2 || err || brown ? "hot" : "ok";
  const status = wait >= c.timeoutMs ? "OVERLOADED" : tone === "hot" ? "HOT" : "OK";
  const succ = userRate(s);
  const tokens = c.budget ? s.tokens.reduce((x, y) => x + y, 0) / Math.max(1, s.tokens.length) : 0;
  // The queue bar spans 2× the timeout; past the marker every request belongs to a client that has given up.
  const span = c.timeoutMs * 2;
  const fillW = Math.min(1, wait / span) * QW;
  const deadW = Math.min(fillW, ((dead / Math.max(1, s.capEff)) * 1000 / span) * QW);
  const nDots = reducedMotion ? 0 : Math.min(12, Math.round(offered / 250));
  const nRet = reducedMotion ? 0 : Math.min(8, Math.round((offered - first) / 250));
  const peak = Math.max(...b.map((x) => x.all), (s.capEff * BIN_MS) / 1000 * 1.5, 1);
  const capY = 120 - ((s.capEff * BIN_MS) / 1000 / peak) * 100;
  const policy = POLICIES.find((p) => p.value === c.policy)!.label;
  const rec = s.healAt < 0 ? "—" : s.recoveredAt >= 0 ? `${(recoverMs(s) / 1000).toFixed(1)} s` : `DOWN ${(recoverMs(s) / 1000).toFixed(0)} s`;

  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 700 250" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${c.clients} clients send ${Math.round(offered)} attempts a second (${amp.toFixed(2)}× the ${Math.round(first)} new requests) to a service with capacity ${Math.round(s.capEff)}. Queue ${ql}, ${dead} abandoned. ${status}.`}>
          <Wire from={CL} to={[QX, 120]} />
          <Wire from={[QX + QW, 120]} to={SV} />
          {Array.from({ length: nDots }, (_, k) => <Dot key={`n${k}`} from={CL} to={[QX, 120]} p={(t / 500 + k / nDots) % 1} />)}
          {Array.from({ length: nRet }, (_, k) => <Dot key={`r${k}`} from={[CL[0], 132]} to={[QX, 132]} p={(t / 400 + (k + 0.5) / nRet) % 1} color="var(--status-hot)" />)}

          <IsoBlock x={20} y={80} w={130} h={80} d={14} tone="idle" label={`${c.clients.toLocaleString()} CLIENTS`} sub={c.policy === "none" ? "NO RETRY" : `${c.maxRetries} RETRIES MAX`} />
          <text x={20} y={180} className="sim-sub" fill="var(--ink)">{policy.toUpperCase()}</text>
          {c.policy === "backoff" || c.policy === "jitter" ? <text x={20} y={196} className="sim-sub" fill="var(--ink)">BASE {c.baseMs} · CAP {c.capMs} ms</text> : null}
          <text x={20} y={212} className="sim-sub" fill="var(--ink)">TIMEOUT {c.timeoutMs} ms</text>
          {c.budget && (
            <g>
              <text x={20} y={232} className="sim-sub" fill="var(--ink)">BUDGET {(tokens * 100 / BUCKET_MAX).toFixed(0)}%</text>
              <rect x={110} y={223} width={60} height={10} fill="var(--surface)" stroke="var(--ink)" />
              <rect x={110} y={223} width={60 * tokens / BUCKET_MAX} height={10} fill={tokens < 0.2 ? "var(--status-hot)" : "var(--status-ok)"} />
            </g>
          )}

          <text x={QX} y={84} className="sim-sub" fill="var(--ink)">QUEUE · {ql.toLocaleString()} · WAIT {wait >= 10_000 ? `${(wait / 1000).toFixed(0)} s` : `${Math.round(wait)} ms`}</text>
          <rect x={QX} y={100} width={QW} height={40} fill="var(--surface)" stroke="var(--ink)" />
          {/* FIFO: the head (oldest) is at the right, next to the server. */}
          <rect x={QX + QW - fillW} y={100} width={fillW} height={40} fill="var(--cobalt)" opacity={0.35} />
          <rect x={QX + QW - deadW} y={100} width={deadW} height={40} fill="var(--status-over)" opacity={0.55} />
          <line x1={QX + QW / 2} x2={QX + QW / 2} y1={94} y2={146} stroke="var(--ink)" strokeDasharray="3 2" />
          <text x={QX + QW / 2} y={160} textAnchor="middle" className="sim-sub" fill="var(--ink)">← TIMEOUT · {c.queueLimit ? `LIMIT ${c.queueLimit}` : "UNBOUNDED"}</text>
          {dead > 0 && <Leader from={[QX + QW - deadW / 2, 140]} to={[QX + QW - 40, 190]} anchor="end">{dead.toLocaleString()} ABANDONED{c.dropExpired ? " · SKIPPED" : " · STILL SERVED"}</Leader>}

          <IsoBlock x={SV[0]} y={80} w={140} h={80} d={14} tone={tone} label={`SERVICE · ${status}`} sub={`${Math.round(s.capEff)}/s${err ? ` · ${err * 100}% ERR` : ""}${brown ? " · BROWNOUT" : ""}`} />
          <text x={SV[0]} y={180} className="sim-sub" fill={TONE[tone]}>OFFERED {Math.round(offered)}/s · {amp.toFixed(2)}×</text>
          <text x={SV[0]} y={196} className="sim-sub" fill="var(--ink)">USERS OK {(succ * 100).toFixed(0)}%</text>
          <text x={SV[0]} y={212} className="sim-sub" fill="var(--ink)">RECOVERY {rec}</text>
          {s.wasted > 0 && <text x={SV[0]} y={228} className="sim-sub" fill="var(--status-over)">WASTED {s.wasted.toLocaleString()}</text>}
        </svg>
      </div>

      <section aria-label="Attempts sent per 50 ms" className="fm-card grid gap-1 p-3">
        <h3 className="fm-cap">Attempts per {BIN_MS} ms · last {(BINS * BIN_MS) / 1000} s · <span style={{ color: "var(--cobalt)" }}>new</span> · <span style={{ color: "var(--status-hot)" }}>retries</span> · dashed = capacity</h3>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 640 130" className="h-auto w-full max-sm:min-w-[480px]" role="img" aria-label={`Peak ${Math.max(...b.map((x) => x.all))} attempts in one ${BIN_MS} ms bin; capacity is ${Math.round((s.capEff * BIN_MS) / 1000)} per bin`}>
            {b.map((x, k) => {
              const w = 640 / b.length;
              const hAll = (x.all / peak) * 100, hFirst = (x.first / peak) * 100;
              return (
                <g key={k}>
                  <rect x={k * w} y={120 - hAll} width={w - 1} height={hAll - hFirst} fill="var(--status-hot)" />
                  <rect x={k * w} y={120 - hFirst} width={w - 1} height={hFirst} fill="var(--cobalt)" />
                </g>
              );
            })}
            <line x1={0} x2={640} y1={capY} y2={capY} stroke="var(--ink)" strokeDasharray="5 3" />
            <line x1={0} x2={640} y1={120} y2={120} stroke="var(--ink)" />
          </svg>
        </div>
        <p className="text-[14px]">Retries of requests that failed together go out together. Without jitter they come back as spikes far above capacity; full jitter spreads each wave across its whole backoff window.</p>
      </section>
    </div>
  );
}
