// Break-it: prefill starves decode. Short interactive chats run steadily while a second scenario floods the same
// replicas with ~1,500-token prompts. On CPU, prefill of a long prompt occupies the replica's compute, so every
// short request's TTFT rises, and so does TPOT for streams already decoding on that replica.
// Compare the two runs:
//   k6 run -e FLOOD=0 k6/long-prompts.js   (baseline)
//   k6 run -e FLOOD=1 k6/long-prompts.js
import { chat, filler } from "./lib.js";

const FLOOD = __ENV.FLOOD === "1";
const longPrompt = filler(1500);

export const options = {
  summaryTrendStats: ["med", "p(95)", "p(99)", "max"],
  scenarios: {
    interactive: {
      executor: "constant-arrival-rate",
      rate: 30,
      timeUnit: "1m",
      duration: "2m",
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: "interactive",
    },
    ...(FLOOD
      ? { flood: { executor: "constant-arrival-rate", rate: 30, timeUnit: "1m", duration: "2m", preAllocatedVUs: 10, maxVUs: 50, exec: "flood" } }
      : {}),
  },
  thresholds: {
    "ttft{name:interactive}": ["p(95)<2000"],
  },
};

export function interactive() {
  chat("sk-lab-acme-0001", [{ role: "user", content: "Give one tip for writing clear commit messages." }], 32, { name: "interactive" });
}

export function flood() {
  chat("sk-lab-load-0001", [{ role: "user", content: `${longPrompt}\nSummarise the text above in one sentence.` }], 32, { name: "flood" });
}
