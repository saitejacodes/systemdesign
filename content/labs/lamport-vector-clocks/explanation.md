Machines can't agree on what time it is, so "which write happened first?" can't be answered by wall clocks. Leslie Lamport's 1978 paper "Time, Clocks, and the Ordering of Events in a Distributed System" replaced the question with one that can be answered: could event *a* have influenced event *b*? He defined **happens-before** (a → b): a comes before b in the same process, or a is the send of a message that b receives, or there is a chain of those. If neither a → b nor b → a, the events are **concurrent**.

A **Lamport clock** is one counter per process:

- before each local event or send, increment the counter, and attach it to outgoing messages;
- on receiving timestamp t, set the counter to `max(counter, t) + 1`.

That guarantees a → b implies L(a) < L(b), but **only one way**. A lower timestamp does not mean "happened before": the events may be concurrent. Breaking ties by process ID gives a total order every node computes identically; the same "a number that only goes up" idea reappears as Raft terms, Kafka leader epochs and fencing tokens.

A **vector clock** (Colin Fidge and Friedemann Mattern, independently, 1988) can detect concurrency. Each process keeps one counter *per process*:

- before each local event or send, process i increments V[i];
- on receive, take the element-wise maximum of local and received vectors, then increment V[i].

Then V ≤ W when every entry of V is ≤ the matching entry of W, and a → b **if and only if** V(a) ≤ V(b) and they differ. If neither vector is ≤ the other, the events are concurrent. Dynamo-style stores use this (as version vectors, one entry per replica) to tell "this write supersedes that one" from "these writes conflict, keep both".

The tests use the classic three-process diagram:

```text
P1:  a=send→P2 ─────────────── c
P2:        receive a ── b=send→P3
P3:  x ───────────────────────────── receive b
```

Lamport gives a=1, x=1, receive a=2, b=3, c=2, receive b=4. So c (2) is numbered before P3's receive (4), yet nothing connects them: the vectors [2,0,0] and [1,2,2] show they are concurrent.

## Your task

Implement:

- `LamportClock()` with `time` (starts at 0), `tick()` for a local event, `send()` (an event whose returned timestamp travels with the message) and `receive(t)`. Each returns the new counter.
- `VectorClock(pid, n)` for process `pid` of `n` (0-based), starting at all zeros, with `increment()` (local event), `send()`, `receive(other)` and `value()`. All four return a **copy** of the vector, so mutating a sent message never changes the clock.
- `merge(a, b)`: a **new** list of element-wise maxima; the inputs are unchanged.
- `compare(a, b)`: `"before"` (a → b), `"after"` (b → a), `"equal"` or `"concurrent"`.

`merge` and `compare` raise `ValueError` (`RangeError` in JavaScript) when the vectors have different lengths, as does `receive`. Java uses `int[]` vectors with `Clocks.merge` / `Clocks.compare` and `IllegalArgumentException`; C++ uses `std::vector<int>` and `std::invalid_argument`.

## Going further

Vector clocks grow with the number of participants. Keeping one entry per *client* explodes, so Dynamo-style stores keep one per coordinating server; Amazon's Dynamo paper truncates the oldest entry past a threshold (10 in its example), accepting occasional false conflicts. Riak moved to **dotted version vectors** to avoid false siblings when many clients write through one server.

Detecting a conflict is not resolving it: something must merge siblings, whether the application, a union (which resurrects deletes without tombstones) or a CRDT. When you need ordering close to real time, **hybrid logical clocks** (Kulkarni et al., 2014; used by CockroachDB) pair a physical timestamp with a logical counter, and Spanner's TrueTime bounds clock error with atomic clocks and GPS and waits it out.
