import type { Challenge } from "@/lib/sim/engine";
import { EXERCISES, GROUPS, groupDone, type RedisConfig, type RedisState } from "./model";

const HINTS = {
  strings: "Each exercise names its key pattern. Open Hint on an exercise for the exact commands; TTL tells you whether the expiry stuck.",
  structures: "ZREVRANGE (or ZRANGE … REV) reads highest first. PFADD the same visitor twice: PFCOUNT should not count them twice.",
  atomic: "Type MULTI first: every command then answers QUEUED until EXEC runs them back to back. A typo before EXEC aborts the whole transaction.",
};

export const challenges: Challenge<RedisConfig, RedisState>[] = GROUPS.map(({ id, label }) => {
  const total = EXERCISES.filter((e) => e.group === id).length;
  return {
    id: `exercises-${id}`,
    title: label,
    description: `Pass both ${label.toLowerCase()} exercises by typing commands in the REPL. Each one is checked automatically after every command.`,
    setup: { group: id },
    durationMs: 3_600_000,
    better: "higher",
    done: (s) => groupDone(s, id) >= total,
    winCondition(_h, s) {
      const n = groupDone(s, id);
      return n >= total
        ? { passed: true, value: n, detail: `Both ${label.toLowerCase()} exercises pass.` }
        : { passed: false, value: n, detail: `${n} of ${total} passed. Open the next unchecked exercise.` };
    },
    hint: HINTS[id],
  };
});
