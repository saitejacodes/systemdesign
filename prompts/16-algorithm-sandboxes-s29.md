Read CLAUDE.md. Task: build in-browser coding labs at /simulators/code-labs and
/simulators/code-labs/[labId].
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."
(Build the engine first, then the labs in order; use the lab id as the marker.)

Engine:
- Pyodide loaded lazily in a Web Worker (never block the UI) with a loading indicator.
- Monaco editor (Python), Run (Ctrl/Cmd+Enter), Run Tests, Reset to starter code,
  Show hint (up to 3 progressive hints), Show reference solution (after 3 failed runs
  or a confirm dialog).
- Test runner: each lab defines tests in Python; show each test pass/fail with
  input, expected, actual, and stdout. Enforce 5s timeout per run (terminate worker).
- Code autosaved per lab in IndexedDB. Passing all tests records a ChallengeResult.
- Optional JavaScript/TypeScript version of each lab executed in a sandboxed Web Worker
  (language toggle).

Labs (each with explanation, starter code, ≥ 8 tests including edge cases,
complexity targets, reference solution):
1. LRU cache with O(1) get/put (hash map + doubly linked list)
2. LFU cache
3. Token bucket rate limiter (with injectable clock)
4. Sliding window counter rate limiter
5. Consistent hash ring with virtual nodes (add/remove/get_node)
6. Bloom filter (configurable m, k; measure false positive rate)
7. Trie with top-k autocomplete
8. Snowflake ID generator (injectable clock; handle sequence overflow & clock going backwards)
9. Exponential backoff with full jitter (deterministic with seeded random)
10. Circuit breaker state machine
11. Lamport clock and vector clock (compare/concurrent detection)
12. Simple quorum read/write coordinator with versioned values and read repair
13. Geohash encode/decode + neighbors (for the ride-sharing case study)
14. Merkle tree for detecting differing blocks (for file sync / anti-entropy)
15. Leaky bucket queue

Link each lab from its related lesson section.

Definition of Done: CLAUDE.md §8; reference solutions pass all tests (automated test in CI
runs reference solutions through Pyodide in Node, or through local Python if simpler: document which).
