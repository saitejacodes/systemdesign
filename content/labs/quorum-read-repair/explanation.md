In leaderless replication every key lives on **N** replicas and there is no primary. A coordinator sends each write to the replicas and calls it a success once **W** of them acknowledge; it sends each read to the replicas and answers once **R** of them respond, returning the value with the highest version. Amazon's 2007 Dynamo paper described a common setting of (N, R, W) = (3, 2, 2), and Cassandra, Riak and ScyllaDB expose the same dial as per-request consistency levels.

The arithmetic is the whole design:

- **Failures tolerated.** Writes survive N − W dead replicas, reads N − R.
- **Overlap.** If **R + W > N**, any R replicas and any W replicas share at least one member (pigeonhole: disjoint sets would need R + W > N distinct replicas). So a read always contacts at least one replica that took the latest successful write, and "return the highest version" finds it. With (3, 1, 1) there is no such guarantee and a read can miss an acknowledged write.
- **No rollback.** A write that reaches fewer than W replicas is reported as failed, but the replicas that took it keep it. That is how a "failed" write later becomes visible.

**Read repair** cleans up as a side effect: when the R answers disagree, the coordinator writes the newest version back to the contacted replicas that returned something older. In Cassandra this repair is blocking at consistency levels above `ONE`, which is what makes two successive quorum reads monotonic. It only fixes replicas that were actually read; cold keys need anti-entropy (the Merkle tree lab).

## Your task

Implement `QuorumStore(n, w, r)` over `n` in-memory replicas, numbered `0 … n − 1`:

- The constructor raises `ValueError` (JavaScript: `RangeError`) unless `n ≥ 1`, `1 ≤ w ≤ n` and `1 ≤ r ≤ n`.
- `set_down(i, down=True)` (`setDown`) marks replica `i` unreachable or back up. A down replica neither stores writes nor answers reads, but keeps its data.
- `overlaps()` returns whether every read quorum must intersect every write quorum.
- **Storing rule** for every replica: keep an incoming `(version, value)` only if there is no stored version or the new version is strictly higher. Versions are numbers chosen by the caller (think timestamps or counters). An older write is still acknowledged; it just changes nothing.
- `write(key, value, version)` sends to every up replica and returns the number of acks. If that is below `w`, raise `QuorumError`, leaving the replicas that accepted it as they are.
- `read(key, order=None)` contacts the first `r` up replicas in `order` (default `0, 1, …, n − 1`; the order stands in for "whichever answered first"). Fewer than `r` up replicas: raise `QuorumError`. Return the newest `(version, value)` (JavaScript: `[version, value]`), or `None` / `null` if none of them has the key. Then repair every contacted replica whose answer was missing or older. Never touch replicas outside the read set.
- `replica_value(i, key)` (`replicaValue`) returns what replica `i` holds, or `None` / `null`.

The tests check overlap exhaustively for (5, 3, 3): all 10 write sets against all 120 read orders. In Java and C++, keys and values are strings, versions are `long`s, reads return a `Versioned` (Java: or `null`; C++: `std::optional`), and a bad configuration throws `IllegalArgumentException` / `std::invalid_argument`.

## Going further

Real coordinators send to all N and wait for the fastest W or R, so latency is the W-th or R-th fastest response, not the slowest. Cassandra saves bandwidth with **digest reads**: one replica returns the value, the others only a hash, and full values are fetched only on a mismatch. Dynamo's **sloppy quorums** count acknowledgements from stand-in nodes with hinted handoff, which keeps writes available during a partition but breaks the R + W > N overlap until the hints are delivered.

Overlap is not linearizability. Two concurrent writes with no ordering between them are resolved by a rule like last-write-wins, which silently drops one; Dynamo kept both as siblings using vector clocks (see the Lamport and vector clocks lab). If you need compare-and-set or uniqueness, you need a consensus protocol such as Raft, not a quorum dial.
