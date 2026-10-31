Read CLAUDE.md §7. Task: write ALL Phase 2 sections fully (all six files each).
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

APIs (week 3):
1. rest: resources & URIs; verbs & idempotency; status codes; pagination (offset vs
   cursor, why cursor wins at scale); filtering/sorting; versioning strategies; HATEOAS (awareness).
2. graphql: schema, queries, mutations; over/under-fetching; N+1 and DataLoader;
   caching difficulty; persisted queries; when NOT to use it.
3. grpc: protobuf, HTTP/2, unary & streaming; service-to-service use; browser limits & gRPC-web;
   comparison table REST vs GraphQL vs gRPC.
4. api-gateway: routing, auth, rate limiting, aggregation, BFF pattern; gateway as SPOF.
5. rate-limiting: why; algorithms (token bucket, leaky bucket, fixed window, sliding log,
   sliding counter) with pros/cons; distributed limiting with Redis (atomic INCR, Lua);
   where to place limiters; returning 429 + Retry-After.
6. idempotency: idempotency keys; storing results; safe retries for payments; idempotent
   consumers (preview for Phase 3).

Databases (weeks 4–5):
7. sql-vs-nosql: relational, document, key-value, wide-column, graph; choose by access
   pattern; a decision table with 8 example use cases.
8. data-modeling: normalization (1NF–3NF briefly), denormalization tradeoffs, query-first
   modeling, modeling for a NoSQL store (Cassandra-style partition key + clustering key).
9. indexing: B-tree vs LSM tree; composite index & leftmost prefix; covering index; write
   amplification; when indexes hurt; reading EXPLAIN.
10. transactions: ACID; isolation levels (read uncommitted, read committed, repeatable read,
    serializable); anomalies (dirty read, non-repeatable read, phantom, lost update,
    write skew) each with a concrete two-transaction example; MVCC overview.
11. locking: pessimistic (SELECT FOR UPDATE), optimistic (version column), deadlocks & detection.
12. replication: leader-follower, multi-leader, leaderless; sync vs async vs semi-sync;
    replication lag problems (read-your-writes, monotonic reads) and fixes; failover & split brain.
13. sharding: why and when (shard last); range, hash, directory; choosing a shard key;
    hot shards & celebrity problem; cross-shard queries/transactions; resharding strategies.
14. consistent-hashing: ring, virtual nodes, minimal movement; where it's used (Dynamo-style
    stores, caches, LBs).
15. connection-pooling: why DBs run out of connections; pool sizing intuition; PgBouncer (awareness).

Storage & search (week 6):
16. object-storage: blob vs file vs block; S3-style model; presigned URLs; multipart
    upload; storage classes & lifecycle; why files don't go in the DB; serving through CDN.
17. search: inverted index; tokenization basics; relevance (TF-IDF/BM25 concept);
    Elasticsearch architecture (shards, replicas); typeahead with tries & precomputed top-k.
18. olap-vs-oltp: row vs column storage; warehouse vs lake vs lakehouse (awareness); time-series DBs.

Simulator ids to reference: rate-limiter, sql-sandbox, isolation-lab, index-visualizer,
replication, sharding, consistent-hashing.

Embed the existing consistent-hashing simulator in the consistent-hashing and sharding
sections, and the existing rate-limiter simulator in the rate-limiting section.

Definition of Done: CLAUDE.md §8.
