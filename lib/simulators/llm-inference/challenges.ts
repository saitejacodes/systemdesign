import type { Challenge } from "@/lib/sim/engine";
import { tpotPct, ttftPct, type LlmConfig, type LlmState } from "./model";

const off = { killAt: 0, spikeAt: 0, floodAt: 0, sysPrompt: 0, prefixCache: false, spec: false, kvDtype: "fp16", gpu: "g80" } as const;
const ms = (v: number) => `${Math.round(v)} ms`;

export const challenges: Challenge<LlmConfig, LlmState>[] = [
  {
    id: "fit-70b",
    title: "Fit the 70B model",
    description: "You have two 80 GB GPUs and a 70B model in fp16 (138 GB of weights). Get it serving chat at 1 request/s: at least 75% of requests finished in 30 s, 95% of those inside the SLOs (TTFT 1 s, TPOT 50 ms). No extra GPUs.",
    setup: { ...off, model: "70b", quant: "fp16", gpus: 2, tp: 1, rate: 1, workload: "chat", batching: "continuous", maxBatch: 64, kvAlloc: "paged", onFull: "preempt", chunked: false, sloTtft: 1000, sloTpot: 50 },
    durationMs: 30_000,
    better: "higher",
    winCondition(_h, s) {
      const share = s.completed ? s.good / s.completed : 0;
      const v = Math.round(share * 100);
      if (s.maxGpus > 2) return { passed: false, value: v, detail: "More than two GPUs were used. Make the model smaller or split it across the two you have." };
      if (!s.L.fits) return { passed: false, value: 0, detail: `The weights need ${(s.L.perGpuWeights / 1e9).toFixed(0)} GB per GPU and leave no room for a full context of KV cache. Note that fp16 across two GPUs still does not fit once 10% headroom and runtime memory are set aside.` };
      if (s.completed < 0.75 * s.arrived) return { passed: false, value: v, detail: `Only ${s.completed} of ${s.arrived} requests finished.` };
      return share >= 0.95
        ? { passed: true, value: v, detail: `It fits: ${(s.L.perGpuWeights / 1e9).toFixed(0)} GB of weights per GPU, ${(s.L.kvBytes / 1e9).toFixed(0)} GB of KV per replica, ${v}% of requests inside the SLOs.` }
        : { passed: false, value: v, detail: `It fits, but only ${v}% of requests met the SLOs.` };
    },
    hint: "Two levers: fewer bytes per weight (fp8 or int4 quantization) or tensor parallelism. Work out weights per GPU against 0.9 × 80 GB minus about 4 GB of runtime.",
  },
  {
    id: "chat-slo",
    title: "70B chat at 26 req/s on 8 GPUs",
    description: "Eight GPUs, a 70B model kept in fp16 (the quality team vetoed quantization), 26 chat requests a second, each starting with the same 1,000-token system prompt. Hold TTFT p99 under 1 s and TPOT p99 under 50 ms over 30 s. Requests still waiting at the end count with their wait so far.",
    setup: { ...off, model: "70b", quant: "fp16", gpus: 8, tp: 8, rate: 26, workload: "chat", sysPrompt: 1000, batching: "static", maxBatch: 256, kvAlloc: "reserve", onFull: "preempt", chunked: false, chunk: 512, sloTtft: 1000, sloTpot: 50 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const ttft = ttftPct(s, 99), tpot = tpotPct(s, 99);
      if (s.quantUsed) return { passed: false, value: Math.round(ttft), detail: "Quantization was switched on. Win in fp16 with the scheduler, the KV allocator and the TP/replica split." };
      if (s.minSys < 1000) return { passed: false, value: Math.round(ttft), detail: "The system prompt was shortened. Keep it; make it cheap instead." };
      const ok = ttft < 1000 && tpot < 50;
      return { passed: ok, value: Math.round(ttft), detail: `TTFT p99 ${ms(ttft)} (target < 1,000), TPOT p99 ${tpot.toFixed(1)} ms (target < 50) across ${s.L.replicas} replica${s.L.replicas === 1 ? "" : "s"}.${ok ? " Slots refill every step, the shared prompt is computed once per replica, and two TP4 replicas beat one TP8." : ttft >= 1000 ? " Requests are queueing: look at how slots are refilled, who recomputes the 1,000-token prefix, and how many replicas you run." : " Decode is stalling: long prefills are freezing every running stream."}` };
    },
    hint: "Four moves: continuous batching, paged KV (prefix caching needs it), prefix caching for the shared system prompt, and two TP4 replicas instead of one TP8. Chunked prefill keeps TPOT tidy.",
  },
  {
    id: "spec-pays",
    title: "Make speculative decoding pay",
    description: "Low load: a code assistant at 0.5 req/s on one GPU with a 7B model. Turn on speculative decoding and reach a measured speedup of at least 2.0× over plain decoding at the same batch. The starting draft model is big (c = 0.3) and γ = 8.",
    setup: { ...off, model: "7b", quant: "fp16", gpus: 1, tp: 1, rate: 0.5, workload: "code", batching: "continuous", maxBatch: 64, kvAlloc: "paged", onFull: "preempt", chunked: false, gamma: 8, draftCost: 0.3, sloTtft: 1000, sloTpot: 50 },
    durationMs: 30_000,
    better: "higher",
    winCondition(_h, s) {
      const sp = s.specActual ? s.specBase / s.specActual : 0;
      const v = Math.round(sp * 100) / 100;
      if (!s.passes) return { passed: false, value: 0, detail: "Speculative decoding never ran." };
      const tpp = s.passTok / s.passes;
      return sp >= 2
        ? { passed: true, value: v, detail: `${v}× faster per token: ${tpp.toFixed(2)} tokens per target pass for ${(s.alpha * 100).toFixed(0)}% acceptance. Decode was memory-bound, so verifying γ+1 tokens cost about as much as one.` }
        : { passed: false, value: v, detail: `Only ${v}× (${tpp.toFixed(2)} tokens per pass). Either the draft is too expensive or γ is past the point where extra drafts are rarely accepted.` };
    },
    hint: "Speedup ≈ E[tokens per pass] ÷ (1 + γ·c). A cheaper draft helps until its acceptance falls too far; past γ ≈ 4 the extra drafts are mostly rejected.",
  },
  {
    id: "long-flood",
    title: "Survive the long-prompt flood",
    description: "A 7B model on one GPU serves chat at 8 req/s. At t = 10 s half of new requests start arriving with ~3,200-token prompts. Keep TPOT p99 under 25 ms and TTFT p99 under 2.5 s over the 30 s run.",
    setup: { ...off, model: "7b", quant: "fp16", gpus: 1, tp: 1, rate: 8, workload: "chat", batching: "continuous", maxBatch: 64, kvAlloc: "paged", onFull: "preempt", chunked: false, chunk: 512, floodAt: 10_000, sloTtft: 2500, sloTpot: 25 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const ttft = ttftPct(s, 99), tpot = tpotPct(s, 99);
      if (s.arrived < 190) return { passed: false, value: Math.round(tpot), detail: "Traffic was turned down. Keep 8 req/s." };
      const ok = tpot < 25 && ttft < 2500;
      return { passed: ok, value: Math.round(tpot * 10) / 10, detail: `TPOT p99 ${tpot.toFixed(1)} ms (target < 25), TTFT p99 ${ms(ttft)} (target < 2,500).${ok ? " Long prompts now share each step's token budget with the decodes instead of freezing them." : tpot >= 25 ? " Each un-chunked 3,200-token prefill freezes every decoding stream for ~90 ms." : " Requests are queueing too long."}` };
    },
    hint: "Turn on chunked prefill: every step decodes first, then spends the rest of a token budget (~512) on prompt chunks. Shrinking the batch fixes TPOT but wrecks TTFT.",
  },
];
