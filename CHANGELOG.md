# Changelog

## Prompt 01 · Scaffold & app shell
- Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui (restyled), every §2 dependency installed.
- Field Manual tokens for Paper and Blueprint, fonts (Archivo, Instrument Serif italic, IBM Plex Mono) via next/font, theme toggle Paper / Blueprint / System.
- Brand components: FigureCaption, NumberedCallout, PartsList, SpecLabel, HudBar, PhasePath, DepthStamp, StatusLabel (Vitest render tests).
- App shell: collapsible sidebar (drawer under 1024px), top bar with breadcrumb, ⌘K palette, right panel (Notes / AI Tutor, resizable), HUD bar.
- Shortcuts: ⌘/Ctrl+K search, [ sidebar, ] right panel, ? help.
- Landing page rebuilt from the approved design; every §3 route exists.
- Verify: `pnpm dev`, open / and /today; `pnpm test`; `pnpm test:e2e` (every route × both themes × 1440/375).

## Prompt 02 · Content system, search, glossary
- Zod schemas + loaders for sections, glossary, resources, plan and case studies; malformed files fail the build with file + field.
- MDX lesson renderer with DepthStamp, Figure, Callout, TradeoffBox, NotWhenBox, Misconception, InterviewAngle, Mermaid Diagram, Term tooltips, Simulator card, code blocks with copy.
- Section page: phase/week badge, topics with depth stamps, sticky table of contents, prev/next, HUD with section and reading time. Sidebar tree reads real content.
- ⌘K palette and /search with grouped, keyboard-navigable results; /glossary with A–Z bar and filter.
- First full section: §1.1 Client–server and where state lives (lesson, 10-question quiz, 15 flashcards, 5 checkpoints, 3 resources, 11 glossary terms).
- Verify: open /phase/1/client-server, press ⌘K and type "sticky", open /glossary. `pnpm test` includes the malformed-quiz test.

## Prompt 03 · Learning engine
- Dexie database (versioned schema) behind a StorageAdapter, with live hooks.
- Checkpoints persist, show "n/m done", and mark the section complete (all checkpoints + best quiz ≥ 80%).
- QuizPlayer: one question at a time, single/multi/scenario, explanations, per-topic results, retry wrong only / retry all, shuffled options.
- SM-2 flashcards: browse deck in lessons with "add all to review"; /flashcards daily queue with new/learning/review counts, phase filter, Space/1–4 keys and a daily new-card limit.
- Notes in the right panel (Markdown, autosave 500 ms), listed on /dashboard and included in search.
- Progress (40/40/20, or 50/50 without a simulator; completed sections keep their status when a simulator arrives) and weak spots, shown in the sidebar per phase and per section.
- Verify: tick a checkpoint and reload; take the quiz; add cards and review them at /flashcards; press ] and write a note. Unit tests: sm2, progress, weakspots.

## Prompt 04 · Plan, Today, Dashboard, backup
- content/plan.json: the 16-week schedule with section ids for every phase (unwritten ones show as "Coming soon"), simulators, case studies, a deliverable and hours per week.
- /plan: timeline of 16 expandable week cards in phase colours; the current week is open and outlined, with progress, checkmarked items and the deliverable.
- /today: flashcards due, next lesson, next simulator challenge, top weak spot and this week's deliverable, plus a catch-up banner when earlier lessons are unfinished. The HUD shows due cards, minutes today and streak.
- Study tracking: one active minute is counted when the tab is visible and there was input in the last 60 s, on lesson, simulator, flashcard, studio, interview, case-study and reference pages. Streak = consecutive days with at least 10 minutes.
- /dashboard: overall/week/streak/study time stats, per-phase bars, Recharts graphs (quiz accuracy, cards per day, minutes per day over 30 days), weak spots, interview attempts, notes.
- Settings: plan start date (defaults to the first visit), hours per week, new cards per day; export all data as JSON (no API key), import with a count preview and merge/replace, and reset with typed confirmation.
- Verify: open /plan and /today; set a start date 3 weeks back in /settings and see the catch-up banner; export and re-import. Tests: lib/learning/plan.test.ts (current week, streaks, backup round-trip) and tests/e2e/plan.spec.ts.

## Prompt 05 · Simulator framework
- Engine in lib/sim/engine: seeded RNG (mulberry32 with uniform/int/normal/exponential/poisson/pick), SimClock (10 ms ticks, 0.25×–4×, pause/step/reset, capped catch-up), EventQueue (binary heap, FIFO ties), metrics (counters, gauges, sliding-reservoir histograms with p50/p95/p99, per-second rates, 250 ms time series), event log ring buffer, the SimModel/Challenge/FaultDef interfaces and a framework-free Simulation runner.
- SimulatorShell: spec-label header with depth stamp, "What this models" drawer, guided tour, lesson link; auto-generated controls (slider/select/toggle); drafting-grid canvas with crosshairs; metric cards + Recharts series; filterable event log with auto-scroll; transport (play/pause/step/reset, speed, seed, reduced animation); Break it menu with removable fault chips; challenges with pass/fail detail saved as ChallengeResult; HUD with sim time, QPS and p99. Compact mode for lessons with "Open full screen".
- Canvas helpers (components/sim/draw.tsx): IsoBlock, Leader, Dot, Wire.
- Registry (lib/simulators/registry.ts) with code-split loaders; SIM_CHALLENGES now derives from it. /simulators grid with phase filter and challenge counts; /simulators/[id] renders the shell; `<Simulator id>` in MDX embeds registered simulators inline.
- Demo: single-server-queue (M/M/1) with a slow-server fault and a "p99 < 200 ms at λ = 80/s within a μ budget" challenge.
- Fixed: breadcrumbs linked to /phase and /interview, which have no page (prefetch 404s).
- Verify: open /simulators/single-server-queue, follow the tour, press Play, break it, then set μ = 150 and start the challenge at 4×. Tests: lib/sim/engine/engine.test.ts, single-server-queue/model.test.ts (M/M/1 mean latency within 15% of 1/(μ−λ)), registry.test.ts, tests/e2e/simulator.spec.ts.

## Prompt 06 · Phase 1 content
- All 12 Phase 1 sections written: client–server, monolith vs microservices, scaling, estimation, latency and throughput, DNS, TCP/UDP, HTTP, TLS, load balancers, reverse proxies, realtime. Each has a 2,000–3,400-word lesson with worked examples and a Practice section, 10+ quiz questions (at least 3 scenario), 15+ flashcards, 4–6 checkpoints and 2–4 resources.
- New `<Callout type="analogy">` box (≈ icon). Every lesson has several memorable analogies, for example DNS as a concierge, TCP as a phone call vs UDP as pigeons, TLS key exchange as paint mixing, and realtime as a road trip.
- Seven networking sections drafted in Antigravity were merged and fact-checked: Google Maglev in place of an unverified Netflix stat, the least-connections explanation, L4 balancers passing TLS through, the HTTP/2 RFC and removed server push, AEAD instead of MAC, root-server counts, and truncated figure captions.
- Glossary grows to 116 terms; every `<Term>` in a lesson resolves.
- The smoke test now covers all 12 lesson pages in both themes at desktop and mobile widths.
- Verify: open /phase/1/realtime and /phase/1/tls; `pnpm test` (content validation); `pnpm test:e2e smoke`.

## Prompt 07 · Phase 1 simulators
- S-01 Estimation calculator: up to 4 actions per user, live QPS, read:write, storage, bandwidth, servers, DB reads after cache and cache size, each with its formula and numbers substituted. 10 timed drills (illustrative inputs) accept ±50%.
- S-02 Request journey: step through browser cache, cold DNS walk, TCP and TLS 1.3, LB, app, cache and DB with editable RTTs; toggles for DNS cache, reuse, HTTP/2, cache hit and CDN; latency breakdown bar; lost-SYN and cache-down faults; a quiz challenge.
- S-03 Load balancer: 2–10 servers, round robin, smooth weighted round robin, least connections, IP hash and random; health checks with interval and threshold; kill, slow, flaky and ×3 spike faults.
- S-04 Consistent hashing: 2³² ring with virtual nodes and 100–10,000 keys, keys per node vs modulo, % moved on each change, moved keys flash.
- S-05 Rate limiter: token bucket, leaky bucket, fixed window, sliding log and sliding counter on the same traffic (steady, bursty, boundary attack, ramp), plus 3 servers with local buckets vs one shared bucket.
- Each has 2–3 machine-checked challenges, a 5-step tour and model tests. Embedded in their lessons; S-04 and S-05 sit in load-balancers under "Related simulators".
- Framework: challenges can end early (`done`), actions refresh metric cards while paused, the 3-column simulator layout starts at xl (the canvas was 128 px wide at ~1100 px), and status-tone blocks use ink text so they read in Blueprint.
- Verify: open each /simulators/<id>, press Play, try a challenge. `pnpm test` (93 tests), `pnpm test:e2e` (all 5 routes in the smoke test).

## Prompt 08 · Phase 2 content
- All 18 Phase 2 sections (weeks 3–6), each with lesson, quiz, flashcards, checkpoints and resources: REST, GraphQL, gRPC, API gateway, rate limiting, idempotency, SQL vs NoSQL, data modeling, indexing, transactions, locking, replication, sharding, consistent hashing, connection pooling, object storage, search, OLAP vs OLTP.
- Every lesson: why it matters, one H2 per topic with depth stamps, analogy callouts, worked examples with numbers, tradeoff and not-when boxes, misconceptions, interview angle and a Practice list. Highlights: the five rate-limiting algorithms with a Redis INCR/Lua section, a two-transaction timeline for each isolation anomaly plus MVCC, an 8-row SQL vs NoSQL decision table, EXPLAIN before/after plans, a REST vs GraphQL vs gRPC table, typeahead sizing with precomputed top-k.
- Embeds: rate-limiter in rate-limiting and api-gateway; consistent-hashing in sharding and consistent-hashing (registry sectionIds updated). Future simulators (sql-sandbox, isolation-lab, index-visualizer, replication, sharding) are listed in meta.json only.
- 76 new glossary terms (192 total).
- Verify: open /phase/2 and any section; `pnpm test` (content volume, topic and glossary checks), `pnpm test:e2e` (all 18 routes in the smoke test).

## Prompt 09 · Phase 2 simulators + SQL sandbox
- S-06A SQL sandbox: a real PostgreSQL (PGlite, loaded only on its page) seeded with 50k users, 200k posts, 300k follows, 100k orders, 250k order items, 1k products and 10 accounts. Monaco editor with table/column autocomplete and Ctrl/⌘+Enter, results grid with row count and timing, EXPLAIN rendered as a plan tree with the costliest node highlighted, Reset database, plain-editor fallback. 15 auto-checked exercises in three tracks (indexing, modeling, transactions); each track is a challenge.
- S-06B Isolation lab: two sessions side by side on a small MVCC engine that reproduces Postgres for READ COMMITTED, REPEATABLE READ and SERIALIZABLE: per-statement vs per-transaction snapshots, row-lock waits, first-updater-wins 40001, and SSI-style 40001 for write skew. Presets: dirty read, non-repeatable read, phantom, lost update (naive, atomic UPDATE, FOR UPDATE, version column) and write skew (on-call doctors). A step sequencer, an explanation after each run and a row-version table showing what each session sees.
- S-07 Index visualizer: a B-tree (order 3–5) with splits, borrow/merge deletes and search paths, next to an LSM tree (memtable → L0 → leveled compaction into L1/L2, tombstones, optional Bloom filters). Write amplification and nodes/files per read for both, with sequential vs random keys and batch size.
- S-08 Replication: leader + 2–4 followers, async / semi-sync / sync, per-link delay, leader crash with failover (lost writes listed), partition, lag spike; read-your-writes and monotonic reads toggles; stale reads %, lag per follower, write p99.
- S-09 Sharding: 10,000 users on 4–16 shards by id range, name range, hash or directory, uniform or Zipf traffic; celebrities, add shard (% data moved per strategy), split hot shard, salting and a dedicated shard; load heatmap with OK/HOT/OVERLOADED labels, max/avg and shards touched by a friends' feed query.
- Embedded in the indexing, transactions, data-modeling, locking, replication and sharding lessons. Every exercise checker and challenge is unit-tested (188 unit tests in total); each new route is in the Playwright smoke test.
- Verify: open /simulators/isolation-lab, pick Write skew, set both sessions to SERIALIZABLE, press Run to end; open /simulators/sql-sandbox and pass the first exercise. `pnpm test`, `pnpm test:e2e`.

## Prompt 10 · Phase 3 content
- All 13 Phase 3 sections (weeks 7–8), each with lesson, quiz, flashcards, checkpoints and resources. Caching: cache layers, cache strategies, eviction, invalidation, cache failures, CDN, Redis. Messaging: queues vs pub/sub, delivery semantics, partitioning and ordering, failure handling, event-driven, Kafka vs queues.
- About 31,000 lesson words, 148 quiz questions, 216 flashcards. Highlights: a mermaid sequence diagram for each of the five cache strategies, a TypeScript LRU (hash map + doubly linked list), both orders of the delete/update race as timelines, stampede fixes (locks, coalescing, XFetch early refresh, TTL jitter), Redis Cluster slot routing with a worked CRC16 slot, the dual-write bug before the outbox, Kafka/RabbitMQ/SQS decision table.
- Simulator ids (cache, redis-playground, message-queue, outbox) are in meta.json and show as cards until Prompt 11 builds them.
- 90 new glossary terms (282 total).
- Verify: open /phase/3 and any section; `pnpm test` (content volume, topic and glossary checks), `pnpm test:e2e` (all 13 routes in the smoke test; the plan test now checks week 9 for "Coming soon").

## Prompt 11 · Phase 3 simulators
- S-10 Cache: 4 app servers → 4 cache nodes (keys hashed to nodes) → one database, under Zipf-skewed traffic. The DB and nodes are capacity-limited queues. LRU / sampled LFU / FIFO / random eviction; TTL with optional ±10% jitter; cache-aside, read-through, write-through and write-behind; request coalescing, a global rebuild lock, null caching and a local hot-key cache. Faults: flush, hot key, mass expiry, DB slowdown, node down (loses unflushed write-behind writes). A step-through race demo shows update-on-write going stale and delete-on-write staying consistent. Challenges: survive a flush (DB < 70%), spread a mass expiry without coalescing, reach an 82% hit rate from a 5% cache.
- S-11 Redis playground: a redis-cli style REPL on a simulated Redis. About 50 commands across strings, hashes, lists, sets, sorted sets and HyperLogLog, with TTLs on a simulated clock (lazy and active expiry, fast-forward) and MULTI/EXEC. It has history and tab completion, a live key browser, and six auto-checked exercises in three challenges. The page says it is a simulation, not a real Redis.
- S-12 Message queue: a Kafka-style partitioned log or an SQS/RabbitMQ-style queue, with consumer groups, rebalances, commit-before vs commit-after, an idempotent consumer, visibility timeout, retries with backoff and a DLQ, a second group and replay. Faults: crash or slow a consumer, a poison message, a producer burst. Four challenges.
- S-13 Outbox: commit-then-publish and publish-then-commit dual writes diverging under crashes, then a transactional outbox with a polling relay and an idempotent consumer. Four challenges, including 1,000 orders with zero inconsistencies.
- Embedded in all 13 Phase 3 lessons under a new "Try it" heading; the six caching sections share S-10, each with its own thing to try. Each new route is in the Playwright smoke test.
- Quiz rebalance across all 43 sections: distractors are now specific misconceptions of similar length, so the correct answer can't be spotted by length (separate commit).
- Verify: open /simulators/cache, run "Survive a cache flush", fail it, turn on the rebuild lock, pass it; open /simulators/redis-playground and type `SET session:1 alice EX 30`, then fast-forward. `pnpm test` (252 unit tests), `pnpm test:e2e`.

## Prompt 12 · Phase 4 content
- All 15 Phase 4 sections (weeks 9–10). Distributed systems: CAP and PACELC, consistency models, quorums, consensus and Raft, time and ordering, distributed transactions (2PC, sagas), ID generation, distributed locks. Reliability: high availability, fault tolerance, timeouts and retries, circuit breakers, bulkheads and load shedding, disaster recovery, chaos engineering.
- About 44,000 lesson words, 167 quiz questions, 244 flashcards, 106 new glossary terms (388 total), 51 resources. Written to a higher bar: definitions from the primary sources (Gilbert & Lynch, Herlihy & Wing, the Raft and Spanner papers, Lamport, Sagas 1987, RFC 9562, the AWS Builders' Library, the SRE book); a millisecond-by-millisecond failure timeline for each key idea; worked arithmetic (Snowflake bits, birthday-bound collisions, nines to downtime, series/parallel availability, quorum overlap, 27× retry amplification, Little's law pool sizing); one analogy per section with where it breaks down; interview follow-ups with strong answers.
- Fair treatment where the field disagrees: "pick 2 of 3", Redlock (Kleppmann vs antirez).
- Simulator ids (cap, quorum, raft, clocks, saga, snowflake, retry-storm, circuit-breaker, availability-calculator) are in meta.json and show as cards until Prompt 13 builds them.
- Verify: open /phase/4 and any section; `pnpm test` (content checks), `pnpm test:e2e` (all 15 routes; the plan test now checks week 11 for "Coming soon").

## Prompt 13 · Phase 4 simulators
- Nine simulators (S-14 to S-22), each with a pure seeded model, SimulatorShell, a "what it models / simplifies" drawer, a guided tour, machine-checked challenges and model tests with failure cases:
  - **CAP (S-14):** cut links between 3–5 replicas; a CP cluster refuses on the minority side while an AP cluster answers stale and meets conflicts on heal; CP's majority round trip shows even with no partition (PACELC).
  - **Quorum (S-15):** tune N, R and W, crash or slow replicas, and see what overlap costs in availability and latency.
  - **Raft (S-16):** five nodes with election timers, RequestVote/AppendEntries dots and logs by index with the commit bar; crash the leader, slow a node, or drag nodes across a partition.
  - **Clocks (S-17):** local events, sends and receives on three processes; compare any two by vector clock, Lamport timestamp and skewed wall clock; NTP step fault.
  - **Saga (S-18):** an order through Order, Payment, Inventory and Shipping as an orchestrated saga, a choreographed saga or 2PC; compensations run in reverse; a crashed 2PC coordinator leaves participants blocked holding locks.
  - **Snowflake (S-19):** split 64 bits between timestamp, machine and sequence; a clock stepped back makes the naive generator mint duplicates, while waiting for the clock keeps IDs unique.
  - **Retry storm (S-20):** a short fault, naive retries, and a service that stays down after the fix; backoff, jitter and a retry budget, with live amplification.
  - **Circuit breaker (S-21):** closed/open/half-open state diagram; trip fast on a real outage, ignore noise, and let a cold B warm up.
  - **Availability calculator (S-22):** chain and duplicate components to get total availability, downtime per year and the weakest link.
- 13 Phase 4 lessons now embed their simulator in a "Try it" section (distributed-locks and chaos-engineering have none in the spec).
- Verify: open /simulators/raft and press Play, then Crash leader; open any Phase 4 lesson and scroll to "Try it". `pnpm test` (354 tests), `pnpm test:e2e` (all nine simulator routes).

## Prompt 14 · Phase 5 content + simulators
- All 14 Phase 5 sections (weeks 11–12). Observability: logging, metrics, tracing, SLOs, alerting. Security: authn/authz, access control, data protection, common attacks. Deployment: containers, Kubernetes, CI/CD, release strategies, infrastructure as code.
- About 39,500 lesson words, 159 quiz questions, 237 flashcards, 112 new glossary terms (500 total), 52 resources (all fetched and live). Same bar as Phase 4: primary sources (the SRE book and workbook, RED/USE, W3C Trace Context, RFC 6749/7636/7519/8725/9700, OIDC Core, NIST SP 800-162, SPIFFE, OWASP Top 10 2021, the Kubernetes and Terraform docs), failure timelines (cardinality explosion, a 03:00 alert storm, a stolen JWT after logout, SSRF to the metadata endpoint, a missing readiness probe, a column rename mid-deploy), worked arithmetic (log cost, series counts, trace sampling storage, burn rates, KMS cost, rolling-update capacity, flaky-test odds). Security lessons teach defence, with no working payloads.
- Four simulators:
  - **Observability lab (S-23):** four services, Postgres, Redis and a payment provider emitting RED metrics, structured logs with trace ids and trace waterfalls, with head or tail sampling. Five scripted incidents (slow query, payment-provider timeouts, cache node down, memory leak, bad deploy), each with its own signature; submit cause + component, scored on correctness and time.
  - **Error budget (S-24):** a 30-day SLO window minute by minute; inject incidents and watch the SRE workbook's multiwindow burn-rate alerts (14.4×/1 h + 5 m, 6×/6 h + 30 m, 1×/3 d + 6 h) page or ticket; a ship/hold release board checked against the budget policy.
  - **Release strategies (S-25):** ten pods behind a router; rolling (maxSurge/maxUnavailable), blue-green and canary with automated analysis and rollback; a hidden good or bad build; expand/contract column rename where each wrong step order fails in its own way.
  - **JWT inspector (S-26):** decode, sign and verify HS256 with a demo secret generated in the browser (Web Crypto, never sent anywhere); tamper → invalid; judge six tokens like a server (alg allowlist first, so alg: none is rejected); logout timeline comparing long TTL, short TTL + refresh, and a denylist.
- Six lessons embed their simulator in a "Try it" section.
- Verify: open /phase/5 and /simulators/observability-lab (start a random incident), /simulators/jwt-inspector (sign, change role to admin, apply without re-signing). `pnpm test` (453 tests), `pnpm test:e2e` (all 14 routes and 4 simulators; the plan test now checks week 13 for "Coming soon").

## Prompt 15 · Phase 6 content + simulators, plus an AI-infrastructure track
- All 12 spec sections (week 13): serverless, edge computing, stream processing, batch processing, multi-region, embeddings and vector search, RAG, LLM serving, LLM cost and latency, AI reliability, evals and guardrails, agents. About 34,000 lesson words, 136 quiz questions, 202 flashcards, 44 resources.
- Six extra sections the user asked for, on how LLMs are served to millions of people: LLM inference internals (forward pass, roofline, sampling, why temperature 0 still drifts), GPU parallelism (data, tensor, pipeline, context, expert; ZeRO/FSDP; collectives), speculative decoding (the exact acceptance rule, expected speedup tables, Medusa/EAGLE/lookahead), inference optimisation (quantization, FlashAttention, MQA/GQA, prefix caching, chunked prefill, disaggregated prefill/decode), LLM serving at scale (request path, capacity planning, admission control, prefix-aware routing, slow GPU autoscaling, model rollout), training at scale (6ND, MFU, failures and checkpointing). About 18,000 words, 66 quiz questions, 101 flashcards, 24 resources.
- 145 new glossary terms (645 total). All 68 resource URLs fetched and live. No vendor prices, benchmark scores or current model versions: worked numbers are labelled assumptions or published architecture facts (Llama 2 configs).
- Three simulators:
  - **Vector search (S-27):** 2,000 texts with 64-d LSA embeddings built at build time (`data/build.py`), brute force vs a real TypeScript HNSW (M, efConstruction, efSearch) with recall@10 and distance-computation counts, pre-filter vs post-filter.
  - **RAG pipeline (S-28):** a React Flow pipeline over a 22-policy fictional handbook with 20 gold-labelled questions; fixed/sentence/heading chunking, BM25, LSA vectors, hybrid RRF, an explainable reranker and token-budget packing; hit rate, context tokens, cost and modelled latency. Fully offline.
  - **LLM inference (S-30):** a 7B or 70B model on 1–8 GPUs: roofline step times, tensor parallelism, quantization, static vs continuous batching, paged vs reserved KV, preemption, chunked prefill, prefix caching and speculative decoding, with GPU memory, a batch-slot grid and a live roofline.
- Seven lessons embed a simulator in "Try it".
- Verify: /phase/6; /simulators/vector-search (tune efSearch to pass recall 0.95), /simulators/rag-pipeline (switch to heading-aware chunking and hybrid), /simulators/llm-inference (Play, then turn on speculative decoding). `pnpm test` (506 tests), `pnpm test:e2e` (610 passed: all 18 Phase 6 routes and 3 simulators; the plan test now checks week 14).
