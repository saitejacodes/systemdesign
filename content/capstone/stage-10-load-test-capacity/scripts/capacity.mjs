#!/usr/bin/env node
// Capacity and cost arithmetic for stage 10: your laptop (from your own k6 numbers) and a GPU fleet serving a
// frontier-size open model. Every input is a named ASSUMPTION you can override, e.g.:
//   node scripts/capacity.mjs --laptopTokensPerS=55 --gpuHourUsd=3.10 --model=405b
// Published facts are marked FACT (model configs, hardware datasheet numbers); everything else is an assumption.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const num = (k, d) => (args[k] === undefined ? d : Number(args[k]));

// ---- Models (FACT: published configs) ---------------------------------------------------------------------
const MODELS = {
  // Qwen2.5-0.5B-Instruct config.json: 24 layers, 2 KV heads, hidden 896 / 14 heads = head dim 64.
  "0.5b": { name: "Qwen2.5-0.5B-Instruct", params: 0.494e9, layers: 24, kvHeads: 2, headDim: 64 },
  // Llama 3.1 70B: 80 layers, 8 KV heads (grouped-query attention), head dim 128.
  "70b": { name: "Llama 3.1 70B", params: 70.6e9, layers: 80, kvHeads: 8, headDim: 128 },
  // Llama 3.1 405B: 126 layers, 8 KV heads, head dim 128.
  "405b": { name: "Llama 3.1 405B", params: 405e9, layers: 126, kvHeads: 8, headDim: 128 },
};
const kvBytesPerToken = (m, bytes) => 2 * m.layers * m.kvHeads * m.headDim * bytes;

const fmt = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const GB = 1e9;
const line = (label, value, note = "") => console.log(`  ${label.padEnd(44)} ${String(value).padStart(16)}  ${note}`);

// ---- Part 1: the laptop ------------------------------------------------------------------------------------
const laptop = {
  tokensPerS: num("laptopTokensPerS", 40), // ASSUMPTION: replace with output_tokens_per_s at your knee (find-knee.sh)
  watts: num("laptopWatts", 30), // ASSUMPTION: extra power draw under load; measure with a wall meter if you can
  kwhUsd: num("kwhUsd", 0.15), // ASSUMPTION: electricity price
  priceUsd: num("laptopUsd", 1500), // ASSUMPTION: what the machine cost
  lifeHours: num("laptopLifeHours", 3 * 365 * 8), // ASSUMPTION: 3 years at 8 busy hours a day
};
const q = MODELS["0.5b"];
console.log(`\n1. LAPTOP: ${q.name}, Q4_K_M, CPU`);
line("KV cache per token (fp16)", `${fmt(kvBytesPerToken(q, 2))} B`, "2 x 24 x 2 x 64 x 2 = 12 KiB");
line("KV for the 8,192-token context per replica", `${fmt((kvBytesPerToken(q, 2) * 8192) / 2 ** 20)} MiB`, "per llama.cpp server");
line("Output tokens/s at your knee (ASSUMPTION)", fmt(laptop.tokensPerS));
const tokPerHour = laptop.tokensPerS * 3600;
const energyPerM = (((laptop.watts / 1000) * laptop.kwhUsd) / tokPerHour) * 1e6;
const hardwarePerM = (laptop.priceUsd / laptop.lifeHours / tokPerHour) * 1e6;
line("Energy cost per 1M output tokens", `$${fmt(energyPerM, 3)}`, `${laptop.watts} W x $${laptop.kwhUsd}/kWh`);
line("Hardware amortisation per 1M output tokens", `$${fmt(hardwarePerM, 2)}`, `$${laptop.priceUsd} over ${fmt(laptop.lifeHours)} h`);
line("Total per 1M output tokens", `$${fmt(energyPerM + hardwarePerM, 2)}`, "for a 0.5B model; not comparable to a 70B's quality");

// ---- Part 2: a GPU fleet for a frontier-size open model ---------------------------------------------------
const m = MODELS[args.model ?? "70b"];
if (!m) throw new Error(`--model must be one of ${Object.keys(MODELS).join(", ")}`);
const gpu = {
  memGB: num("gpuMemGB", 80), // FACT for an 80 GB datacenter GPU (H100/A100 80GB class)
  bwTBs: num("gpuBwTBs", 3.35), // FACT: H100 SXM datasheet HBM3 bandwidth
  utilization: num("gpuMemUtil", 0.9), // ASSUMPTION: vLLM's default gpu_memory_utilization
  overheadGB: num("overheadGB", 4), // ASSUMPTION: activations, CUDA graphs, runtime per GPU
  hourUsd: num("gpuHourUsd", 2.5), // ASSUMPTION: rented price per GPU-hour; check current prices
  prefillTflops: num("prefillTflops", 400), // ASSUMPTION (as in the LLM serving at scale lesson): effective FLOP/s
  efficiency: num("efficiency", 0.6), // ASSUMPTION: share of the bandwidth roofline actually achieved
};
const tp = num("tp", 2); // ASSUMPTION: tensor parallel degree (GPUs per replica)
const weightBytes = num("weightBytes", 1); // ASSUMPTION: FP8 weights (1 byte/param); 2 = fp16
const kvBytes = num("kvBytes", 2); // ASSUMPTION: fp16 KV cache; 1 = FP8 KV
const avgContext = num("avgContext", 2000); // ASSUMPTION: prompt + output tokens held per running sequence
const batch = num("batch", 64); // ASSUMPTION: sequences decoding together per replica
const peakOutTokS = num("peakOutputTokensPerS", 200_000); // ASSUMPTION: fleet demand, e.g. 500 req/s x 400 tokens
const promptPerOutput = num("promptPerOutput", 4); // ASSUMPTION: prompt tokens per output token (chat is input-heavy)
const prefixHit = num("prefixHit", 0.5); // ASSUMPTION: share of prompt tokens served from the prefix cache

console.log(`\n2. GPU FLEET: ${m.name}, ${weightBytes === 1 ? "FP8" : "fp16"} weights, ${kvBytes === 1 ? "FP8" : "fp16"} KV, TP=${tp}`);
const weightsGB = (m.params * weightBytes) / GB;
const kvTok = kvBytesPerToken(m, kvBytes);
line("Weights", `${fmt(weightsGB, 1)} GB`, `${fmt(m.params / 1e9, 1)}B params x ${weightBytes} B`);
line("KV cache per token", `${fmt(kvTok)} B`, `2 x ${m.layers} x ${m.kvHeads} x ${m.headDim} x ${kvBytes}`);
const usableGB = tp * gpu.memGB * gpu.utilization - tp * gpu.overheadGB - weightsGB;
if (usableGB <= 0) throw new Error(`weights do not fit on ${tp} GPUs: raise --tp or lower --weightBytes`);
const kvTokens = (usableGB * GB) / kvTok;
line("Memory left for KV per replica", `${fmt(usableGB, 1)} GB`, `${tp} x ${gpu.memGB} x ${gpu.utilization} - overhead - weights`);
line("KV capacity", `${fmt(kvTokens)} tokens`);
line("Max concurrent sequences (memory)", fmt(Math.floor(kvTokens / avgContext)), `at ${fmt(avgContext)} tokens each`);
if (batch * avgContext > kvTokens) console.log(`  !! batch ${batch} x ${avgContext} tokens does not fit in KV memory: lower --batch`);

// Decode is memory-bandwidth bound: each step reads every weight once (split across TP GPUs) plus every
// running sequence's KV cache.
const stepS = ((m.params * weightBytes) / tp + (batch * avgContext * kvTok) / tp) / (gpu.bwTBs * 1e12);
const tpotMs = (stepS * 1000) / gpu.efficiency;
const replicaTokS = batch / (tpotMs / 1000);
line("Decode step at roofline", `${fmt(stepS * 1000, 1)} ms`, "(weights + KV) / TP / bandwidth");
line(`TPOT at batch ${batch} (efficiency ${gpu.efficiency})`, `${fmt(tpotMs, 1)} ms`, `${fmt(1000 / tpotMs, 1)} tokens/s per user`);
line("Output tokens/s per replica", fmt(replicaTokS));

const decodeReplicas = Math.ceil(peakOutTokS / replicaTokS);
const prefillTokS = peakOutTokS * promptPerOutput * (1 - prefixHit);
const prefillGpus = Math.ceil((prefillTokS * 2 * m.params) / (gpu.prefillTflops * 1e12));
const gpus = decodeReplicas * tp + prefillGpus;
line("Peak demand (ASSUMPTION)", `${fmt(peakOutTokS)} out tok/s`);
line("Decode replicas", fmt(decodeReplicas), `${fmt(decodeReplicas * tp)} GPUs`);
line("Uncached prefill", `${fmt(prefillTokS)} tok/s`, `x 2 x params FLOPs each`);
line("Prefill GPU-equivalents", fmt(prefillGpus), `at ${gpu.prefillTflops} TFLOP/s effective`);
line("GPUs at peak, no headroom", fmt(gpus));
const headroom = num("headroom", 1.25); // ASSUMPTION: run at 80% of measured capacity at peak
line(`GPUs with headroom (x${headroom})`, fmt(Math.ceil(gpus * headroom)));
const costPerM = ((gpus * gpu.hourUsd) / (peakOutTokS * 3600)) * 1e6;
line("Cost per 1M output tokens at peak load", `$${fmt(costPerM, 2)}`, `${fmt(gpus)} GPUs x $${gpu.hourUsd}/h; idle hours cost the same`);
console.log("\nEvery ASSUMPTION above moves the answer. Change one at a time and watch which ones matter most.\n");
