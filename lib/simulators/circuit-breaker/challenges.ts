import type { Challenge } from "@/lib/sim/engine";
import type { CbConfig, CbState } from "./model";

const P99_LIMIT = 100;
const DETECT_LIMIT = 1200;
const worst = (xs: { t: number; v: number }[] = [], from: number, to: number) => xs.filter((x) => x.t > from && x.t <= to).reduce((m, x) => Math.max(m, x.v), 0);

export const challenges: Challenge<CbConfig, CbState>[] = [
  {
    id: "protect-b",
    title: "Fail fast, then let B heal",
    description: `A calls B 300 times a second. B hangs from t = 5 s to 15 s, then restarts cold at 20% capacity and needs 20 s to warm up; a cold B with a queue over 1 s falls over again. Keep A's p99 under ${P99_LIMIT} ms while B is down, never knock B over while it recovers, and end with traffic flowing to a warm B.`,
    setup: { rate: 300, bCapacity: 500, noisePct: 1, bFault: "hang", faultAt: 5, faultFor: 10 },
    durationMs: 45_000,
    winCondition(h, s) {
      const p99 = Math.round(worst(h.p99, 5_000, 15_000));
      if (s.breakerOff) return { passed: false, value: p99, detail: "The breaker was switched off at some point. This one is about tuning it." };
      if (p99 >= P99_LIMIT) return { passed: false, value: p99, detail: `A's p99 reached ${p99} ms while B was down: calls waited for the full timeout before anything failed. A breaker reacts no faster than the timeout.` };
      if (s.reCrashes) return { passed: false, value: p99, detail: `B fell over ${s.reCrashes} time${s.reCrashes > 1 ? "s" : ""} while cold: full traffic hit it before it could take it, and it never got to warm up.` };
      if (s.st !== "closed" || s.bUpAt >= 0) return { passed: false, value: p99, detail: "B never got back to full service: the breaker was still not closed, or B still cold, at the end." };
      return { passed: true, value: p99, detail: `p99 ${p99} ms during the outage, ${s.openCount} trips, and B warmed up without falling over. Fail-fast protected A; tripping on B's slowness protected B.` };
    },
    hint: "First make failures cheap: B's healthy p99 is about 50 ms, so the timeout can be far below 1 s. A short timeout also lets the breaker see a cold B getting slow and back off before its queue tops 1 s.",
  },
  {
    id: "no-false-trips",
    title: "Trip on outages, not on noise",
    description: `A quiet path: 20 calls a second, and a healthy B still fails 20% of them. B goes fully down (500s) from t = 15 s to 25 s. The breaker must open within ${DETECT_LIMIT / 1000} s of the outage and never open while B is healthy.`,
    setup: { rate: 20, noisePct: 20, bFault: "errors", faultAt: 15, faultFor: 10, breaker: true },
    durationMs: 30_000,
    winCondition(_h, s) {
      const from = s.faultStart, to = s.healAt + 100;
      const detect = s.opens.find((t) => t >= from);
      const noise = s.opens.filter((t) => t < from || t > to).length;
      if (noise) return { passed: false, value: noise, detail: `${noise} trip${noise > 1 ? "s" : ""} while B was healthy: with so few calls in the window, a run of ordinary errors crossed the threshold.` };
      if (detect === undefined) return { passed: false, value: 0, detail: "The breaker never opened during the outage." };
      const ms = detect - from;
      return ms <= DETECT_LIMIT
        ? { passed: true, value: ms, detail: `Opened ${(ms / 1000).toFixed(2)} s into the outage, with no trips on noise.` }
        : { passed: false, value: ms, detail: `Took ${(ms / 1000).toFixed(1)} s to open: the window held so many old calls that the outage needed a long time to outvote them.` };
    },
    better: "lower",
    hint: "At 20 calls/s, the default window of 100 calls holds 5 s of history. Too small a window lets chance runs of errors trip it, and a tiny minimum lets a fresh window trip on its first few calls.",
  },
];
