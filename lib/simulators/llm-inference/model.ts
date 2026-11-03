import type { Rng, SimModel, TickContext } from "@/lib/sim/engine";

// Published open configs (Touvron et al. 2023, Llama 2): 7B is MHA; 70B uses GQA (64 query heads share 8 KV heads).
export const MODELS = {
  "7b": { label: "7B dense, MHA (Llama 2 7B config)", params: 6.74e9, layers: 32, hidden: 4096, heads: 32, kvHeads: 32, headDim: 128 },
  "70b": { label: "70B dense, GQA (Llama 2 70B config)", params: 68.98e9, layers: 80, hidden: 8192, heads: 64, kvHeads: 8, headDim: 128 },
} as const;
export type ModelId = keyof typeof MODELS;
export const CTX = 4096; // both configs' context window

// Illustrative, roughly current datacenter-class GPUs: labelled assumptions, not datasheet quotes.
export const GPUS = {
  g80: { label: "80 GB · 3.35 TB/s · 1,000 TFLOP/s", mem: 80e9, bw: 3.35e12, flops: 1000e12 },
  g141: { label: "141 GB · 4.8 TB/s · 1,000 TFLOP/s", mem: 141e9, bw: 4.8e12, flops: 1000e12 },
  g48: { label: "48 GB · 0.86 TB/s · 360 TFLOP/s", mem: 48e9, bw: 0.86e12, flops: 360e12 },
} as const;
export type GpuId = keyof typeof GPUS;

export const WBYTES = { fp16: 2, fp8: 1, int4: 0.5 } as const;
export type Quant = keyof typeof WBYTES;
export const KVBYTES = { fp16: 2, fp8: 1 } as const;

/** Assumptions shown in the view. */
export const ASSUME = {
  memUtil: 0.9, // vLLM's default gpu_memory_utilization
  runtimeGB: 4, // activations, CUDA graphs, allocator slack per GPU
  mfu: 0.5, // share of peak FLOP/s real kernels reach
  linkBW: 300e9, // GPU↔GPU link per direction, NVLink-class
  hopUs: 1.5, // per ring step latency
  overheadMs: 0.5, // scheduler + kernel launch per iteration
  block: 16, // vLLM's default KV block size in tokens
};

export const WORKLOADS = {
  chat: { label: "Chat (short prompt, medium answer)", prompt: 400, promptSd: 0.8, out: 200, outSd: 0.7, maxOut: 1024, alpha: 0.6 },
  rag: { label: "RAG (long prompt, short answer)", prompt: 2500, promptSd: 0.25, out: 150, outSd: 0.5, maxOut: 512, alpha: 0.75 },
  code: { label: "Code (medium prompt, long answer)", prompt: 1200, promptSd: 0.5, out: 300, outSd: 0.6, maxOut: 1024, alpha: 0.8 },
} as const;
export type Workload = keyof typeof WORKLOADS;
const LONG_PROMPT = 3200;

export interface LlmConfig {
  model: ModelId; quant: Quant; kvDtype: "fp16" | "fp8"; gpu: GpuId; gpus: number; tp: number;
  rate: number; workload: Workload; sysPrompt: number;
  batching: "static" | "continuous"; maxBatch: number; kvAlloc: "paged" | "reserve"; onFull: "preempt" | "queue";
  chunked: boolean; chunk: number; prefixCache: boolean;
  spec: boolean; gamma: number; draftCost: number;
  sloTtft: number; sloTpot: number;
  /** Challenge hooks, sim ms (0 = never): kill replica 1, triple traffic, long-prompt flood. */
  killAt: number; spikeAt: number; floodAt: number;
}

export interface Seq {
  id: number; arr: number; prompt: number; out: number; maxOut: number;
  /** Prompt tokens covered by the replica's shared prefix blocks. */
  cached: number;
  /** Tokens to prefill (prompt − cached, plus already generated tokens after a recompute) and how many are done. */
  need: number; done: number;
  kv: number; blocks: number; gen: number; first: number; last: number; slot: number; fin: boolean;
  restarts: number; preempts: number; trail?: Burst[]; finAt?: number;
}
/** Tokens a sample request received at once: kind 0 first token, 1 decode, 2 spec all accepted, 3 spec with a rejection. */
export interface Burst { t: number; n: number; kind: number }

/** Grid cell codes per slot per step. Spec cells are SPEC + accepted drafts. */
export const CELL = { empty: 0, prefill: 1, chunk: 2, decode: 3, pad: 4, preempted: 5, wait: 6, spec: 10 } as const;
export interface Col { codes: number[]; dur: number; prefillTok: number; decodeTok: number }
interface Item { s: Seq; kind: "p" | "d" | "pad" | "wait"; n: number; acc: number }
export interface Cost { mem: number; comp: number; comm: number; total: number; flops: number; bytes: number }
/** A pass placed on the roofline: FLOPs per byte, achieved TFLOP/s per GPU, and its cost breakdown. */
export interface Roof { ai: number; perf: number; tokens: number; batch: number; cost: Cost }

export interface Replica {
  id: number; alive: boolean; busy: boolean; until: number;
  run: Seq[]; free: number; total: number; prefix: number; prefixReady: boolean;
  slots: number[]; items: Item[]; preempted: number[]; cost: Cost | null; dur: number;
  grid: Col[]; dec: Roof | null; pre: Roof | null;
}

export interface Layout {
  weights: number; perGpuWeights: number; kvPerTok: number; replicas: number; idleGpus: number;
  kvBytes: number; blocks: number; fits: boolean;
}

export interface LlmState {
  key: string; L: Layout; reps: Replica[]; queue: Seq[]; nextArr: number; nextId: number; t: number;
  rateMult: number; flood: boolean; autoKill: boolean; autoSpike: boolean; autoFlood: boolean;
  samples: Seq[]; focus: number;
  arrived: number; completed: number; good: number; rejected: number; preempts: number; restarts: number; outTok: number;
  ttftH: number[]; tpotH: number[];
  drafted: number; accepted: number; passes: number; passTok: number;
  specBase: number; specActual: number; spBaseR: number; spActR: number;
  maxRun: number; alpha: number;
  /** Challenge guards. */
  maxGpus: number; quantUsed: boolean; minSys: number;
}

export const SHOW_SLOTS = 16;
export const GRID_STEPS = 24;
const MAX_QUEUE = 3000;
const TRAIL = 40;
const SAMPLES = 3;

export const kvBytesPerToken = (m: ModelId, kv: LlmConfig["kvDtype"]) => { const x = MODELS[m]; return 2 * x.layers * x.kvHeads * x.headDim * KVBYTES[kv]; };
const blocksFor = (tok: number) => Math.ceil(tok / ASSUME.block);

/** Tensor-parallel degree actually used: a power of two no larger than the GPU count (heads must split evenly). */
export const tpOf = (c: Pick<LlmConfig, "tp" | "gpus">) => 2 ** Math.floor(Math.log2(Math.max(1, Math.min(c.tp, c.gpus))));

export function layout(c: LlmConfig): Layout {
  const m = MODELS[c.model];
  const tp = tpOf(c);
  const weights = m.params * WBYTES[c.quant];
  const kvPerTok = kvBytesPerToken(c.model, c.kvDtype);
  const replicas = Math.floor(c.gpus / tp);
  const perGpuWeights = weights / tp;
  const kvBytes = tp * (GPUS[c.gpu].mem * ASSUME.memUtil - ASSUME.runtimeGB * 1e9) - weights;
  const blocks = Math.max(0, Math.floor(kvBytes / (kvPerTok * ASSUME.block)));
  // Under a full context of KV room the replica can't hold even one request: treat it as not fitting.
  return { weights, perGpuWeights, kvPerTok, replicas, idleGpus: c.gpus - replicas * tp, kvBytes, blocks, fits: blocks * ASSUME.block >= CTX };
}

/** Ring all-reduce of `bytes` over p GPUs: 2(p−1)/p of the data over the link, 2(p−1) latency hops. */
export const allReduceMs = (bytes: number, p: number) => (p > 1 ? ((2 * (p - 1)) / p * bytes / ASSUME.linkBW + 2 * (p - 1) * ASSUME.hopUs * 1e-6) * 1000 : 0);

/**
 * One forward pass on a TP group (roofline): max(bytes ÷ bandwidth, FLOPs ÷ (peak × MFU)) per GPU,
 * plus two all-reduces per layer (after attention and after the MLP) and a fixed launch overhead.
 * tokens: tokens processed; kvRead: KV tokens read by attention; attn: Σ context length over processed tokens.
 */
export function stepCost(c: Pick<LlmConfig, "model" | "quant" | "kvDtype" | "gpu" | "tp" | "gpus">, tokens: number, kvRead: number, attn: number): Cost {
  const m = MODELS[c.model], g = GPUS[c.gpu];
  const tp = tpOf(c);
  const flops = 2 * m.params * tokens + 4 * m.layers * m.hidden * attn;
  const bytes = m.params * WBYTES[c.quant] + kvRead * kvBytesPerToken(c.model, c.kvDtype);
  const mem = (bytes / tp / g.bw) * 1000;
  const comp = (flops / tp / (g.flops * ASSUME.mfu)) * 1000;
  const comm = tp > 1 ? 2 * m.layers * allReduceMs(tokens * m.hidden * 2, tp) : 0;
  return { mem, comp, comm, total: Math.max(mem, comp) + comm + ASSUME.overheadMs, flops, bytes };
}

/** Smaller drafts are cheaper but agree with the target less often (an illustrative curve, not a measurement). */
export const draftAlpha = (domain: number, c: number) => domain * Math.sqrt(c / (c + 0.01));

/** Leviathan et al. 2023: expected tokens per target pass with γ drafts and per-token acceptance α. */
export const expectedTokens = (alpha: number, gamma: number) => (alpha >= 1 ? gamma + 1 : (1 - alpha ** (gamma + 1)) / (1 - alpha));

/** Accept drafts one by one until the first rejection; the target then supplies one token (corrected, or a bonus if all passed). */
export function sampleAccepted(rng: Rng, alpha: number, gamma: number) {
  let n = 0;
  while (n < gamma && rng.chance(alpha)) n++;
  return n;
}

// Log-spaced histogram (4% buckets) over the whole run, cheap to update and to clone.
const HB = 320, HR = Math.log(1.04);
const hb = (v: number) => Math.min(HB - 1, Math.max(0, Math.ceil(Math.log(Math.max(1, v)) / HR)));
export const hObserve = (h: number[], v: number) => { h[hb(v)]++; };
export function hPct(h: number[], p: number, extra: number[] = []) {
  const n = h.reduce((a, b) => a + b, 0) + extra.length;
  if (!n) return 0;
  const g = [...h];
  for (const v of extra) g[hb(v)]++;
  let k = Math.ceil((p / 100) * n), i = 0;
  for (; i < HB; i++) { k -= g[i]; if (k <= 0) break; }
  return Math.exp(i * HR);
}

function lognormal(rng: Rng, median: number, sd: number) { return median * Math.exp(sd * rng.normal()); }

function newReplica(id: number, L: Layout): Replica {
  return { id, alive: true, busy: false, until: 0, run: [], free: L.blocks, total: L.blocks, prefix: 0, prefixReady: false, slots: [], items: [], preempted: [], cost: null, dur: 0, grid: [], dec: null, pre: null };
}

const keyOf = (c: LlmConfig) => [c.model, c.quant, c.kvDtype, c.gpu, c.gpus, c.tp].join("|");

function enqueue(s: LlmState, q: Seq) {
  // FCFS by arrival: preempted or restarted requests rejoin ahead of later arrivals.
  let i = 0;
  while (i < s.queue.length && s.queue[i].arr < q.arr) i++;
  s.queue.splice(i, 0, q);
}

function reset(q: Seq, keepGen: boolean) {
  q.done = 0; q.kv = 0; q.blocks = 0; q.slot = -1; q.cached = 0;
  if (!keepGen) { q.gen = 0; q.first = -1; }
}

function release(r: Replica, q: Seq) {
  r.free += q.blocks;
  q.blocks = 0;
  if (q.slot >= 0) r.slots[q.slot] = -1;
  r.run.splice(r.run.indexOf(q), 1);
}

/** Moves every request on a replica back to the queue, from scratch (the replica died or was redeployed). */
function evacuate(s: LlmState, r: Replica) {
  for (const q of [...r.run]) {
    release(r, q);
    if (q.fin) continue;
    q.restarts++; s.restarts++;
    reset(q, false);
    if (q.trail) q.trail.length = 0;
    enqueue(s, q);
  }
  r.busy = false; r.items = []; r.prefixReady = false; r.free = r.total; r.prefix = 0;
}

function sync(s: LlmState, c: LlmConfig, ctx?: TickContext<LlmConfig>) {
  const key = keyOf(c);
  if (key === s.key) return;
  for (const r of s.reps) evacuate(s, r);
  s.key = key;
  s.L = layout(c);
  s.reps = Array.from({ length: s.L.replicas }, (_, i) => newReplica(i, s.L));
  s.focus = Math.min(s.focus, Math.max(0, s.reps.length - 1));
  ctx?.log("info", `Redeployed: ${s.L.replicas} replica${s.L.replicas === 1 ? "" : "s"} × TP${tpOf(c)}${s.L.fits ? "" : " · model does not fit"}`);
}

function admitOk(r: Replica, q: Seq, c: LlmConfig) {
  if (c.kvAlloc === "reserve") return r.free >= blocksFor(CTX);
  const cached = r.prefixReady ? Math.min(c.sysPrompt, q.prompt) : 0;
  const need = q.prompt - cached + q.gen;
  if (c.onFull === "preempt") return r.free >= blocksFor(need) + 1;
  // Hold in queue: admit only if every running request could still grow to max_tokens (TGI-style token budget).
  const look = c.spec ? c.gamma + 1 : 1;
  let committed = 0;
  for (const x of r.run) if (!x.fin) committed += Math.max(0, blocksFor(x.kv + x.maxOut - x.gen + look) - x.blocks);
  return r.free - committed >= blocksFor(need + q.maxOut - q.gen + look);
}

function admit(r: Replica, q: Seq, c: LlmConfig) {
  const sharing = c.prefixCache && c.kvAlloc === "paged" && c.sysPrompt > 0;
  q.cached = sharing && r.prefixReady ? Math.min(c.sysPrompt, q.prompt) : 0;
  q.need = q.prompt - q.cached + q.gen;
  q.done = 0; q.kv = 0;
  q.blocks = c.kvAlloc === "reserve" ? blocksFor(CTX) : blocksFor(q.need);
  r.free -= q.blocks;
  let i = r.slots.indexOf(-1);
  if (i < 0) { i = r.slots.length; r.slots.push(q.id); } else r.slots[i] = q.id;
  q.slot = i;
  r.run.push(q);
}

/** Grows a sequence's paged KV to hold `tok` tokens; false if the pool is out of blocks. */
function grow(r: Replica, q: Seq, tok: number) {
  const extra = blocksFor(tok) - q.blocks;
  if (extra <= 0) return true;
  if (r.free < extra) return false;
  r.free -= extra; q.blocks += extra;
  return true;
}

function plan(s: LlmState, r: Replica, now: number, ctx: TickContext<LlmConfig>) {
  const c = ctx.config;
  r.busy = false; r.items = []; r.preempted = [];
  if (!r.alive || !s.L.fits) return;
  if (c.batching === "continuous" || r.run.length === 0) {
    while (r.run.length < c.maxBatch && s.queue.length && admitOk(r, s.queue[0], c)) admit(r, s.queue.shift()!, c);
  }
  if (!r.run.length) return;

  const look = c.spec ? c.gamma + 1 : 1;
  const ctxOf = (q: Seq) => q.cached + q.kv;
  const decoders = r.run.filter((q) => !q.fin && q.done >= q.need).sort((a, b) => a.arr - b.arr);
  const stalled = new Set<Seq>();
  if (c.kvAlloc === "paged") {
    for (const d of decoders) {
      if (d.slot < 0) continue; // preempted earlier in this loop
      while (!grow(r, d, d.kv + look)) {
        if (c.onFull !== "preempt") { stalled.add(d); break; }
        // vLLM recompute preemption: evict the most recently arrived running request, free its blocks, requeue it.
        const v = r.run.filter((x) => !x.fin).reduce((a, b) => (b.arr > a.arr ? b : a));
        r.preempted.push(v.slot);
        release(r, v);
        reset(v, true);
        v.preempts++; s.preempts++;
        ctx.metrics.inc("preempt");
        enqueue(s, v);
        if (v === d) break;
      }
    }
  }
  const live = (q: Seq) => r.run.includes(q);
  const dec = decoders.filter((q) => live(q) && !stalled.has(q));
  const pre = r.run.filter((q) => !q.fin && q.done < q.need).sort((a, b) => a.arr - b.arr);
  const pads = r.run.filter((q) => q.fin);
  for (const q of stalled) if (live(q)) r.items.push({ s: q, kind: "wait", n: 0, acc: 0 });
  for (const q of pads) r.items.push({ s: q, kind: "pad", n: 1, acc: 0 });

  // Without chunking, a pending prefill runs alone and every decode waits (a generation stall, Sarathi-Serve's term).
  // With chunking, decodes go first and prefill chunks fill the rest of the token budget (stall-free batching).
  const prefillOnly = !c.chunked && pre.length > 0;
  let budget = c.chunked ? Math.max(1, c.chunk - dec.length) : Infinity;
  for (const q of pre) {
    const n = Math.min(q.need - q.done, budget);
    if (n <= 0) { r.items.push({ s: q, kind: "wait", n: 0, acc: 0 }); continue; }
    r.items.push({ s: q, kind: "p", n, acc: 0 });
    budget -= n;
  }
  const decIn = prefillOnly ? [] : dec;
  if (prefillOnly) for (const q of dec) r.items.push({ s: q, kind: "wait", n: 0, acc: 0 });
  for (const q of decIn) r.items.push({ s: q, kind: "d", n: 1, acc: c.spec ? sampleAccepted(ctx.rng, s.alpha, c.gamma) : 0 });

  // Cost of the pass: decode tokens read their whole context once; a prefill chunk attends over what came before it.
  let pTok = 0, pKv = 0, pAttn = 0, dKv = 0, dAttn = 0;
  for (const it of r.items) {
    if (it.kind === "p") { const prior = it.s.cached + it.s.done; pTok += it.n; pKv += prior; pAttn += it.n * prior + (it.n * (it.n + 1)) / 2; }
    else if (it.kind === "d" || it.kind === "pad") { dKv += ctxOf(it.s); dAttn += ctxOf(it.s); }
  }
  const nDec = decIn.length + pads.length;
  const per = c.spec ? c.gamma + 1 : 1;
  const cost = stepCost(c, pTok + nDec * per, pKv + dKv, pAttn + dAttn * per);
  let dur = cost.total;
  if (c.spec && decIn.length) {
    // The draft runs γ passes over the same batch at draftCost × a plain target pass; the target verifies γ+1 positions in one.
    const base = stepCost(c, nDec, dKv, dAttn);
    const draft = c.gamma * c.draftCost * base.total;
    const verify = stepCost(c, nDec * per, dKv, dAttn * per);
    dur += draft;
    let tok = 0;
    for (const it of r.items) if (it.kind === "d") tok += it.acc + 1;
    s.specBase += (base.total * tok) / decIn.length; s.specActual += draft + verify.total;
    s.spBaseR = s.spBaseR * 0.95 + (base.total * tok) / decIn.length; s.spActR = s.spActR * 0.95 + draft + verify.total;
  }
  const roof: Roof = { ai: cost.flops / cost.bytes, perf: cost.flops / (Math.max(cost.mem, cost.comp) / 1000) / tpOf(c) / 1e12, tokens: pTok + nDec * per, batch: nDec, cost };
  if (pTok > nDec * per) r.pre = roof; else if (nDec) r.dec = roof;
  r.cost = cost; r.dur = dur; r.until = now + dur; r.busy = true;
}

function emit(s: LlmState, q: Seq, k: number, t: number, kind: number, ctx: TickContext<LlmConfig>) {
  k = Math.min(k, q.out - q.gen);
  if (k <= 0) return;
  q.gen += k; q.kv += k; s.outTok += k;
  ctx.metrics.inc("tok", k);
  if (q.first < 0) { q.first = t; ctx.metrics.observe("ttft", t - q.arr); kind = 0; }
  else ctx.metrics.observe("itl", t - q.last);
  q.last = t;
  if (q.trail) { q.trail.push({ t, n: k, kind }); if (q.trail.length > TRAIL) q.trail.shift(); }
  if (q.gen < q.out) return;
  q.fin = true; q.finAt = t;
  const ttft = q.first - q.arr;
  const tpot = q.out > 1 ? (t - q.first) / (q.out - 1) : 0;
  ctx.metrics.observe("tpot", tpot);
  hObserve(s.ttftH, ttft); hObserve(s.tpotH, tpot);
  s.completed++;
  ctx.metrics.inc("done");
  if (ttft <= ctx.config.sloTtft && tpot <= ctx.config.sloTpot) { s.good++; ctx.metrics.inc("good"); }
}

function finish(s: LlmState, r: Replica, ctx: TickContext<LlmConfig>) {
  const c = ctx.config, t = r.until;
  const codes = new Array<number>(SHOW_SLOTS).fill(CELL.empty);
  const mark = (q: Seq, v: number) => { if (q.slot >= 0 && q.slot < SHOW_SLOTS) codes[q.slot] = v; };
  for (const i of r.preempted) if (i < SHOW_SLOTS) codes[i] = CELL.preempted;
  let pT = 0, dT = 0;
  for (const it of r.items) {
    const q = it.s;
    if (!r.run.includes(q)) continue;
    if (it.kind === "p") {
      q.done += it.n; q.kv += it.n; pT += it.n;
      if (q.done >= q.need) {
        if (c.prefixCache && c.kvAlloc === "paged" && c.sysPrompt > 0 && !r.prefixReady && q.cached === 0) {
          // The first request's prefix becomes shared, ref-counted blocks for everyone after it.
          const b = blocksFor(Math.min(c.sysPrompt, q.prompt));
          if (r.free >= b) { r.free -= b; r.prefix = b; r.prefixReady = true; }
        }
        emit(s, q, 1, t, 1, ctx);
        mark(q, CELL.prefill);
      } else mark(q, CELL.chunk);
    } else if (it.kind === "d") {
      const k = c.spec ? it.acc + 1 : 1;
      if (c.spec) { s.passes++; s.passTok += Math.min(k, q.out - q.gen); s.drafted += c.gamma; s.accepted += it.acc; }
      dT += Math.min(k, q.out - q.gen);
      emit(s, q, k, t, c.spec ? (it.acc === c.gamma ? 2 : 3) : 1, ctx);
      mark(q, c.spec ? CELL.spec + it.acc : CELL.decode);
    } else mark(q, it.kind === "pad" ? CELL.pad : CELL.wait);
  }
  // Speculative tokens beyond what was accepted were only provisionally allocated: give their blocks back.
  if (c.kvAlloc === "paged") for (const q of r.run) { const keep = blocksFor(Math.max(q.kv, q.need)); if (q.blocks > keep) { r.free += q.blocks - keep; q.blocks = keep; } }
  if (c.batching === "continuous" || r.run.every((q) => q.fin)) for (const q of r.run.filter((x) => x.fin)) release(r, q);
  r.grid.push({ codes, dur: r.dur, prefillTok: pT, decodeTok: dT });
  if (r.grid.length > GRID_STEPS) r.grid.shift();
  r.busy = false; r.items = [];
}

function arrive(s: LlmState, t: number, ctx: TickContext<LlmConfig>) {
  const c = ctx.config, w = WORKLOADS[c.workload];
  const out = Math.max(2, Math.min(w.maxOut, Math.round(lognormal(ctx.rng, w.out, w.outSd))));
  const long = s.flood && ctx.rng.chance(0.5);
  const user = long ? lognormal(ctx.rng, LONG_PROMPT, 0.08) : lognormal(ctx.rng, w.prompt, w.promptSd);
  const prompt = Math.max(8, Math.min(CTX - w.maxOut, Math.round(c.sysPrompt + user)));
  const q: Seq = { id: s.nextId++, arr: t, prompt, out, maxOut: w.maxOut, cached: 0, need: prompt, done: 0, kv: 0, blocks: 0, gen: 0, first: -1, last: t, slot: -1, fin: false, restarts: 0, preempts: 0 };
  s.arrived++;
  ctx.metrics.inc("arrived");
  if (s.queue.length >= MAX_QUEUE) { s.rejected++; return; }
  const i = s.samples.findIndex((x) => x.fin && t - (x.finAt ?? 0) > 2500);
  if (s.samples.length < SAMPLES || i >= 0) { q.trail = []; if (i >= 0) s.samples[i] = q; else s.samples.push(q); }
  s.queue.push(q);
}

export const llmModel: SimModel<LlmConfig, LlmState> = {
  init(c, rng) {
    const s: LlmState = {
      key: "", L: layout(c), reps: [], queue: [], nextArr: rng.exponential(c.rate) * 1000, nextId: 1, t: 0,
      rateMult: 1, flood: false, autoKill: false, autoSpike: false, autoFlood: false, samples: [], focus: 0,
      arrived: 0, completed: 0, good: 0, rejected: 0, preempts: 0, restarts: 0, outTok: 0,
      ttftH: new Array(HB).fill(0), tpotH: new Array(HB).fill(0),
      drafted: 0, accepted: 0, passes: 0, passTok: 0, specBase: 0, specActual: 0, spBaseR: 0, spActR: 0, maxRun: 0, alpha: draftAlpha(WORKLOADS[c.workload].alpha, c.draftCost), maxGpus: c.gpus, quantUsed: false, minSys: c.sysPrompt,
    };
    sync(s, c);
    return s;
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    s.alpha = draftAlpha(WORKLOADS[c.workload].alpha, c.draftCost);
    s.maxGpus = Math.max(s.maxGpus, c.gpus);
    s.minSys = Math.min(s.minSys, c.sysPrompt);
    if (c.quant !== "fp16" || c.kvDtype !== "fp16") s.quantUsed = true;
    sync(s, c, ctx);
    if (c.killAt && !s.autoKill && ctx.t >= c.killAt) { s.autoKill = true; kill(s); ctx.log("error", "Replica 1 died mid-stream: its requests restart elsewhere"); }
    if (c.spikeAt && !s.autoSpike && ctx.t >= c.spikeAt) { s.autoSpike = true; s.rateMult = 3; ctx.log("warn", "Traffic spike: 3× arrivals"); }
    if (c.floodAt && !s.autoFlood && ctx.t >= c.floodAt) { s.autoFlood = true; s.flood = true; ctx.log("warn", "Long-prompt flood: half of new requests carry ~3,200-token prompts"); }
    const t0 = ctx.t - ctx.dt;
    for (const r of s.reps) if (!r.busy) plan(s, r, Math.max(t0, r.until), ctx);
    for (;;) {
      let r: Replica | undefined;
      for (const x of s.reps) if (x.busy && (!r || x.until < r.until)) r = x;
      const tA = s.nextArr;
      const tR = r ? r.until : Infinity;
      if (Math.min(tA, tR) > ctx.t) break;
      if (tA <= tR) {
        s.nextArr += ctx.rng.exponential(c.rate * s.rateMult) * 1000;
        arrive(s, tA, ctx);
        for (const x of s.reps) if (!x.busy) plan(s, x, tA, ctx);
      } else {
        finish(s, r!, ctx);
        plan(s, r!, tR, ctx);
        if (!r!.busy) for (const x of s.reps) if (!x.busy && x !== r) plan(s, x, tR, ctx);
      }
    }
    for (const r of s.reps) s.maxRun = Math.max(s.maxRun, r.run.length);
    return s;
  },

  actions: {
    focus(s, p) { const c = structuredClone(s); c.focus = Math.max(0, Math.min(c.reps.length - 1, (p as { i: number }).i)); return c; },
  },

  faults: [
    { id: "kill", label: "Replica 1 dies mid-stream", description: "The first replica's process crashes. Every request it was serving loses its KV cache and restarts from scratch on the others; clients see a stall and a retried stream. Clear it to bring the replica back, cold.", apply: (s) => kill(s),
      revert(s) { const r = s.reps[0]; if (r) { r.alive = true; r.until = s.t; } return s; } },
    { id: "spike", label: "Traffic spike (3×)", description: "Arrivals triple. Watch the queue, KV utilisation and preemptions.", apply: (s) => { s.rateMult = 3; return s; }, revert: (s) => { s.rateMult = 1; return s; } },
    { id: "flood", label: "Long-prompt flood", description: "Half of new requests carry ~3,200-token prompts (a 'summarise my whole history' feature). Long prefills stall decoding unless they are chunked, and fill KV memory fast.", apply: (s) => { s.flood = true; return s; }, revert: (s) => { s.flood = false; return s; } },
  ],

  metrics(s, reg, t) {
    const pc = (k: string) => reg.histogram(k)?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const ttft = pc("ttft"), tpot = pc("tpot"), itl = pc("itl");
    const alive = s.reps.filter((r) => r.alive && s.L.fits);
    let used = 0, total = 0, run = 0;
    for (const r of alive) { used += r.total - r.free; total += r.total; run += r.run.length; }
    const f = s.reps[s.focus];
    const blockB = s.L.kvPerTok * ASSUME.block;
    const fUsed = f ? f.total - f.free : 0;
    let fill = 0;
    if (f) for (const q of f.run) fill += q.cached + q.kv;
    fill = Math.min(fill * s.L.kvPerTok, fUsed * blockB);
    const done = reg.rate("done", t);
    return {
      ttft50: ttft.p50, ttft99: ttft.p99, tpot50: tpot.p50, tpot99: tpot.p99, itl99: itl.p99,
      tokS: reg.rate("tok", t), reqS: done, goodput: reg.rate("good", t), goodPct: s.completed ? (s.good / s.completed) * 100 : 0,
      queue: s.queue.length, preempts: s.preempts, preemptS: reg.rate("preempt", t), restarts: s.restarts, rejected: s.rejected,
      batch: alive.length ? run / alive.length : 0, kvPct: total ? (used / total) * 100 : 0,
      accept: s.drafted ? (s.accepted / s.drafted) * 100 : 0, perPass: s.passes ? s.passTok / s.passes : 0,
      speedup: s.spActR ? s.spBaseR / s.spActR : 0,
      wGB: s.L.weights / 1e9, kvUsedGB: (fUsed * blockB) / 1e9, kvFillGB: fill / 1e9, kvFreeGB: f ? (f.free * blockB) / 1e9 : 0,
    };
  },
};

function kill(s: LlmState) {
  const r = s.reps[0];
  if (!r || !r.alive) return s;
  evacuate(s, r);
  r.alive = false;
  return s;
}

/** Run-level percentile including requests still waiting for a first token (their wait so far is a lower bound). */
export function ttftPct(s: LlmState, p: number) {
  const waiting: number[] = [];
  for (const q of s.queue) if (q.first < 0) waiting.push(s.t - q.arr);
  for (const r of s.reps) for (const q of r.run) if (q.first < 0) waiting.push(s.t - q.arr);
  return hPct(s.ttftH, p, waiting);
}
export const tpotPct = (s: LlmState, p: number) => hPct(s.tpotH, p);
