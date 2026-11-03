import type { Challenge } from "@/lib/sim/engine";
import { INCIDENTS, solvedIds, totalScore, type IncidentId, type ObsConfig, type ObsState } from "./model";

const finished = (s: ObsState, id: IncidentId) => !!s.solved[id] || s.revealed.includes(id);

/** One scripted incident: solved, first try, inside the time limit. */
function single(cid: string, id: IncidentId, title: string, description: string, limitS: number, hint: string): Challenge<ObsConfig, ObsState> {
  return {
    id: cid,
    title, description, hint,
    setup: { incident: id },
    durationMs: 600_000,
    done: (s) => finished(s, id),
    winCondition(_h, s) {
      const r = s.solved[id];
      if (!r) {
        const wrong = s.inc?.id === id ? s.inc.wrong : 0;
        return { passed: false, value: 0, detail: s.revealed.includes(id) ? "You revealed the answer. Try again and read the evidence first." : `Not solved yet${wrong ? ` (${wrong} wrong answer${wrong > 1 ? "s" : ""})` : ""}.` };
      }
      const passed = r.wrong === 0 && r.ms <= limitS * 1000;
      return {
        passed, value: Math.round(r.ms / 1000),
        detail: passed ? `Root cause found in ${Math.round(r.ms / 1000)} s on the first try (${r.score} points).`
          : r.wrong ? `Solved, but after ${r.wrong} wrong answer${r.wrong > 1 ? "s" : ""}. The goal is to prove the cause from the evidence before you submit.`
            : `Solved in ${Math.round(r.ms / 1000)} s; the limit is ${limitS} s.`,
      };
    },
  };
}

export const challenges: Challenge<ObsConfig, ObsState>[] = [
  single("slow-checkout", "orders-db", "Find the slow checkout",
    "An incident starts 15 s in. Name the root cause and the component on the first try, within 5 minutes of the page.",
    300, "Open the slowest trace and find the span with the most self time. Then filter logs to postgres: which statements are in the slow-query log, and who sends them?"),
  single("cache-or-db", "cache-down", "Cache or database?",
    "An incident starts 15 s in. Postgres will look guilty. Name the real root cause and component on the first try, within 5 minutes.",
    300, "Is Postgres slower per query, or just getting more queries? Compare the cache hit ratio before and after the page, and read the warnings logged right before each fallback query."),
  {
    id: "all-five",
    title: "Solve all five incidents",
    description: "Start each of the five incidents from the incident panel and submit the correct cause and component for every one. Revealing an answer doesn't count. The score adds up speed and first-try accuracy.",
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => solvedIds(s).length >= 5,
    winCondition(_h, s) {
      const n = solvedIds(s).length;
      const score = totalScore(s);
      return n >= 5
        ? { passed: true, value: score, detail: `All five solved, ${score} / 500 points.` }
        : { passed: false, value: score, detail: `${n} of 5 solved (${INCIDENTS.filter((d) => !s.solved[d.id]).length} left), ${score} points so far.` };
    },
    hint: "Start from the symptom in the page, follow a bad trace to the deepest failing or slowest span, then confirm with that component's logs and its saturation gauge (pool, heap, hit ratio).",
  },
];
