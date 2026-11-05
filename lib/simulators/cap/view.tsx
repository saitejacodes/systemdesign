"use client";
import { Dot, lerp, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { KEYS, cutCount, hasQuorum, majority, type CapConfig, type CapState, type Version } from "./model";

const W = 150;
const H = 84;
const NOTE_MS = 1500;
const MAX_DOTS = 40;
const FILL: Record<Tone, string> = { ok: "var(--status-ok-fill)", hot: "var(--status-hot-fill)", over: "var(--status-over-fill)", idle: "var(--surface)" };
const INK: Record<"ok" | "hot" | "over", string> = { ok: "var(--status-ok)", hot: "var(--status-hot)", over: "var(--status-over)" };

/** Nodes on an ellipse, N1 at the top, clockwise. */
const posOf = (n: number) => Array.from({ length: n }, (_, i): [number, number] => {
  const a = (-90 + (360 * i) / n) * (Math.PI / 180);
  return [360 + 230 * Math.cos(a), 195 + 125 * Math.sin(a)];
});

const cart = (vs: Version[]) => (vs.length === 0 ? "empty" : vs.length > 1 ? `${vs.length} SIBLINGS ${vs.map((v) => `#${v.id}`).join("|")}` : `#${vs[0].id} · ${vs[0].items.length} items`);

export function CapView({ state: s, config: c, t, reducedMotion, act }: ViewProps<CapConfig, CapState>) {
  const n = c.nodes;
  const P = posOf(n);
  const links: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) links.push([a, b]);
  const cuts = cutCount(s);
  const cp = c.mode === "cp";
  const toggle = (a: number, b: number) => act("toggleLink", { a, b });
  const dots = reducedMotion ? [] : s.msgs.filter((m) => m.sent <= t && m.from < n && m.to < n).slice(-MAX_DOTS);
  const calm = (m: "cp" | "ap") => (s.calm[m].n ? `${(s.calm[m].sum / s.calm[m].n).toFixed(m === "ap" ? 1 : 0)} ms over ${s.calm[m].n} writes` : "not measured yet");
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox="0 0 720 400" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${n} replicas in ${cp ? "CP" : "AP"} mode, ${cuts} link${cuts === 1 ? "" : "s"} cut`}>
          {links.map(([a, b]) => {
            const cut = s.cut[a][b];
            // Click targets sit 42% along each link so the two diagonals of a square don't share a midpoint.
            const [mx, my] = lerp(P[a], P[b], 0.42);
            return (
              <g key={`${a}-${b}`}>
                <line x1={P[a][0]} y1={P[a][1]} x2={P[b][0]} y2={P[b][1]} stroke={cut ? "var(--status-over)" : "var(--ink)"} strokeWidth={cut ? 2 : 1} strokeDasharray={cut ? "6 4" : "4 3"} />
                <line x1={P[a][0]} y1={P[a][1]} x2={P[b][0]} y2={P[b][1]} stroke="transparent" strokeWidth={14} className="cursor-pointer" onClick={() => toggle(a, b)} />
                <g aria-hidden className="cursor-pointer" onClick={() => toggle(a, b)}>
                  <circle cx={mx} cy={my} r={10} fill={cut ? "var(--status-over-fill)" : "var(--surface)"} stroke={cut ? "var(--status-over)" : "var(--ink)"} strokeWidth={1.5} />
                  <text x={mx} y={my + 4} textAnchor="middle" className="sim-sub" fill={cut ? "var(--status-over)" : "var(--ink)"}>{cut ? "✕" : "✂"}</text>
                </g>
              </g>
            );
          })}

          {dots.map((m, k) => <Dot key={`${k}-${m.sent}-${m.from}-${m.to}`} from={P[m.from]} to={P[m.to]} p={(t - m.sent) / Math.max(1, m.at - m.sent)} color={m.v ? "var(--cobalt)" : "var(--phase-4)"} />)}

          {P.map(([x, y], i) => {
            const quorum = hasQuorum(s, i);
            const isolatedFrom = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i && s.cut[i][j]).length;
            const conflicted = s.stores[i].some((v) => v.length > 1);
            const tone: Tone = cp ? (quorum ? (isolatedFrom ? "hot" : "ok") : "over") : conflicted ? "hot" : isolatedFrom ? "hot" : "ok";
            const status = cp ? (quorum ? (isolatedFrom ? "MAJORITY · OK" : "OK") : "MINORITY · REFUSING") : conflicted ? "SIBLINGS" : isolatedFrom ? "DIVERGING" : "OK";
            const note = s.notes[i] && t - s.notes[i]!.at < NOTE_MS ? s.notes[i] : null;
            const x0 = x - W / 2, y0 = y - H / 2;
            return (
              <g key={i}>
                <rect x={x0} y={y0} width={W} height={H} fill={FILL[tone]} stroke="var(--ink)" strokeWidth={1.5} />
                <text x={x0 + 6} y={y0 + 14} className="sim-lbl" fill="var(--ink)">N{i + 1} · {status}</text>
                {KEYS.map((k, ki) => (
                  <text key={k} x={x0 + 6} y={y0 + 32 + ki * 15} className="sim-sub" fill={s.stores[i][ki].length > 1 ? "var(--status-over)" : "var(--ink)"}>{k}: {cart(s.stores[i][ki])}</text>
                ))}
                <text x={x} y={y0 + H + 14} textAnchor="middle" className="sim-sub" fill={note ? INK[note.tone] : "var(--ink-muted)"}>C{i + 1} {note ? `→ ${note.text}` : "· client"}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <section aria-label="Network links" className="fm-card grid gap-2 p-3">
        <h3 className="fm-cap">Links · click one on the canvas or here · majority = {majority(n)} of {n}</h3>
        <div className="flex flex-wrap gap-1.5">
          {links.map(([a, b]) => (
            <button key={`${a}-${b}`} type="button" aria-pressed={s.cut[a][b]} className={`fm-btn fm-btn--tool !h-8 ${s.cut[a][b] ? "is-on" : ""}`} onClick={() => toggle(a, b)} style={s.cut[a][b] ? { color: "var(--status-over)" } : undefined}>
              N{a + 1}–N{b + 1} · {s.cut[a][b] ? "CUT" : "UP"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("split")}>Split majority | minority</button>
          <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("isolate", { node: n - 1 })}>Isolate / rejoin N{n}</button>
          <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!cuts} onClick={() => act("healAll")}>Heal every link</button>
        </div>
      </section>

      <section aria-label="PACELC" className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <div className="fm-card grid content-start gap-1 p-3" style={cuts ? { borderColor: "var(--status-over)", borderWidth: 2 } : undefined}>
          <h3 className="fm-cap" style={{ color: cuts ? "var(--status-over)" : undefined }}>IF PARTITION · A or C {cuts ? "· ACTIVE NOW" : ""}</h3>
          <p className="text-[14px]">{cp
            ? `CP: a node that can't reach ${majority(n)} of ${n} refuses. ${s.rejected} requests rejected, ${s.stale} stale reads.`
            : `AP: every node answers from its own copy. ${s.stalePart} reads missed a write across a cut link; ${s.conflicts} conflicts found on heal, ${s.lost} acknowledged writes lost${c.resolve === "lww" ? " to last-write-wins" : " (siblings keep both sides)"}.`}</p>
        </div>
        <div className="fm-card grid content-start gap-1 p-3" style={cuts ? undefined : { borderColor: "var(--cobalt)", borderWidth: 2 }}>
          <h3 className="fm-cap" style={{ color: cuts ? undefined : "var(--cobalt)" }}>ELSE · L or C {cuts ? "" : "· ACTIVE NOW"}</h3>
          <p className="text-[14px]">Nothing broken, and the choice still costs. CP waits for a majority round trip on every read and write: about 2 × {c.delay} = {2 * c.delay} ms. AP answers locally in about 1 ms but can read stale while replication is in flight.</p>
          <p className="font-mono text-[12px]">CP measured: {calm("cp")} · AP measured: {calm("ap")} · stale reads with every link up: {s.calmStale}</p>
        </div>
      </section>

      {s.lostList.length > 0 && (
        <section aria-label="Lost writes" className="fm-card grid gap-1 p-3" style={{ borderColor: "var(--status-over)", borderWidth: 2 }}>
          <h3 className="fm-cap" style={{ color: "var(--status-over)" }}>LOST TO LAST-WRITE-WINS · {s.lost} acknowledged write{s.lost > 1 ? "s" : ""}</h3>
          <p className="flex flex-wrap gap-1 font-mono text-[12px]">
            {s.lostList.map((l) => <span key={l.id} className="border px-1" style={{ borderColor: "var(--status-over)", borderRadius: 2 }}>{KEYS[l.key]} #{l.id} → kept #{l.winner}</span>)}
          </p>
        </section>
      )}
    </div>
  );
}
