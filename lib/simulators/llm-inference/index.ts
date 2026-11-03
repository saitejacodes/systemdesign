import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { GPUS, MODELS, WORKLOADS, llmModel, type LlmConfig, type LlmState } from "./model";
import { LlmView } from "./view";

const opts = <T extends Record<string, { label: string }>>(o: T) => Object.entries(o).map(([value, v]) => ({ value, label: v.label }));
const ttftTone = (v: number) => (v >= 2000 ? "over" : v >= 1000 ? "hot" : "ok");
const tpotTone = (v: number) => (v >= 80 ? "over" : v >= 50 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<LlmConfig, LlmState> = {
  model: llmModel,
  defaultConfig: {
    model: "7b", quant: "fp16", kvDtype: "fp16", gpu: "g80", gpus: 1, tp: 1,
    rate: 4, workload: "chat", sysPrompt: 0,
    batching: "continuous", maxBatch: 64, kvAlloc: "paged", onFull: "preempt", chunked: false, chunk: 512, prefixCache: false,
    spec: false, gamma: 4, draftCost: 0.05, sloTtft: 1000, sloTpot: 50, killAt: 0, spikeAt: 0, floodAt: 0,
  },
  controls: [
    { key: "model", label: "Model", type: "select", options: opts(MODELS) },
    { key: "quant", label: "Weights", type: "select", options: [{ value: "fp16", label: "fp16 (2 bytes)" }, { value: "fp8", label: "fp8 (1 byte)" }, { value: "int4", label: "int4 (0.5 byte)" }] },
    { key: "kvDtype", label: "KV cache", type: "select", options: [{ value: "fp16", label: "fp16" }, { value: "fp8", label: "fp8 (half the bytes)" }] },
    { key: "gpu", label: "GPU (illustrative)", type: "select", options: opts(GPUS), help: "Labelled assumptions, roughly current datacenter-class: memory, HBM bandwidth, dense 16-bit TFLOP/s." },
    { key: "gpus", label: "GPUs", type: "number", min: 1, max: 8, step: 1 },
    { key: "tp", label: "Tensor parallel degree", type: "number", min: 1, max: 8, step: 1, help: "GPUs per replica (rounded down to 1, 2, 4 or 8). Replicas = GPUs ÷ TP. Changing the layout redeploys and restarts running requests." },
    { key: "rate", label: "Arrivals", type: "number", min: 0.5, max: 60, step: 0.5, unit: " req/s", help: "Poisson arrivals." },
    { key: "workload", label: "Workload", type: "select", options: opts(WORKLOADS), help: "Sets the prompt and output length distributions and the draft acceptance rate α." },
    { key: "sysPrompt", label: "Shared system prompt", type: "number", min: 0, max: 2000, step: 100, unit: " tok", help: "The same prefix on every request." },
    { key: "batching", label: "Batching", type: "select", options: [{ value: "continuous", label: "Continuous (every step, Orca)" }, { value: "static", label: "Static (whole batch finishes first)" }] },
    { key: "maxBatch", label: "Max batch", type: "number", min: 1, max: 256, step: 1, help: "Most sequences one replica runs at once." },
    { key: "kvAlloc", label: "KV memory", type: "select", options: [{ value: "paged", label: "Paged, 16-token blocks (vLLM)" }, { value: "reserve", label: "Reserve 4,096 tokens per request" }] },
    { key: "onFull", label: "When KV runs out", type: "select", options: [{ value: "preempt", label: "Admit greedily, preempt newest (recompute)" }, { value: "queue", label: "Hold in queue (budget max_tokens)" }] },
    { key: "chunked", label: "Chunked prefill", type: "toggle", help: "Decodes first, then prompt chunks fill the rest of a per-step token budget (Sarathi-Serve)." },
    { key: "chunk", label: "Token budget per step", type: "number", min: 64, max: 2048, step: 64, unit: " tok" },
    { key: "prefixCache", label: "Prefix caching", type: "toggle", help: "The shared system prompt's KV is computed once per replica and shared by block reference. Needs paged KV." },
    { key: "spec", label: "Speculative decoding", type: "toggle" },
    { key: "gamma", label: "Draft length γ", type: "number", min: 1, max: 8, step: 1 },
    { key: "draftCost", label: "Draft cost c", type: "number", min: 0.01, max: 0.5, step: 0.01, help: "One draft pass as a fraction of a target pass. Smaller drafts agree less: acceptance = workload α × √(c ÷ (c + 0.01)), an illustrative curve." },
    { key: "sloTtft", label: "TTFT SLO", type: "number", min: 100, max: 10000, step: 100, unit: " ms" },
    { key: "sloTpot", label: "TPOT SLO", type: "number", min: 5, max: 200, step: 5, unit: " ms" },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Memory decides everything", body: "Each column is one replica's GPU memory: weights at the bottom, then the KV cache in use, then free blocks. The numbers under it are the arithmetic: weights per GPU, KV bytes per token, how many tokens fit." },
    { target: "canvas", title: "One row per slot, one column per step", body: "The grid shows what every batch slot did in each of the last 24 forward passes: P prefill, p a prefill chunk, D one decode token, W waiting, X preempted. Under static batching, finished slots sit as dots until the longest request ends." },
    { target: "controls", title: "Prefill is compute, decode is bandwidth", body: "The roofline below the grid plots the last prefill and decode passes. Decode sits far left of the ridge: each step rereads every weight for one token per sequence, so batching is nearly free until compute catches up. Raise the arrival rate here and watch the decode point climb; then try static batching, reserved KV and chunked prefill." },
    { target: "faults", title: "Break it", body: "Kill a replica mid-stream, triple the traffic, or flood it with 3,200-token prompts. Watch TTFT, preemptions and the stall columns in the grid." },
    { target: "metrics", title: "Two clocks and goodput", body: "Users feel time to first token and time per output token. Goodput counts only requests that met both SLOs, which is what you should maximise, not raw tokens per second." },
    { target: "challenges", title: "Prove it", body: "Fit a 70B model on two GPUs, serve 70B chat inside an SLO on eight, make speculative decoding pay, and survive a long-prompt flood." },
  ],
  View: LlmView,
  cards: [
    { key: "ttft50", label: "TTFT p50", unit: "ms", digits: 0 },
    { key: "ttft99", label: "TTFT p99", unit: "ms", digits: 0, tone: ttftTone },
    { key: "tpot50", label: "TPOT p50", unit: "ms", digits: 1 },
    { key: "tpot99", label: "TPOT p99", unit: "ms", digits: 1, tone: tpotTone },
    { key: "tokS", label: "Output tokens/s", digits: 0 },
    { key: "goodput", label: "Goodput (in SLO)", unit: "req/s", digits: 1 },
    { key: "goodPct", label: "Finished in SLO", unit: "%", digits: 0, tone: (v) => (v === 0 ? undefined : v < 80 ? "over" : v < 95 ? "hot" : "ok") },
    { key: "kvPct", label: "KV utilisation", unit: "%", digits: 0, tone: (v) => (v >= 95 ? "over" : v >= 80 ? "hot" : "ok") },
    { key: "queue", label: "Queue", digits: 0, tone: (v) => (v >= 100 ? "over" : v >= 10 ? "hot" : "ok") },
    { key: "batch", label: "Batch / replica", digits: 1 },
    { key: "preempts", label: "Preemptions", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "restarts", label: "Restarted requests", digits: 0, tone: (v) => (v > 0 ? "hot" : "ok") },
    { key: "accept", label: "Draft acceptance", unit: "%", digits: 0 },
    { key: "perPass", label: "Tokens / target pass", digits: 2 },
    { key: "speedup", label: "Spec speedup (recent)", unit: "×", digits: 2, tone: (v) => (v === 0 ? undefined : v < 1 ? "over" : v < 1.3 ? "hot" : "ok") },
    { key: "itl99", label: "Worst gap p99", unit: "ms", digits: 0 },
  ],
  charts: [
    { title: "Time to first token", unit: "ms", keys: [{ key: "ttft50", label: "p50", color: "var(--phase-1)" }, { key: "ttft99", label: "p99", color: "var(--cobalt)" }] },
    { title: "Time per output token", unit: "ms", keys: [{ key: "tpot50", label: "p50", color: "var(--phase-1)" }, { key: "tpot99", label: "p99", color: "var(--cobalt)" }, { key: "itl99", label: "worst gap p99", color: "var(--status-hot)" }] },
    { title: "Throughput", unit: "tok/s", keys: [{ key: "tokS", label: "Output tokens/s", color: "var(--cobalt)" }] },
    { title: "Pressure", keys: [{ key: "kvPct", label: "KV %", color: "var(--phase-4)" }, { key: "queue", label: "Queue", color: "var(--status-over)" }, { key: "batch", label: "Batch", color: "var(--phase-6)" }] },
  ],
  hud: (m) => [
    { k: "TTFT P99", v: `${Math.round(m.ttft99 ?? 0)} ms`, tone: quiet(ttftTone(m.ttft99 ?? 0)) },
    { k: "TPOT P99", v: `${(m.tpot99 ?? 0).toFixed(1)} ms`, tone: quiet(tpotTone(m.tpot99 ?? 0)) },
    { k: "TOK/S", v: String(Math.round(m.tokS ?? 0)) },
    { k: "KV", v: `${Math.round(m.kvPct ?? 0)}%`, tone: (m.kvPct ?? 0) >= 95 ? "over" : undefined },
  ],
};
