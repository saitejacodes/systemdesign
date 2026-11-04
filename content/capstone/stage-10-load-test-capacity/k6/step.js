// One step of the knee search: a constant arrival rate (an open model: new requests arrive on schedule whether or
// not earlier ones finished, like real users) for DURATION, then one JSON line with the step's numbers.
// scripts/find-knee.sh runs this at increasing RATE values and prints the table.
//   k6 run -e RATE=1 -e DURATION=60s k6/step.js
import { chat, filler } from "./lib.js";

const RATE = Number(__ENV.RATE || 1);
const DURATION = __ENV.DURATION || "60s";
const PROMPT_TOKENS = Number(__ENV.PROMPT_TOKENS || 200);
const MAX_TOKENS = Number(__ENV.MAX_TOKENS || 64);

export const options = {
  discardResponseBodies: false,
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  scenarios: {
    step: {
      executor: "constant-arrival-rate",
      rate: Math.round(RATE * 100),
      timeUnit: "100s", // lets RATE be fractional: rate 50 per 100 s = 0.5 req/s
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 200,
    },
  },
  // The SLOs from the stage 10 guide. A step "passes" when all three hold.
  thresholds: {
    ttft: ["p(95)<2000"],
    tpot: ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

const system = `You are a concise assistant. ${filler(PROMPT_TOKENS)}`;

export default function () {
  chat(
    "sk-lab-load-0001",
    [
      { role: "system", content: system },
      { role: "user", content: `Request ${__VU}-${__ITER}: summarise the above in one sentence.` },
    ],
    MAX_TOKENS,
    { name: "step" },
  );
}

export function handleSummary(data) {
  const m = (name, stat) => (data.metrics[name] && data.metrics[name].values[stat]) || 0;
  const durationS = data.state.testRunDurationMs / 1000;
  const line = {
    rate: RATE,
    requests: m("http_reqs", "count"),
    failed: +(m("http_req_failed", "rate") * 100).toFixed(1),
    dropped: m("dropped_iterations", "count"),
    ttft_p50_ms: Math.round(m("ttft", "med")),
    ttft_p95_ms: Math.round(m("ttft", "p(95)")),
    ttft_p99_ms: Math.round(m("ttft", "p(99)")),
    tpot_p50_ms: Math.round(m("tpot", "med")),
    tpot_p95_ms: Math.round(m("tpot", "p(95)")),
    output_tokens_per_s: +(m("output_tokens", "count") / durationS).toFixed(1),
  };
  return { stdout: `${JSON.stringify(line)}\n` };
}
