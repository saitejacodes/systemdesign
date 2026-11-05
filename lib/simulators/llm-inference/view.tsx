"use client";
import { memo } from "react";
import { Leader } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { ASSUME, CELL, CTX, GPUS, GRID_STEPS, MODELS, SHOW_SLOTS, WBYTES, expectedTokens, stepCost, tpOf, type LlmConfig, type LlmState, type Replica, type Seq } from "./model";

type Col = Replica["grid"][number];

const GB = (b: number) => `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB`;
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const ms1 = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)} ms`;

export function LlmView({ state: s, config: c, act, reducedMotion }: ViewProps<LlmConfig, LlmState>) {
  const r = s.reps[s.focus];
  return (
    <div className="grid gap-3 p-1 [&>*]:min-w-0">
      <MemoryBars s={s} c={c} act={act} reducedMotion={reducedMotion} />
      {r && <BatchGrid r={r} c={c} />}
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        <Queue s={s} />
        <Ticker s={s} c={c} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        <Roofline r={r} c={c} />
        <Arithmetic s={s} c={c} r={r} />
      </div>
    </div>
  );
}

// ── GPU memory per replica, as stacked isometric columns ────────────────────────────────────────

function MemoryBars({ s, c, act, reducedMotion }: { s: LlmState; c: LlmConfig; act: ViewProps<LlmConfig, LlmState>["act"]; reducedMotion: boolean }) {
  const tp = tpOf(c);
  const cap = tp * GPUS[c.gpu].mem;
  const n = Math.max(1, s.reps.length);
  const W = Math.min(64, 430 / n - 18), H = 190, Y0 = 230, D = 12;
  const blockB = s.L.kvPerTok * ASSUME.block;
  const y = (b: number) => (b / cap) * H;
  const focus = s.reps[s.focus];
  return (
    <figure className="grid gap-1">
      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox="0 0 700 270" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${s.reps.length} replica${s.reps.length === 1 ? "" : "s"} of TP${tp}. ${s.L.fits ? `Each holds ${GB(s.L.perGpuWeights)} of weights per GPU and ${n0(s.L.blocks * ASSUME.block)} tokens of KV cache.` : "The model does not fit."}`}>
          <defs>
            <pattern id="llm-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--status-hot-fill)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--status-hot)" strokeWidth="2" /></pattern>
          </defs>
          {s.reps.map((r, i) => {
            const x = 20 + i * (W + 18);
            const used = (r.total - r.free) * blockB;
            let fill = r.prefix * blockB;
            for (const q of r.run) fill += q.kv * s.L.kvPerTok;
            fill = Math.min(fill, used);
            const segs: { b: number; f: string; k: string }[] = [
              { b: s.L.weights, f: "var(--cobalt)", k: "weights" },
              { b: fill, f: "var(--phase-4)", k: "kv" },
              { b: Math.max(0, used - fill), f: "url(#llm-hatch)", k: "reserved" },
              { b: r.free * blockB, f: "var(--surface)", k: "free" },
              { b: Math.max(0, cap - s.L.weights - r.total * blockB), f: "var(--surface-sunk)", k: "headroom" },
            ];
            let top = Y0;
            const oom = !s.L.fits;
            return (
              <g key={i} onClick={() => act("focus", { i })} style={{ cursor: "pointer" }} opacity={r.alive ? 1 : 0.45}>
                {segs.map((g) => {
                  const h = Math.min(y(g.b), Math.max(0, top - (Y0 - H - 30)));
                  if (h <= 0.2) return null;
                  top -= h;
                  return <rect key={g.k} x={x} y={top} width={W} height={h} fill={oom && g.k === "weights" ? "var(--status-over)" : g.f} stroke="var(--ink)" strokeWidth={0.75} style={!reducedMotion ? { transition: "height 200ms, y 200ms" } : undefined} />;
                })}
                <path d={`M${x},${top} l${D},${-D / 2} h${W} l${-D},${D / 2} z`} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1} />
                <path d={`M${x + W},${top} l${D},${-D / 2} V${Y0 - D / 2} l${-D},${D / 2} z`} fill="var(--surface-sunk)" stroke="var(--ink)" strokeWidth={1} />
                <rect x={x} y={top} width={W} height={Y0 - top} fill="none" stroke="var(--ink)" strokeWidth={i === s.focus ? 2.5 : 1.5} />
                <text x={x + W / 2} y={Y0 + 16} textAnchor="middle" className="sim-sub" fill="var(--ink)">R{i + 1}{i === s.focus ? " ◆" : ""}</text>
                <text x={x + W / 2} y={Y0 + 30} textAnchor="middle" className="sim-sub" fill={!r.alive || oom ? "var(--status-over)" : "var(--ink)"}>{!r.alive ? "DOWN" : oom ? "NO FIT" : `${r.run.length} RUN`}</text>
              </g>
            );
          })}
          {focus && (() => {
            const x = 20 + s.focus * (W + 18) + W;
            const ys = [Y0 - y(s.L.weights) / 2, Y0 - y(s.L.weights) - 10];
            const lx = 520;
            const used = (focus.total - focus.free) * blockB;
            return (
              <g>
                <Leader from={[x - 4, Math.max(40, ys[0])]} to={[lx, 200]}>{s.L.fits ? `WEIGHTS ${GB(s.L.weights)} (${GB(s.L.perGpuWeights)}/GPU)` : `WEIGHTS ${GB(s.L.perGpuWeights)}/GPU · DOES NOT FIT`}</Leader>
                <Leader from={[x - 4, Math.max(40, ys[1])]} to={[lx, 150]}>{`KV IN USE ${GB(used)} · ${s.L.blocks ? Math.round(((focus.total - focus.free) / focus.total) * 100) : 0}%`}</Leader>
                <Leader from={[x - 4, 60]} to={[lx, 100]}>{`KV FREE ${GB(focus.free * blockB)}`}</Leader>
                <text x={lx} y={40} className="sim-sub" fill="var(--ink)">{`${tp} × ${GB(GPUS[c.gpu].mem)} · TP${tp}${s.L.idleGpus ? ` · ${s.L.idleGpus} GPU IDLE` : ""}`}</text>
                <text x={lx} y={56} className="sim-sub" fill="var(--ink-muted)">{c.kvAlloc === "reserve" ? "HATCHED = RESERVED, UNUSED" : focus.prefixReady ? `SHARED PREFIX ${focus.prefix} BLOCKS` : "PAGED · 16-TOKEN BLOCKS"}</text>
              </g>
            );
          })()}
        </svg>
      </div>
      <figcaption className="fm-cap flex flex-wrap items-center gap-2">
        <span>GPU memory per replica · blue weights · purple KV filled · hatched KV reserved but empty · white free · grey headroom</span>
        {s.reps.length > 1 && s.reps.map((_, i) => (
          <button key={i} type="button" aria-pressed={i === s.focus} className={`fm-btn fm-btn--tool !h-7 ${i === s.focus ? "is-on" : ""}`} onClick={() => act("focus", { i })}>R{i + 1}</button>
        ))}
      </figcaption>
    </figure>
  );
}

// ── Batch grid: slots × steps ───────────────────────────────────────────────────────────────────

function cellOf(code: number, gamma: number): { f: string; t: string; ink: string; label: string; rej?: boolean } {
  if (code >= CELL.spec) {
    const a = code - CELL.spec;
    return { f: "var(--status-ok-fill)", t: `${a}/${gamma}`, ink: "var(--ink)", label: `speculative: ${a} of ${gamma} drafts accepted${a < gamma ? ", then one corrected token" : ", plus a bonus token"}`, rej: a < gamma };
  }
  switch (code) {
    case CELL.prefill: return { f: "var(--cobalt)", t: "P", ink: "var(--on-cobalt)", label: "prefill finished, first token" };
    case CELL.chunk: return { f: "var(--phase-6)", t: "p", ink: "#121212", label: "prefill chunk" };
    case CELL.decode: return { f: "var(--status-ok-fill)", t: "D", ink: "var(--ink)", label: "decode, one token" };
    case CELL.pad: return { f: "var(--surface-sunk)", t: "·", ink: "var(--ink-muted)", label: "finished, slot held (static padding)" };
    case CELL.preempted: return { f: "var(--status-over-fill)", t: "X", ink: "var(--ink)", label: "preempted, KV freed" };
    case CELL.wait: return { f: "var(--status-hot-fill)", t: "W", ink: "var(--ink)", label: "waiting this step" };
    default: return { f: "none", t: "", ink: "var(--ink)", label: "empty" };
  }
}

// A column never changes after its step is recorded, so each one renders once and then only moves.
const colKeys = new WeakMap<Col, number>();
let nextColKey = 0;
const colKey = (col: Col) => { let k = colKeys.get(col); if (k === undefined) colKeys.set(col, (k = nextColKey++)); return k; };
const CELL_W = 26, CELL_H = 16, GRID_Y0 = 18;

const GridColumn = memo(function GridColumn({ col, rows, gamma, sloTpot, h }: { col: Col; rows: number; gamma: number; sloTpot: number; h: number }) {
  return (
    <>
        {col.codes.slice(0, rows).map((code, k) => {
          const cl = cellOf(code, gamma);
          if (code === CELL.empty) return <rect key={k} y={GRID_Y0 + k * CELL_H} width={CELL_W - 2} height={CELL_H - 2} fill="none" stroke="var(--line)" strokeWidth={0.5} />;
          return (
            <g key={k}>
              <rect y={GRID_Y0 + k * CELL_H} width={CELL_W - 2} height={CELL_H - 2} fill={cl.f} stroke="var(--ink)" strokeWidth={0.5}><title>{cl.label}</title></rect>
              {cl.rej && <rect y={GRID_Y0 + k * CELL_H + CELL_H - 5} width={CELL_W - 2} height={3} fill="var(--status-over)" />}
              <text x={(CELL_W - 2) / 2} y={GRID_Y0 + k * CELL_H + 11} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-mono)" fill={cl.ink}>{cl.t}</text>
            </g>
          );
        })}
        <text x={(CELL_W - 2) / 2} y={h - 6} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill={col.dur >= sloTpot ? "var(--status-over)" : "var(--ink-muted)"}>{Math.round(col.dur)}</text>
    </>
  );
});

function BatchGrid({ r, c }: { r: Replica; c: LlmConfig }) {
  const rows = Math.max(1, Math.min(SHOW_SLOTS, c.maxBatch));
  const X0 = 40;
  const cols = r.grid;
  const h = GRID_Y0 + rows * CELL_H + 22;
  const last = cols.at(-1);
  return (
    <figure className="grid gap-1">
      <div className="overflow-x-auto" tabIndex={0}>
        <svg viewBox={`0 0 ${X0 + GRID_STEPS * CELL_W + 8} ${h}`} className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`Replica ${r.id + 1}: last ${cols.length} steps for the first ${rows} batch slots. ${last ? `Last step ${ms1(last.dur)}, ${last.prefillTok} prefill and ${last.decodeTok} decode tokens.` : ""}`}>
          <text x={0} y={12} className="sim-sub" fill="var(--ink-muted)">SLOT</text>
          <text x={X0} y={12} className="sim-sub" fill="var(--ink-muted)">← OLDER · ONE COLUMN PER FORWARD PASS · NEWER →</text>
          {Array.from({ length: rows }, (_, k) => <text key={k} x={4} y={GRID_Y0 + k * CELL_H + 12} className="sim-sub" fill="var(--ink-muted)">{k + 1}</text>)}
          {cols.map((col, j) => (
            <g key={colKey(col)} transform={`translate(${X0 + (GRID_STEPS - cols.length + j) * CELL_W} 0)`}>
              <GridColumn col={col} rows={rows} gamma={c.gamma} sloTpot={c.sloTpot} h={h} />
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="fm-cap">
        R{r.id + 1} · {c.batching === "static" ? "STATIC" : "CONTINUOUS"} · P prefill done · p chunk · D decode · {c.spec ? `a/${c.gamma} drafts accepted (red bar: a rejection, then a corrected token) · ` : ""}W waiting · X preempted · · held by a finished request · bottom row: step ms (red ≥ TPOT SLO)
      </figcaption>
    </figure>
  );
}

// ── Queue and token ticker ──────────────────────────────────────────────────────────────────────

function Queue({ s }: { s: LlmState }) {
  const q = s.queue;
  const oldest = q.length ? s.t - q[0].arr : 0;
  const show = q.slice(0, 48);
  return (
    <section aria-label="Request queue" className="fm-card grid content-start gap-2 p-3">
      <h3 className="fm-cap !text-ink" style={{ color: q.length >= 100 ? "var(--status-over)" : q.length >= 10 ? "var(--status-hot)" : undefined }}>
        QUEUE · {q.length} WAITING{q.length >= 100 ? " · OVERLOADED" : q.length >= 10 ? " · BACKING UP" : " · OK"}{q.length ? ` · OLDEST ${(oldest / 1000).toFixed(1)} s` : ""}{s.rejected ? ` · ${s.rejected} REJECTED` : ""}
      </h3>
      <div className="flex h-12 items-end gap-px overflow-hidden" aria-hidden>
        {show.map((x) => (
          <div key={x.id} title={`#${x.id} · ${x.prompt} prompt tokens`} style={{ width: 6, flex: "none", height: `${Math.min(100, 20 + (x.prompt / CTX) * 80)}%`, background: x.preempts || x.restarts ? "var(--status-hot)" : "var(--cobalt)", border: "1px solid var(--ink)" }} />
        ))}
        {q.length > show.length && <span className="font-mono text-[11px]">+{q.length - show.length}</span>}
      </div>
      <p className="text-[13px]">Bar height = prompt length. Orange = preempted or restarted, rejoining by arrival order. {s.preempts ? `${s.preempts} preemptions so far.` : ""}</p>
    </section>
  );
}

const WORDS = [" the", " cache", " grows", " with", " every", " token", ",", " so", " batch", "ing", " is", " limited", " by", " memory", ".", " Each", " step", " reads", " all", " weights", " once", " for", " many", " users", " at", " a", " time"];
const word = (id: number, i: number) => WORDS[(id * 7 + i) % WORDS.length];

function statusOf(q: Seq): [string, string] {
  if (q.fin) return ["DONE", "var(--status-ok)"];
  if (q.slot < 0) return [q.restarts || q.preempts ? "REQUEUED" : "QUEUED", "var(--status-hot)"];
  if (q.done < q.need) return ["PREFILL", "var(--cobalt)"];
  return ["STREAMING", "var(--status-ok)"];
}

function Ticker({ s, c }: { s: LlmState; c: LlmConfig }) {
  return (
    <section aria-label="Sample streams" className="fm-card grid content-start gap-2 p-3">
      <h3 className="fm-cap !text-ink">STREAMING · {s.samples.length} SAMPLE REQUESTS</h3>
      {s.samples.map((q) => {
        const [st, col] = statusOf(q);
        const chips: { w: string; kind: "first" | "target" | "draft" }[] = [];
        let i = Math.max(0, q.gen - (q.trail ?? []).reduce((a, b) => a + b.n, 0));
        for (const b of q.trail ?? []) for (let k = 0; k < b.n; k++) chips.push({ w: word(q.id, i++), kind: b.kind === 0 ? "first" : b.kind >= 2 && k < b.n - 1 ? "draft" : "target" });
        const ttft = q.first >= 0 ? q.first - q.arr : s.t - q.arr;
        return (
          <div key={q.id} className="grid gap-1">
            <p className="font-mono text-[12px]">
              #{q.id} · {q.prompt} tok in · {q.gen}/{q.out} out · <span style={{ color: col }}>{st}</span> · TTFT {q.first >= 0 ? "" : "≥ "}{n0(ttft)} ms{q.fin && q.out > 1 ? ` · TPOT ${(((q.finAt ?? s.t) - q.first) / (q.out - 1)).toFixed(1)} ms` : ""}{q.restarts ? ` · RESTARTED ×${q.restarts}` : ""}
            </p>
            <p className="min-h-[1.6em] overflow-hidden font-mono text-[12px] leading-relaxed" style={{ overflowWrap: "anywhere" }}>
              {chips.slice(-28).map((x, k) => (
                <span key={k} style={{ background: x.kind === "draft" ? "var(--status-ok-fill)" : undefined, borderBottom: x.kind === "first" ? "2px solid var(--cobalt)" : c.spec && x.kind === "target" ? "1px solid var(--ink)" : undefined }}>{x.w}</span>
              ))}
              {!chips.length && <span className="opacity-60">waiting for the first token…</span>}
            </p>
          </div>
        );
      })}
      <p className="text-[12px] opacity-80">Placeholder text, one word per token. Blue underline: first token. {c.spec ? "Green: accepted draft tokens; underlined: the target model's own token (the correction, or a bonus when all drafts pass)." : ""}</p>
    </section>
  );
}

// ── Roofline ────────────────────────────────────────────────────────────────────────────────────

function Roofline({ r, c }: { r?: Replica; c: LlmConfig }) {
  const g = GPUS[c.gpu];
  const peak = g.flops / 1e12, bw = g.bw / 1e12;
  const W = 340, H = 200, L = 44, B = 170, T = 14, R = 330;
  const lx = (ai: number) => L + ((Math.log10(Math.max(0.5, ai)) - Math.log10(0.5)) / (Math.log10(5000) - Math.log10(0.5))) * (R - L);
  const ly = (tf: number) => B - ((Math.log10(Math.max(0.5, tf)) - Math.log10(0.5)) / (Math.log10(peak * 2) - Math.log10(0.5))) * (B - T);
  const ridge = peak / bw;
  const pts = Array.from({ length: 30 }, (_, i) => { const ai = 0.5 * 10 ** ((i / 29) * 4); return `${lx(ai)},${ly(Math.min(peak, bw * ai))}`; }).join(" ");
  const dot = (p: NonNullable<Replica["dec"]>, label: string, color: string) => (
    <g>
      <circle cx={lx(p.ai)} cy={ly(p.perf)} r={5} fill={color} stroke="var(--ink)" />
      <text x={Math.min(lx(p.ai) + 8, R - 70)} y={ly(p.perf) + (label === "DECODE" ? 14 : -8)} className="sim-sub" fill="var(--ink)" fontSize={11}>{label} · {p.ai.toFixed(0)} F/B</text>
    </g>
  );
  return (
    <figure className="fm-card grid gap-1 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Roofline: ridge at ${ridge.toFixed(0)} FLOPs per byte. ${r?.dec ? `Last decode pass at ${r.dec.ai.toFixed(0)} FLOPs per byte (memory-bound).` : ""} ${r?.pre ? `Last prefill pass at ${r.pre.ai.toFixed(0)}.` : ""}`}>
        <line x1={L} y1={B} x2={R} y2={B} stroke="var(--ink)" />
        <line x1={L} y1={B} x2={L} y2={T} stroke="var(--ink)" />
        <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth={2} />
        <line x1={lx(ridge * ASSUME.mfu)} x2={R} y1={ly(peak * ASSUME.mfu)} y2={ly(peak * ASSUME.mfu)} stroke="var(--ink-muted)" strokeDasharray="4 3" />
        <text x={R} y={ly(peak * ASSUME.mfu) + 12} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-muted)">{ASSUME.mfu * 100}% MFU</text>
        <line x1={lx(ridge)} x2={lx(ridge)} y1={B} y2={ly(peak)} stroke="var(--ink-muted)" strokeDasharray="2 3" />
        <text x={lx(ridge) + 3} y={B - 4} fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-muted)">RIDGE {ridge.toFixed(0)}</text>
        <text x={L} y={H - 6} fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-muted)">FLOPs PER BYTE (LOG) →</text>
        <text x={4} y={T + 4} fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-muted)">TF/s</text>
        {r?.pre && dot(r.pre, "PREFILL", "var(--cobalt)")}
        {r?.dec && dot(r.dec, "DECODE", "var(--status-ok)")}
      </svg>
      <figcaption className="fm-cap">Roofline per GPU · left of the ridge: memory-bound · right: compute-bound</figcaption>
    </figure>
  );
}

// ── The arithmetic, with the current numbers ────────────────────────────────────────────────────

function Arithmetic({ s, c, r }: { s: LlmState; c: LlmConfig; r?: Replica }) {
  const m = MODELS[c.model], g = GPUS[c.gpu], tp = tpOf(c);
  const d = r?.dec;
  const pre = stepCost(c, 2000, 0, 2000 * 1000);
  const kvB = 2 * m.layers * m.kvHeads * m.headDim * (c.kvDtype === "fp16" ? 2 : 1);
  const a = s.alpha;
  const lines: [string, string][] = [
    ["Weights", `${(m.params / 1e9).toFixed(2)} B × ${WBYTES[c.quant]} B = ${GB(s.L.weights)} ÷ TP${tp} = ${GB(s.L.perGpuWeights)}/GPU`],
    ["KV / token", `2 × ${m.layers} layers × ${m.kvHeads} KV heads × ${m.headDim} × ${c.kvDtype === "fp16" ? 2 : 1} B = ${n0(kvB / 1024)} KiB`],
    ["KV pool", `${tp} × (${GB(g.mem)} × ${ASSUME.memUtil} − ${ASSUME.runtimeGB} GB) − weights = ${s.L.kvBytes > 0 ? GB(s.L.kvBytes) : "none"} → ${n0(s.L.blocks * ASSUME.block)} tokens · ${s.L.fits ? `${Math.floor(s.L.blocks / Math.ceil(CTX / ASSUME.block))} full 4,096-token contexts` : "DOES NOT FIT"}`],
  ];
  if (d) lines.push(["Last decode", `batch ${d.batch}: memory ${ms1(d.cost.mem)} vs compute ${ms1(d.cost.comp)} → ${d.cost.mem >= d.cost.comp ? "MEMORY-BOUND" : "COMPUTE-BOUND"}${tp > 1 ? ` + all-reduce ${ms1(d.cost.comm)} (2 × ${m.layers} layers)` : ""} + ${ASSUME.overheadMs} ms = ${ms1(d.cost.total)}`]);
  lines.push(["2k prefill", `2 × ${(m.params / 1e9).toFixed(1)} B × 2,000 ÷ (${tp} × ${g.flops / 1e12} TF × ${ASSUME.mfu}) ≈ ${ms1(pre.comp)}`]);
  if (c.spec) lines.push(["Speculative", `α ${a.toFixed(2)}, γ ${c.gamma}: E[tokens/pass] = (1 − α^${c.gamma + 1}) ÷ (1 − α) = ${expectedTokens(a, c.gamma).toFixed(2)} · measured ${s.passes ? (s.passTok / s.passes).toFixed(2) : "—"} · draft adds γ × c = ${(c.gamma * c.draftCost).toFixed(2)} passes`]);
  return (
    <section aria-label="The arithmetic" className="fm-card grid content-start gap-1 p-3">
      <h3 className="fm-cap !text-ink">THE ARITHMETIC · R{(r?.id ?? 0) + 1}</h3>
      <dl className="grid gap-1 font-mono text-[12px]">
        {lines.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2"><dt className="text-ink-muted">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>
        ))}
      </dl>
      <p className="text-[12px] opacity-80">GPU numbers are illustrative, roughly current datacenter-class. Step time = max(bytes ÷ bandwidth, FLOPs ÷ (peak × MFU)) + all-reduce + overhead.</p>
    </section>
  );
}
