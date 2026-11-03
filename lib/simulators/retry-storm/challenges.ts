import type { Challenge } from "@/lib/sim/engine";
import { recoverMs, type RetryConfig, type RetryState } from "./model";

const RECOVER_LIMIT = 5_000;
const AMP_LIMIT = 1.2;
const MIN_RETRIES = 3;
const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Every challenge is about retrying safely, so turning retries off isn't a fix. */
function guard(s: RetryState) {
  if (s.policies.includes("none")) return "Retries were switched off. That stops the storm, but users then see every blip. Keep retrying.";
  if (s.minRetries < MIN_RETRIES) return `Max retries dropped below ${MIN_RETRIES}. Keep the per-request limit and fix how retries are spent.`;
  return "";
}

function recovery(s: RetryState) {
  if (s.healAt < 0) return { passed: false, value: 0, detail: "The fault never ended. Let the challenge run to the end." };
  const ms = recoverMs(s);
  return s.recoveredAt >= 0 && ms <= RECOVER_LIMIT
    ? { passed: true, value: ms, detail: `Back to 95% success ${fmt(ms)} after the fix. ${s.wasted} requests were processed for clients that had already given up.` }
    : { passed: false, value: ms, detail: s.recoveredAt >= 0 ? `Recovered, but only after ${fmt(ms)}.` : `Still down ${fmt(ms)} after the fix: the queue holds work for clients that timed out, and their retries keep it full. A metastable failure.` };
}

export const challenges: Challenge<RetryConfig, RetryState>[] = [
  {
    id: "recover-5s",
    title: "Recover after the rollback",
    description: `1,000 requests/s against capacity for 1,200. A bad deploy fails half of all requests from t = 5 s to t = 15 s, then is rolled back. Keep up to ${MIN_RETRIES} retries per request, and get users back to 95% success within ${RECOVER_LIMIT / 1000} s of the rollback.`,
    setup: { clients: 1000, rate: 1000, capacity: 1200, timeoutMs: 1000, queueLimit: 0, dropExpired: false, fault: "errors", faultAt: 5, faultFor: 10 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const g = guard(s);
      return g ? { passed: false, value: recoverMs(s), detail: g } : recovery(s);
    },
    hint: "Backoff and jitter only move retries later; each failed request still sends up to 3 more. Cap retries as a share of successful traffic so the total can't pass 1.1× the normal load.",
  },
  {
    id: "amplification",
    title: `Amplification under ${AMP_LIMIT}×`,
    description: `A brownout halves the service's capacity for 10 s. From the start of the brownout to the end of the run, keep attempts sent ÷ new requests under ${AMP_LIMIT}×, with up to ${MIN_RETRIES} retries per request still allowed.`,
    setup: { clients: 1000, rate: 1000, capacity: 1200, timeoutMs: 1000, fault: "brownout", faultAt: 5, faultFor: 10 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const amp = s.faultFirst ? s.faultAttempts / s.faultFirst : 1;
      const v = Math.round(amp * 100) / 100;
      const g = guard(s);
      if (g) return { passed: false, value: v, detail: g };
      return amp < AMP_LIMIT
        ? { passed: true, value: v, detail: `${v}× amplification: retries stayed a small share of traffic even with nearly every request failing. ${s.denied} retries were refused by the budget and failed straight back to the user.` }
        : { passed: false, value: v, detail: `${v}× amplification: the struggling service saw ${v} attempts for every real request, ${Math.round(s.retries)} retries in all.` };
    },
    hint: "With every attempt timing out, each request becomes 1 + 3 attempts whatever the backoff. Only a budget ties retries to successes.",
  },
  {
    id: "shed-the-storm",
    title: "Fix it from the server",
    description: `The clients are not yours: they retry immediately, up to ${MIN_RETRIES} times, with no budget. Same bad deploy from t = 5 s to 15 s. Change only the server so users are back to 95% success within ${RECOVER_LIMIT / 1000} s of the rollback.`,
    setup: { clients: 1000, rate: 1000, capacity: 1200, timeoutMs: 1000, policy: "immediate", maxRetries: MIN_RETRIES, budget: false, fault: "errors", faultAt: 5, faultFor: 10 },
    durationMs: 30_000,
    winCondition(_h, s) {
      if (s.budgetUsed || s.policies.some((p) => p !== "immediate") || s.minRetries < MIN_RETRIES) return { passed: false, value: recoverMs(s), detail: "The client settings changed. Leave the clients naive and fix it from the server." };
      return recovery(s);
    },
    hint: "The server spends its capacity on requests whose clients already gave up. Skip those, or keep the queue so short that nothing waits longer than the timeout.",
  },
];
