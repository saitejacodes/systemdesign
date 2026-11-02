import type { Challenge } from "@/lib/sim/engine";
import { EXERCISES, TRACKS, trackDone, type SqlConfig, type SqlState } from "./model";

const HINTS = {
  indexing: "Start every exercise with EXPLAIN ANALYZE, change one thing, then EXPLAIN again. The plan tree highlights the most expensive node.",
  modeling: "Write the query that answers the question first, then compare it with the expected shape in the goal. Column names matter for the checker.",
  transactions: "Constraints and atomic statements beat clever app code. If you broke the balances, press Reset database.",
};

export const challenges: Challenge<SqlConfig, SqlState>[] = TRACKS.map(({ id, label }) => {
  const total = EXERCISES.filter((e) => e.track === id).length;
  return {
    id: `track-${id}`,
    title: `Complete the ${label} track`,
    description: `Pass all ${total} ${label.toLowerCase()} exercises: write the SQL, run it, then press Check. The database keeps your changes between exercises.`,
    setup: { track: id },
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => trackDone(s, id) >= total,
    winCondition(_h, s) {
      const n = trackDone(s, id);
      return n >= total
        ? { passed: true, value: n, detail: `All ${total} ${label.toLowerCase()} exercises pass.` }
        : { passed: false, value: n, detail: `${n} of ${total} passed. Open the next unchecked exercise.` };
    },
    hint: HINTS[id],
  };
});
