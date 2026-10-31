Read CLAUDE.md §6. Build these nine simulators.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S14. cap (section: cap-pacelc)
 3–5 replica nodes of a key-value store; clients attached to nodes.
 Cut/restore any network link by clicking it. Mode: CP (majority required; minority side
 rejects) or AP (every node accepts; conflicts resolved on heal by last-write-wins or
 "keep siblings").
 Metrics: rejected requests, stale reads, conflicts on heal, lost writes (LWW).
 Challenges: show a stale read in AP mode; show unavailability in CP mode; heal a
 partition and resolve conflicts with siblings without losing data.

S15. quorum (section: quorums)
 Sliders N (1–7), R, W. Node failure toggles. Simulated reads/writes with per-node latency.
 Shows: whether R+W>N, read/write availability with current failures, latency (wait for
 Rth/Wth fastest), probability of stale read (simulated). Preset configs: (3,2,2),
 (3,1,3), (3,3,1), (5,3,3).
 Challenge: choose settings that keep strong consistency AND tolerate 1 node failure for
 both reads and writes with N=3.

S16. raft (section: consensus)
 5 nodes; randomized election timeouts; heartbeats; terms; votes; log replication with
 commit index; client writes go to leader.
 Actions: crash/restart node, partition cluster (drag nodes into groups), slow node,
 send client write.
 View: nodes with role color + label (follower/candidate/leader), term number, log
 entries (committed solid, uncommitted outlined), animated messages
 (RequestVote, AppendEntries).
 Faithfully implement Raft election and log replication rules (no membership changes,
 no snapshots, and say so in simplifies). Unit tests: at most one leader per term;
 committed entries never lost after leader crash.
 Challenges: trigger an election by crashing the leader; create a partition where the
 minority's leader can't commit; recover and observe log reconciliation.

S17. clocks (section: time-ordering)
 3 processes on a space-time diagram; user adds events (local, send, receive) by clicking.
 Show Lamport timestamps and vector clocks for every event; highlight happens-before
 chains; pick two events → shows "A→B", "B→A", or "concurrent".
 Physical clock skew slider shows how wall-clock ordering can contradict causality.
 Challenge: construct two concurrent events that Lamport ordering misleadingly orders.

S18. saga (section: distributed-transactions)
 Order flow: Order → Payment → Inventory → Shipping. Mode: orchestration (central
 orchestrator node) vs choreography (event chain). Also a 2PC mode for comparison.
 Inject failure at any step; watch compensations run in reverse (refund, release stock).
 2PC mode: crash the coordinator after prepare → participants blocked (show locks held).
 Metrics: completed, compensated, stuck, locks held time.
 Challenges: complete 100 orders with 10% random failures and zero inconsistent states;
 demonstrate the 2PC blocking problem.

S19. snowflake (section: id-generation)
 Interactive bit layout (sign | timestamp | datacenter | machine | sequence) with
 adjustable bit widths; computes lifetime years, max machines, max IDs/ms/machine.
 Generator: multiple machines generating IDs; show sortability; sequence overflow within
 1ms → wait; clock moves backwards fault → show duplicate risk and the "refuse until
 clock catches up" fix.
 Challenge: design a layout supporting 1,000 machines, 10k IDs/s each, for 50+ years.

S20. retry-storm (sections: timeouts-retries)
 N clients (100–5,000) calling a service with fixed capacity; service degrades then
 recovers on a schedule (fault).
 Client policy: no retry, immediate retry (max k), exponential backoff, backoff + full
 jitter, plus optional retry budget (≤10% extra) and client timeout.
 Metrics: offered load vs capacity (show amplification factor), success rate, time to
 recover after the service heals.
 Challenges: recover within 5s after the service heals (needs jitter + budget);
 keep amplification < 1.2×.

S21. circuit-breaker (section: circuit-breakers)
 Service A → Service B (with failure injection). Breaker config: failure threshold %,
 min requests, open duration, half-open probe count. Fallback toggle (cached response).
 View: state machine diagram with current state highlighted + live request flow.
 Metrics: requests to B, A's latency, fallback rate, B's load during recovery.
 Challenge: keep A's p99 < 100ms while B is down and avoid hammering B while it recovers.

S22. availability-calculator (section: high-availability)
 Drag components onto a mini canvas; connect in series or group in parallel (redundant
 sets); each has availability % (presets: 99, 99.9, 99.95, 99.99).
 Computes total availability and downtime per year/month/week; highlights the weakest link.
 Challenge: reach 99.99% overall using components that are individually 99.9%.

Definition of Done: CLAUDE.md §8. Raft and quorum tests are mandatory.
