import type { Challenge, ChallengeOutcome } from "@/lib/sim/engine";
import { bestFailover, bestReconcile, type RaftConfig, type RaftState } from "./model";

export const FAILOVER_LIMIT = 1000;

const unsafe = (s: RaftState): ChallengeOutcome | null => (s.violations + s.splitBrain
  ? { passed: false, value: s.violations + s.splitBrain, detail: "A safety violation was recorded. That should be impossible in Raft; please report the seed." }
  : null);

function failover(s: RaftState): ChallengeOutcome {
  const ms = bestFailover(s);
  if (s.spurious > 0) return { passed: false, value: Number.isFinite(ms) ? ms : 0, detail: `${s.spurious} election${s.spurious > 1 ? "s" : ""} started while a healthy leader was reachable: the timeout is shorter than a heartbeat plus a round trip, so followers give up on a live leader.` };
  if (!Number.isFinite(ms)) return { passed: false, value: 0, detail: "No failover yet. Crash the current leader (its row has a Crash button) and wait for the new leader to commit." };
  return ms <= FAILOVER_LIMIT
    ? { passed: true, value: ms, detail: `A new leader committed ${Math.round(ms)} ms after the crash, with no false elections. The random timeout spread let one follower get ahead and win before the others ran.` }
    : { passed: false, value: ms, detail: `Failover took ${Math.round(ms)} ms (limit ${FAILOVER_LIMIT}). Followers wait a full election timeout before running.` };
}

export const minorityPassed = (s: RaftState) => s.minorityWrites >= 3 && s.partitionCommits >= 3 && s.minorityCommitted === 0 && !s.violations && !s.splitBrain;
export const reconcilePassed = (s: RaftState) => !!bestReconcile(s) && !s.violations && !s.splitBrain;

export const challenges: Challenge<RaftConfig, RaftState>[] = [
  {
    id: "fast-failover",
    title: "Fail over in under a second",
    description: `Crash the leader. A new leader must be elected and commit an entry within ${FAILOVER_LIMIT} ms of the crash, and no follower may start an election while a healthy leader is reachable.`,
    setup: { timeoutMin: 1500, timeoutMax: 3000, heartbeat: 50, delay: 20 },
    durationMs: 30_000,
    done: (s) => failover(s).passed,
    winCondition: (_h, s) => unsafe(s) ?? failover(s),
    hint: "Detection time is the election timeout. Lower it, but keep its minimum well above heartbeat + one round trip (about 50 + 40 ms here), or followers will depose a live leader.",
  },
  {
    id: "minority-leader",
    title: "Strand a leader in the minority",
    description: "Partition the cluster so the current leader ends up on the 2-node side. It must accept at least 3 client writes that never commit, while the 3-node side elects a new leader and commits at least 3 writes.",
    durationMs: 45_000,
    better: "higher",
    done: minorityPassed,
    winCondition(_h, s) {
      const bad = unsafe(s);
      if (bad) return bad;
      if (s.minorityCommitted) return { passed: false, value: 0, detail: `${s.minorityCommitted} minority write(s) committed. That should be impossible.` };
      return minorityPassed(s)
        ? { passed: true, value: s.minorityWrites, detail: `The stranded leader took ${s.minorityWrites} writes and committed none: 2 of 5 is never a majority. Meanwhile the majority committed ${s.partitionCommits} writes in a newer term.` }
        : { passed: false, value: s.minorityWrites, detail: s.minorityWrites ? `Minority writes ${s.minorityWrites}/3, majority commits ${s.partitionCommits}/3. Keep it running.` : "No leader has taken writes on a minority side yet. Drag the leader and one follower to side B (or use their Side buttons)." };
    },
    hint: "Move the LEADER plus one follower to side B. If you move two followers instead, the leader keeps a majority and nothing interesting happens.",
  },
  {
    id: "reconcile",
    title: "Heal and reconcile the logs",
    description: "Create a partition in which a minority leader appends entries, then heal it. Win when every node holds an identical log and commit index, and at least one conflicting entry was overwritten along the way.",
    durationMs: 60_000,
    done: reconcilePassed,
    winCondition(_h, s) {
      const bad = unsafe(s);
      if (bad) return bad;
      const r = bestReconcile(s);
      if (r) return { passed: true, value: r.ms, detail: `All 5 logs matched ${Math.round(r.ms)} ms after the heal; ${r.repaired} uncommitted entr${r.repaired > 1 ? "ies" : "y"} from the old term were overwritten. Nothing a client got OK for was lost.` };
      return s.reconciles.length
        ? { passed: false, value: 0, detail: "The logs matched after a heal, but nothing conflicted. Strand the leader in the minority so it appends entries the majority never sees." }
        : { passed: false, value: 0, detail: s.healAt !== null ? "Healed; waiting for every node (all must be up) to agree." : "No heal yet. Partition with the leader in the minority, let it take writes, then heal." };
    },
    hint: "Use the minority-leader partition, wait a few seconds for writes on both sides, then press Heal. Watch the old leader's outlined entries get replaced.",
  },
];
