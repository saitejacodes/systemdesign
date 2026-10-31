Read CLAUDE.md §7. Task: write ALL Phase 3 sections fully.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

Caching (week 7):
1. cache-layers: client/browser, CDN, reverse proxy, application (in-process), distributed
   cache, DB buffer pool; latency at each layer; what to cache.
2. cache-strategies: cache-aside, read-through, write-through, write-behind, write-around;
   sequence diagram for each; consistency and durability implications; decision table.
3. eviction: LRU, LFU, FIFO, TTL, random; how LRU is implemented (hash map + doubly linked
   list); approximate LRU in Redis (awareness).
4. invalidation: TTL vs explicit delete vs versioned keys; the delete-then-update race
   condition with a timeline diagram; why "delete on write" beats "update on write".
5. cache-failures: thundering herd/stampede (locking, request coalescing, early refresh,
   jittered TTL); cache penetration (null caching, Bloom filters); hot keys (local caching,
   key replication); cache avalanche.
6. cdn: push vs pull; cache-control/ETag headers; cache keys; purging; dynamic content at
   the edge (awareness); cost tradeoffs.
7. redis: data structures and their use cases (strings, hashes, lists, sets, sorted sets,
   streams, HyperLogLog); TTLs; persistence (RDB/AOF); replication & cluster (hash slots);
   single-threaded command execution model; atomic ops and Lua scripts.

Messaging (week 8):
8. queues-vs-pubsub: point-to-point vs fan-out; push vs pull consumers; why async
   (decoupling, buffering spikes, retries).
9. delivery-semantics: at-most-once, at-least-once, exactly-once (and why it really means
   "effectively once" via idempotency or transactions); acks and visibility timeouts.
10. partitioning-ordering: partitions, partition keys, ordering per partition only;
    consumer groups; rebalancing; consumer lag.
11. failure-handling: retries with backoff, poison messages, dead-letter queues,
    backpressure, max in-flight.
12. event-driven: events vs commands; event notification vs event-carried state transfer;
    event sourcing; CQRS; outbox pattern (with the dual-write bug explained first);
    change data capture (awareness).
13. kafka-vs-queues: Kafka log model, retention, replay, offsets; RabbitMQ exchanges &
    routing; SQS; decision table.

Simulator ids: cache, redis-playground, message-queue, outbox.

Definition of Done: CLAUDE.md §8.
