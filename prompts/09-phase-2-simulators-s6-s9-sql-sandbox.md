Read CLAUDE.md §6. Build these. Each follows the Simulator Standard.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S6. sql-sandbox + isolation-lab (sections: indexing, transactions, data-modeling)
 A. SQL Sandbox (PGlite, lazy-loaded with a loading state):
   - Monaco editor with SQL highlighting and autocomplete for table/column names;
     run selection or all (Ctrl/Cmd+Enter); results grid with row count & timing;
     EXPLAIN ANALYZE output rendered as an indented plan tree with cost highlights.
   - Preloaded datasets (generated deterministically on load): users (50k), posts (200k),
     follows (300k), orders (100k), order_items, products. "Reset database" button.
   - 15 guided exercises in 3 tracks, each with goal, starter query, hint, and an
     auto-checker (compare result set or plan property):
     Indexing (5): find slow query via EXPLAIN, add index, composite index order,
       covering index, show index hurting a bulk insert.
     Modeling (5): write a feed query, denormalize a counter, pagination with keyset,
       find N+1 pattern and fix with a join, design a schema for a given requirement.
     Transactions (5): BEGIN/COMMIT/ROLLBACK, SELECT FOR UPDATE, optimistic locking with a
       version column, unique constraint as a guard, idempotency-key table.
 B. Isolation Lab: Two side-by-side session panes backed by a small simulated MVCC engine
   in TypeScript (PGlite runs a single connection per database, so it can't give two
   truly concurrent sessions on the same data). The engine must reproduce Postgres
   behavior for READ COMMITTED, REPEATABLE READ and SERIALIZABLE (including serialization
   failures for write skew under SERIALIZABLE). Say this in the simplifies drawer. Unit
   test each preset scenario's expected outcome against documented Postgres behavior.
   A step sequencer runs statements alternately (T1 step, T2 step).
   Preset scenarios with expected outcomes: dirty read (explain Postgres never allows it),
   non-repeatable read, phantom, lost update, write skew (on-call doctors example).
   Isolation level selector per session. After each scenario: explanation of what happened and why.
 Challenges: complete each track; prevent lost update using two different techniques.

S7. index-visualizer (section: indexing)
 Two panes: B-tree (order 3–5) animated insert/search/delete with node splits;
 LSM tree: memtable → flush to SSTable L0 → compaction into L1/L2; reads check
 memtable, then SSTables (with optional Bloom filter skip).
 Inputs: insert sequential vs random keys, batch size, Bloom filter toggle.
 Metrics: writes per insert (write amplification), nodes/files touched per read.
 Challenges: show which structure has lower write cost for 1,000 random inserts;
 reduce read cost on the LSM with Bloom filters.

S8. replication (section: replication)
 Model: 1 leader + 2–4 followers; per-link replication delay (adjustable, ms);
 modes: async, sync, semi-sync (1 sync follower). Clients write to leader, read from
 leader or random follower (toggle).
 Faults: leader crash (failover after timeout; with async, unreplicated writes are lost:
 show them), network partition between leader and followers, follower lag spike.
 Metrics: write latency, replication lag per follower, stale reads %, lost writes on failover.
 Fix toggles: read-your-writes (route user's reads to leader for N seconds after write),
 monotonic reads (sticky follower per user).
 View: nodes with log entries filling, animated replication arrows.
 Challenges: zero stale reads for the writing user with async replication;
 zero lost writes on leader crash (requires sync or semi-sync) while keeping write p99 under a limit.

S9. sharding (section: sharding)
 Model: 4–16 shards; 10k users; request distribution uniform or Zipf (skew slider);
 strategies: range (by user id or by name), hash, directory (lookup table).
 Actions: mark "celebrity" users (receive 100× traffic); add shards (resharding: show
 data moved under each strategy); split a hot shard (directory strategy).
 Metrics: load per shard (heatmap), max/avg load ratio, % data moved on reshard,
 cross-shard query count for a "friends' posts" query.
 Challenges: keep max/avg load < 1.5 with Zipf skew 1.1; handle a celebrity without
 overloading a shard (key splitting / dedicated shard).

Definition of Done: CLAUDE.md §8, PGlite lazy-loaded only on its pages, all exercise auto-checkers unit tested.
