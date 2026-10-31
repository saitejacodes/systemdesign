Read CLAUDE.md §7. Task: write ALL Phase 4 sections fully.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

Distributed systems (week 9):
1. cap-pacelc: CAP stated precisely; partitions are not optional; CP vs AP examples;
   why "pick 2 of 3" is misleading; PACELC (latency vs consistency when no partition).
2. consistency-models: linearizability, sequential (awareness), causal, eventual,
   read-your-writes, monotonic reads; examples of each in real products.
3. quorums: N, R, W; R + W > N; sloppy quorums & hinted handoff (awareness);
   read repair and anti-entropy.
4. consensus: why consensus is needed; Raft in detail (terms, leader election, log
   replication, commit index, safety); Paxos (awareness); etcd/ZooKeeper uses
   (config, leader election, locks).
5. time-ordering: clock skew; NTP limits; Lamport clocks; vector clocks; detecting
   concurrent updates; hybrid logical clocks & TrueTime (awareness).
6. distributed-transactions: 2PC (phases, coordinator failure blocking problem);
   Saga (orchestration vs choreography, compensating actions); when to avoid distributed
   transactions entirely.
7. id-generation: UUIDv4 vs UUIDv7, DB auto-increment, ticket servers, Snowflake
   (bit layout, clock skew handling); sortability tradeoffs.
8. distributed-locks: leases; why locks need fencing tokens (with the GC-pause example);
   Redis-based locks and their caveats (state the debate fairly); ZooKeeper/etcd locks.

Reliability (week 10):
9. high-availability: redundancy; active-active vs active-passive; multi-AZ & multi-region;
   availability math (series multiply, parallel 1 − Π(1−a)).
10. fault-tolerance: eliminate SPOFs; graceful degradation; static stability (awareness).
11. timeouts-retries: always set timeouts; timeout budgets across hops; retries:
    exponential backoff + jitter (full jitter formula); retry budgets; retry storms;
    idempotency as a prerequisite.
12. circuit-breakers: states (closed, open, half-open), thresholds; fallbacks.
13. bulkheads-load-shedding: isolating thread pools/connections; priority-based shedding;
    admission control.
14. disaster-recovery: RPO vs RTO; backup strategies; backup vs replication; DR tiers
    (backup/restore, pilot light, warm standby, active-active); practicing failover.
15. chaos-engineering: principles; steady-state hypothesis; game days (awareness).

Simulator ids: cap, quorum, raft, clocks, saga, snowflake, retry-storm,
circuit-breaker, availability-calculator.

Definition of Done: CLAUDE.md §8.
