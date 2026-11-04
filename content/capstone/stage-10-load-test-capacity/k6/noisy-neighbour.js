// Break-it: a noisy neighbour. The free-tier tenant "noisy" sends far more than its 4,000 tokens/minute while the
// gold tenant "acme" sends a modest steady load. Expected: noisy gets 429s (its own budget) and, when queues
// fill, 503s first (free tier may only use half of each queue); acme's TTFT stays close to its solo baseline.
//   k6 run k6/noisy-neighbour.js
import { check } from "k6";
import { chat } from "./lib.js";

export const options = {
  summaryTrendStats: ["med", "p(95)", "max"],
  scenarios: {
    acme: { executor: "constant-arrival-rate", rate: 20, timeUnit: "1m", duration: "2m", preAllocatedVUs: 5, maxVUs: 30, exec: "acme" },
    noisy: { executor: "constant-arrival-rate", rate: 4, timeUnit: "1s", duration: "2m", preAllocatedVUs: 20, maxVUs: 100, exec: "noisy" },
  },
  thresholds: {
    "ttft{name:acme}": ["p(95)<2000"],
    "http_req_failed{name:acme}": ["rate<0.01"],
  },
};

export function acme() {
  const r = chat("sk-lab-acme-0001", [{ role: "user", content: "What is a token bucket? One sentence." }], 48, { name: "acme" });
  check(r, { "acme served": (x) => x.status === 200 });
}

export function noisy() {
  const r = chat("sk-lab-noisy-0001", [{ role: "user", content: "Write a long story about a lighthouse keeper." }], 256, { name: "noisy" });
  check(r, { "noisy: 200, 429 or 503": (x) => [200, 429, 503].includes(x.status) });
}
