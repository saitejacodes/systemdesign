Read CLAUDE.md §6. Build these.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S10. cache (sections: cache-strategies, eviction, cache-failures, invalidation)
 Model: app → cache → DB. Key popularity Zipf (skew slider), keyspace size, cache size
 (items), TTL, read:write ratio, DB latency & capacity, cache latency.
 Strategy selector: cache-aside, read-through, write-through, write-behind.
 Eviction selector: LRU, LFU, FIFO, random.
 Faults: flush entire cache (cold start), hot key (one key 50% of traffic),
 mass expiry (all keys share the same TTL), DB slowdown, cache node down.
 Mitigations (toggles): request coalescing, mutex rebuild, jittered TTL, null caching,
 local in-process cache for hot keys.
 Metrics: hit rate over time, DB QPS, DB saturation, p99 latency, stale reads
 (for write-behind/ invalidation races).
 Race demo mode: animated two-request timeline reproducing the stale-cache race with
 "update cache on write", then fixed with "delete on write".
 Challenges: keep DB below 80% capacity after a full cache flush (needs coalescing);
 survive mass expiry (needs jitter); beat 90% hit rate with a cache 5% the size of the keyspace.

S11. redis-playground (section: redis)
 An in-browser interpreter implementing a Redis-compatible SUBSET with correct semantics
 and reply formats: PING, GET, SET (EX, PX, NX, XX), DEL, EXISTS, EXPIRE, TTL, PERSIST,
 INCR, INCRBY, DECR, MGET, MSET, KEYS (with warning), SCAN, HSET, HGET, HGETALL, HDEL,
 HINCRBY, LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN, SADD, SREM, SMEMBERS, SISMEMBER,
 SCARD, ZADD, ZINCRBY, ZRANGE (WITHSCORES), ZREVRANGE, ZRANK, ZSCORE, ZREM, PFADD,
 PFCOUNT, MULTI/EXEC/DISCARD, FLUSHALL. TTL expiry driven by a simulated clock
 (with a "fast-forward time" button).
 UI: terminal-style REPL (history with ↑/↓, autocomplete command names),
 key browser panel showing type, value, TTL live.
 Exercises (auto-checked against final state or outputs): session store with TTL;
 page-view counter; leaderboard with top-10 and a user's rank; unique visitors with
 HyperLogLog; fixed-window rate limiter with INCR + EXPIRE; atomic transfer with MULTI.
 Label clearly: "A simulation of Redis behavior, not a real Redis server."
 Unit tests for every command, including edge cases (wrong type error, missing keys).

S12. message-queue (sections: partitioning-ordering, delivery-semantics, failure-handling, kafka-vs-queues)
 Mode toggle: "Log (Kafka-style)" vs "Queue (RabbitMQ/SQS-style)".
 Model: producers (rate, key distribution), topic with P partitions (log mode) or one
 queue, consumer group(s) with C consumers (processing time, failure %).
 Log mode: offsets per partition, commit after processing vs before (affects duplicates
 vs loss), add/remove consumer → rebalance pause, consumers > partitions idle,
 second consumer group reads independently, replay from offset.
 Queue mode: visibility timeout, ack, redelivery, max receive count → DLQ.
 Faults: consumer crash mid-message, slow consumer, poison message, producer burst.
 Metrics: throughput, consumer lag per partition, duplicates processed, messages lost,
 out-of-order deliveries per key, DLQ size.
 Idempotent consumer toggle (dedupe by message id) → duplicates become harmless.
 Challenges: zero lost messages under consumer crash; keep per-key order with 4
 consumers; clear lag of 10k messages in under 30s sim time; route a poison message to DLQ.

S13. outbox (section: event-driven)
 Animated sequence: service writes DB row then publishes event. Inject failure between
 the two steps → DB and event stream diverge (show the inconsistency).
 Then switch to outbox: write row + outbox row in one transaction; relay polls outbox
 and publishes; crash relay mid-publish → duplicate event → idempotent consumer dedupes.
 Metrics: inconsistencies, duplicates, publish delay.
 Challenge: run 1,000 orders with random crashes and get zero inconsistencies.

Definition of Done: CLAUDE.md §8.
