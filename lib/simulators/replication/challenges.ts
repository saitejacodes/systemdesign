import type { Challenge } from "@/lib/sim/engine";
import type { ReplConfig, ReplState } from "./model";

const P99_LIMIT = 200;
const worst = (xs: { t: number; v: number }[] = [], from = 0) => xs.filter((x) => x.t >= from).reduce((m, x) => Math.max(m, x.v), 0);

export const challenges: Challenge<ReplConfig, ReplState>[] = [
  {
    id: "read-your-writes",
    title: "Never miss your own write",
    description: "Async replication, reads from followers. Over 30 s, no user may read a replica that is missing their own acknowledged write. Stay async the whole run and keep at least half of all reads on followers.",
    setup: { mode: "async", readFrom: "follower", followers: 3, delay: 50, slowFollower: 1, writeRate: 20, readRate: 100, crashAt: 0 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const share = s.reads ? s.followerReads / s.reads : 0;
      if (s.nonAsyncMs > 0) return { passed: false, value: s.ownStale, detail: "Replication left async during the run. The point is to fix this at the read path, not by waiting for followers." };
      if (share < 0.5) return { passed: false, value: s.ownStale, detail: `Only ${Math.round(share * 100)}% of reads hit followers. Sending every read to the leader works but throws away the read replicas.` };
      return s.ownStale === 0
        ? { passed: true, value: 0, detail: `No user missed their own write, and ${Math.round(share * 100)}% of reads still went to followers. Only recent writers pay the trip to the leader.` }
        : { passed: false, value: s.ownStale, detail: `${s.ownStale} reads missed the reader's own write: they hit a follower that hadn't applied it yet.` };
    },
    hint: "Lag is about 50–70 ms here. Route a user's reads to the leader for a short window after their write; a sticky follower alone doesn't help, it lags too.",
  },
  {
    id: "no-lost-writes",
    title: "Crash the leader, lose nothing",
    description: `Three followers; the third sits in another region (4× the delay). 100 writes/s, and the leader crashes at t = 15 s. Finish the 30 s run with zero acknowledged writes lost on failover and write p99 under ${P99_LIMIT} ms the whole time. Keep the remote follower.`,
    setup: { followers: 3, delay: 50, slowFollower: 4, writeRate: 100, readRate: 100, failoverMs: 2000, crashAt: 15_000 },
    durationMs: 30_000,
    winCondition(h, s) {
      const p99 = Math.round(worst(h.p99, 1_000));
      if (s.slowMin < 4) return { passed: false, value: p99, detail: "The remote follower got faster. Keep it at 4× and win with the replication mode." };
      if (!s.autoCrashed || s.leader === 0) return { passed: false, value: p99, detail: "The failover didn't happen. Let the challenge play to the end." };
      if (s.lostCount) return { passed: false, value: p99, detail: `${s.lostCount} acknowledged writes were lost: the leader said OK before any follower had them.` };
      return p99 < P99_LIMIT
        ? { passed: true, value: p99, detail: `Zero lost writes and p99 ${p99} ms. One follower's ack is enough durability, and the nearest follower answers first.` }
        : { passed: false, value: p99, detail: `Zero lost writes, but p99 reached ${p99} ms: every write waited for the slowest follower's round trip.` };
    },
    hint: "Async loses what the followers hadn't received. Full sync waits for the remote replica (~400 ms round trip). Wait for just one follower.",
  },
];
