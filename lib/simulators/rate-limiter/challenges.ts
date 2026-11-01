import type { Challenge } from "@/lib/sim/engine";
import type { RlConfig, RlState } from "./model";

const boundaryFound = (s: RlState) => s.lastPattern === "boundary" && s.lanes.fw.maxInWindow >= 9;

export const challenges: Challenge<RlConfig, RlState>[] = [
  {
    id: "boundary-attack",
    title: "Break the fixed window",
    description: "With a limit of 5 requests per 1 s window, find a traffic pattern that gets at least 9 requests through the fixed-window limiter inside a single 1 s span, while the sliding log still holds the line.",
    setup: { rate: 5, window: 1 },
    durationMs: 30_000,
    better: "higher",
    done: boundaryFound,
    winCondition(_h, s) {
      const fw = s.lanes.fw.maxInWindow, sl = s.lanes.sl.maxInWindow;
      return boundaryFound(s) && sl <= 5
        ? { passed: true, value: fw, detail: `Fixed window let ${fw} requests through in one second (limit 5); the sliding log never allowed more than ${sl}. Bursts either side of a boundary each fit their own window.` }
        : { passed: false, value: fw, detail: `The fixed window peaked at ${fw} requests in a 1 s span. ${s.lastPattern === "boundary" ? "" : "Random traffic can leak past the edges by luck; find the pattern an attacker would use on purpose."}` };
    },
    hint: "The fixed window only counts requests inside [0, 1 s), [1 s, 2 s) and so on. What if 5 arrive just before a boundary and 5 just after?",
  },
  {
    id: "token-burst",
    title: "Bursts of 20, average 5/s",
    description: "Under bursty traffic, configure the token bucket so a client can burst 20 requests at once but sustains no more than 5 requests/s on average.",
    setup: { pattern: "bursty" },
    durationMs: 20_000,
    better: "higher",
    winCondition(_h, s) {
      const burst = s.lanes.tb.maxIn1s;
      if (s.lastRate !== 5) return { passed: false, value: burst, detail: `The refill rate is ${s.lastRate}/s. The sustained average is the refill rate, so it must be 5/s.` };
      return burst >= 20
        ? { passed: true, value: burst, detail: `A burst of ${burst} got through in one second, and the bucket refills at 5/s. Capacity sets the burst; refill sets the average.` }
        : { passed: false, value: burst, detail: `The biggest burst allowed was ${burst}. Capacity limits how many tokens can pile up between bursts.` };
    },
    hint: "Token bucket has two knobs: capacity B (how many tokens can pile up, so the largest burst) and refill rate R (the long-run average).",
  },
];
