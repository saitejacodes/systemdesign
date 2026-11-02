import type { Challenge } from "@/lib/sim/engine";
import { lostUpdateFixes, scenariosSeen, writeSkewStopped, type IsoConfig, type IsoState } from "./model";

const NAMES: Record<string, string> = { atomic: "atomic UPDATE", "for-update": "SELECT … FOR UPDATE", version: "version column", isolation: "a stricter isolation level" };

export const challenges: Challenge<IsoConfig, IsoState>[] = [
  {
    id: "two-fixes",
    title: "Prevent a lost update, two ways",
    description: "Run the Lost update scenario to the end without losing a like, using two different techniques: an atomic UPDATE, SELECT … FOR UPDATE, a version column, or REPEATABLE READ / SERIALIZABLE on the naive code.",
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => lostUpdateFixes(s).length >= 2,
    winCondition(_h, s) {
      const f = lostUpdateFixes(s);
      return f.length >= 2
        ? { passed: true, value: f.length, detail: `No likes lost with ${f.map((x) => NAMES[x]).join(" and ")}. Locks, atomic writes, optimistic checks and isolation levels all close the same read-modify-write gap.` }
        : { passed: false, value: f.length, detail: f.length ? `One fix so far (${NAMES[f[0]]}). Try a different technique.` : "No fixed run yet. Pick a technique other than \"Read, then write back\", or raise T2's isolation level." };
    },
    hint: "The naive version reads 10 in the app and writes back 11. Move the +1 into SQL, lock the row when you read it, or only write if the version hasn't changed.",
  },
  {
    id: "stop-write-skew",
    title: "Keep a doctor on call",
    description: "Run the Write skew scenario so that at least one doctor is still on call at the end.",
    durationMs: 3_600_000,
    better: "higher",
    done: writeSkewStopped,
    winCondition: (_h, s) => (writeSkewStopped(s)
      ? { passed: true, value: 1, detail: "One transaction got 40001 and would retry; the rule held. Row locks alone couldn't see this conflict: the two updates touched different rows." }
      : { passed: false, value: 0, detail: "Both doctors went off call in every run so far. Neither row-lock waits nor a snapshot catch this." }),
    hint: "Each transaction changed a different row, so no lock conflict exists. Which level tracks what you read, not just what you wrote?",
  },
  {
    id: "all-anomalies",
    title: "Tour the five anomalies",
    description: "Run every preset scenario (dirty read, non-repeatable read, phantom, lost update, write skew) to the end at least once, at any isolation level.",
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => scenariosSeen(s).length >= 5,
    winCondition(_h, s) {
      const n = scenariosSeen(s).length;
      return n >= 5
        ? { passed: true, value: n, detail: "All five run. Try each again at a different level and compare the explanations." }
        : { passed: false, value: n, detail: `${n} of 5 scenarios run to the end.` };
    },
    hint: "Pick a scenario, press Run to end, then pick the next one.",
  },
];
