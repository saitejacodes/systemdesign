import { describe, expect, it } from "vitest";
import { Simulation, createRng } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { definition } from "./index";
import { expectedTokens, kvBytesPerToken, layout, llmModel, sampleAccepted, stepCost, tpotPct, ttftPct, type LlmConfig } from "./model";

const base = definition.defaultConfig;
const sim = (patch: Partial<LlmConfig> = {}, seed = 1) => new Simulation(llmModel, { ...base, ...patch }, seed);
const ran = (patch: Partial<LlmConfig>, ms = 30_000, seed = 1) => { const s = sim(patch, seed); s.runFor(ms); return s; };
const run = (id: string, patch: Partial<LlmConfig> = {}, seed = 1) => {
  const c = challenges.find((x) => x.id === id)!;
  const s = new Simulation(llmModel, { ...base, ...c.setup, ...patch }, seed);
  s.runFor(c.durationMs);
  return c.winCondition(s.metrics.history(), s.state);
};

describe("llm inference", () => {
  it("KV cache arithmetic matches the published configs", () => {
    expect(kvBytesPerToken("7b", "fp16")).toBe(524_288); // 512 KiB
    expect(kvBytesPerToken("70b", "fp16")).toBe(327_680); // 320 KiB, GQA
    expect(kvBytesPerToken("70b", "fp8")).toBe(163_840);
    const L = layout({ ...base });
    expect(L.weights / 1e9).toBeCloseTo(13.48, 1);
    expect(L.kvBytes / 1e9).toBeCloseTo(72 - 4 - 13.48, 1);
    expect(L.blocks * 16).toBeGreaterThan(100_000);
    expect(layout({ ...base, model: "70b", gpus: 2, tp: 2 }).fits).toBe(false); // 138 GB > 2 × (72 − 4)
    expect(layout({ ...base, model: "70b", gpus: 2, tp: 2, quant: "fp8" }).fits).toBe(true);
    expect(layout({ ...base, model: "70b", gpus: 8, tp: 4 }).replicas).toBe(2);
    expect(layout({ ...base, gpus: 6, tp: 3 }).replicas).toBe(3); // TP rounds down to 2
  });

  it("decode is memory-bound, prefill compute-bound, and batching decode is nearly free", () => {
    const d1 = stepCost(base, 1, 1000, 1000);
    expect(d1.mem).toBeGreaterThan(d1.comp * 100);
    expect(d1.mem).toBeCloseTo(4.2, 0);
    const p = stepCost(base, 2000, 0, 2000 * 1000);
    expect(p.comp).toBeGreaterThan(p.mem * 5);
    expect(p.comp).toBeGreaterThan(50);
    expect(p.comp).toBeLessThan(65);
    const d32 = stepCost(base, 32, 32 * 300, 32 * 300);
    expect(d32.total / d1.total).toBeLessThan(2); // 32× the tokens for under 2× the time
    expect(stepCost({ ...base, gpus: 2, tp: 2 }, 1, 0, 0).comm).toBeGreaterThan(0);
  });

  it("continuous batching beats static on goodput", () => {
    const stat = ran({ batching: "static", kvAlloc: "reserve" });
    const cont = ran({});
    expect(cont.state.good).toBeGreaterThan(stat.state.good * 3);
    expect(ttftPct(stat.state, 99)).toBeGreaterThan(3000);
    expect(ttftPct(cont.state, 99)).toBeLessThan(500);
  });

  it("paged KV fits more concurrent requests than reserving the full context", () => {
    const res = ran({ kvAlloc: "reserve", rate: 30, maxBatch: 256 }, 15_000);
    const paged = ran({ rate: 30, maxBatch: 256 }, 15_000);
    expect(res.state.maxRun).toBeLessThanOrEqual(layout(base).blocks / 256);
    expect(paged.state.maxRun).toBeGreaterThan(res.state.maxRun * 2);
  });

  it("preempts the newest request under KV pressure, or holds new ones back in queue mode", () => {
    const pre = ran({ rate: 8, floodAt: 10_000 });
    expect(pre.state.preempts).toBeGreaterThan(0);
    expect(pre.log.entries().some((e) => /flood/i.test(e.message))).toBe(true);
    const q = ran({ rate: 8, floodAt: 10_000, onFull: "queue" });
    expect(q.state.preempts).toBe(0);
    expect(q.state.completed).toBeGreaterThan(100);
  });

  it("speculative acceptance follows Leviathan et al.: E[tokens/pass] = (1 − α^(γ+1)) / (1 − α)", () => {
    const rng = createRng(7);
    for (const [a, g] of [[0.6, 4], [0.8, 3], [0.9, 8]] as const) {
      let sum = 0;
      for (let i = 0; i < 100_000; i++) sum += sampleAccepted(rng, a, g) + 1;
      expect(sum / 100_000).toBeCloseTo(expectedTokens(a, g), 1);
    }
    const s = ran({ spec: true, rate: 0.5, workload: "code" });
    // Requests that end mid-burst truncate a few passes, so measured is a hair under the expectation.
    expect(s.state.passTok / s.state.passes).toBeGreaterThan(expectedTokens(s.state.alpha, 4) * 0.93);
    expect(s.state.passTok / s.state.passes).toBeLessThan(expectedTokens(s.state.alpha, 4) * 1.02);
  });

  it("speculative decoding's speedup shrinks as the verify pass becomes compute-bound", () => {
    const c = { ...base, model: "70b", gpus: 4, tp: 4 } as const;
    const speedup = (B: number, ctx = 500, g = 4, cost = 0.05, a = 0.7) => {
      const one = stepCost(c, B, B * ctx, B * ctx).total;
      const verify = stepCost(c, B * (g + 1), B * ctx, B * ctx * (g + 1)).total;
      return (expectedTokens(a, g) * one) / (g * cost * one + verify);
    };
    expect(speedup(1)).toBeGreaterThan(2.3);
    expect(speedup(64)).toBeLessThan(speedup(1));
    expect(speedup(256)).toBeLessThan(1.1);
  });

  it("a replica dying mid-stream restarts its requests on the others", () => {
    const s = sim({ gpus: 2, rate: 8 });
    s.runFor(5_000);
    s.toggleFault("kill");
    expect(s.state.restarts).toBeGreaterThan(0);
    expect(s.state.reps[0].run.length).toBe(0);
    const done = s.state.completed;
    s.runFor(5_000);
    expect(s.state.completed).toBeGreaterThan(done + 20);
    expect(s.state.reps[0].run.length).toBe(0);
  });

  it("prefix caching computes a shared system prompt once per replica", () => {
    const p = { sysPrompt: 1500, rate: 6 } as const;
    const off = ran(p, 15_000), on = ran({ ...p, prefixCache: true }, 15_000);
    expect(on.state.reps[0].prefixReady).toBe(true);
    expect(ttftPct(on.state, 50)).toBeLessThan(ttftPct(off.state, 50) * 0.7);
  });

  it("chunked prefill removes generation stalls in the long-prompt flood", () => {
    const f = { rate: 8, floodAt: 10_000 } as const;
    expect(tpotPct(ran({ ...f, chunked: true }).state, 99)).toBeLessThan(tpotPct(ran(f).state, 99) * 0.7);
  });

  it("is deterministic for a seed", () => {
    const go = (seed: number) => { const s = ran({ rate: 6, spec: true }, 8_000, seed); return [s.state.completed, s.state.outTok, s.state.accepted].join(); };
    expect(go(3)).toBe(go(3));
    expect(go(3)).not.toBe(go(4));
  });

  it("challenge fit-70b: quantization or a fitting split passes, fp16 on two GPUs fails", () => {
    expect(run("fit-70b").passed).toBe(false);
    expect(run("fit-70b", { tp: 2 }).passed).toBe(false);
    expect(run("fit-70b", { gpus: 4, tp: 4 }).passed).toBe(false);
    expect(run("fit-70b", { tp: 2, quant: "fp8" }).passed).toBe(true);
    expect(run("fit-70b", { quant: "int4" }).passed).toBe(true);
  });

  it("challenge chat-slo: continuous + paged + prefix caching + TP4×2 + chunking passes; partial fixes fail", () => {
    const fix = { batching: "continuous", kvAlloc: "paged", tp: 4, chunked: true, prefixCache: true } as const;
    expect(run("chat-slo").passed).toBe(false);
    expect(run("chat-slo", { ...fix, tp: 8 }).passed).toBe(false);
    expect(run("chat-slo", { ...fix, prefixCache: false }).passed).toBe(false);
    expect(run("chat-slo", { ...fix, chunked: false }).passed).toBe(false);
    expect(run("chat-slo", { ...fix, quant: "fp8" }).passed).toBe(false);
    expect(run("chat-slo", fix).passed).toBe(true);
  });

  it("challenge spec-pays: a cheap draft with γ ≈ 4 passes, off or a big draft fails", () => {
    expect(run("spec-pays").passed).toBe(false);
    expect(run("spec-pays", { spec: true }).passed).toBe(false);
    expect(run("spec-pays", { spec: true, gamma: 4, draftCost: 0.05 }).passed).toBe(true);
  });

  it("challenge long-flood: chunked prefill passes; no chunking or a tiny batch fails", () => {
    expect(run("long-flood").passed).toBe(false);
    expect(run("long-flood", { maxBatch: 16 }).passed).toBe(false);
    expect(run("long-flood", { chunked: true }).passed).toBe(true);
  });
});
