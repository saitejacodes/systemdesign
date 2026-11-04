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

## Prompt 16 · Code labs (S-29)
- 15 code labs, each in **five languages** (the user asked for TypeScript, Java and C++ beyond the spec's Python):
  - **The labs:** LRU, LFU, token bucket, sliding-window counter, consistent hash ring, Bloom filter, trie top-k autocomplete, Snowflake IDs, backoff with jitter, circuit breaker, Lamport and vector clocks, quorum with read repair, geohash, Merkle tree, leaky bucket.
  - **Files per lab:** an explanation (where it is used in real systems, invariants, the exact task, going further), complexity targets, three progressive hints, and a starter and reference solution in every language.
  - **Tests:** 10–14 per language, the same cases in every language, with injected clocks and seeded randomness.
- **Python, JavaScript and TypeScript run in the browser** inside Web Workers, and nothing is sent to any server:
  - **Python** uses Pyodide 0.27.7 from the CDN, loaded on the first run.
  - **TypeScript** goes through `transpileModule` (typescript 5.9.3 from the CDN) and runs against the JS tests.
  - **JavaScript** runs in a worker with network and storage globals removed.
  - **Time limit:** a 5 s limit terminates the worker.
- **Java and C++ run on your machine:** the editor works the same, and "Download runnable file" builds one file with your code, the harness and the tests (`java LabTests.java`, or any C++17 compiler).
- **Workbench:**
  - Monaco editor, following the site theme, with a plain-textarea fallback if Monaco doesn't load within 8 s.
  - Run, Run tests (Ctrl/⌘+Enter), Reset to starter, progressive hints, and the reference solution beside your code (free after 3 failed runs, otherwise behind a confirm).
  - Per-test results show input, expected, actual, stdout and the error.
  - Code autosaves per language (Dexie v2 `labCode` table), and passing all tests records a challenge result.
- `/simulators/code-labs` lists the labs with passed status, and each lesson links to its labs after the lesson.
- **Phase 6 resources:** 16 links the user supplied on transformers, agents and agent harnesses, evals, RAG and LLM observability were checked live and added to five lessons, apart from two that were already listed.
- **Verify:**
  - Open /simulators/code-labs/lru-cache, then Show reference solution → Run tests (Python loads about 10 MB the first time). Switch to Java → Download runnable file → `java LabTests.java`.
  - `pnpm test` (583 tests: every reference solution passes and every starter fails, in all five languages).
  - `pnpm test:e2e` (labs.spec plus all 15 lab routes).

## Prompt 17 · Design Studio: canvas
- **/studio** lists your designs (title, case study or template, last updated):
  - New design, or New from template: 19 case-study practice starters plus a full three-tier example.
  - Duplicate, delete (with confirm), and import JSON with readable validation errors.
- **Editor** (`/studio/<id>`; `/studio/new?template=<id>` creates one), built on React Flow:
  - **Canvas:** infinite, snap to a 16 px grid, minimap and zoom controls.
  - **Selection:** multi-select and box-select.
  - **Editing:** copy/paste/duplicate, undo/redo (100 steps, drags coalesced), delete, arrow nudge (Shift ×10), Space+drag pan.
  - **Layout:** align and distribute tools; region/AZ frames that nodes join on drop; resizable text notes.
  - **Edges:** a label, arrow direction, and a kind (sync solid, async dashed, replication dotted).
- **Palette:** 18 components plus the Region/AZ frame, each with its own isometric icon in the colour of the phase that teaches it. It is searchable by name, description and keywords such as "kafka" or "s3". Drag a component, or press Enter to add it at the centre of the view.
- **Properties panel:**
  - Every default property with its unit, validated inline. Invalid values are never applied.
  - Edge kind, label and direction.
  - "Connect to" as a keyboard path for connecting nodes.
  - Align tools for a multi-selection.
  - A link to the lesson that teaches the selected component.
- **Saving and history:** autosave to IndexedDB after 800 ms, with a Saved indicator. Version history keeps the last 20 snapshots, taken at most once a minute on save or whenever you click "Save version". Restoring a version can be undone.
- **Notes tab per design:** prefilled with the 7-step framework headings. Under them are prompts covering requirements, capacity, API and data model, high-level design, scalability and fault tolerance, and bottlenecks and trade-offs. Templates add the problem statement on top.
- **Export:** PNG and SVG in Paper or Blueprint, built from the graph with theme colours inlined (no new dependency), plus JSON.
- **Verify:**
  - Open /studio, then New from template → URL shortener, add a Load Balancer and two Services from the palette and connect them.
  - Set instances to 0 to see the validation error, then use ⌘Z / ⇧⌘Z, reload, and export a PNG.
  - `pnpm test` (725 tests); `pnpm test:e2e` (studio.spec plus the /studio routes).

## Prompt 18 · Design Studio: Run mode
- **Run** in the editor turns the drawing into a traffic model (`lib/studio/sim`, pure and seeded):
  - Traffic enters at the clients and splits across load balancers by algorithm and capacity.
  - Caches and CDNs answer their hit rate and send misses downstream; reads can go to replicas.
  - Async edges hand off to queues that workers drain, and queue depth grows when they can't keep up.
  - Utilization sets latency, and load above ρ 0.95 is dropped as errors. p99 is approximated per request type.
- **On the canvas:** edges thicken with QPS, and nodes show OK / HOT / OVERLOADED / DOWN as a glyph and a word.
- **Traffic panel:** total QPS, read:write ratio, peak multiplier, and up to 3 request types.
- **Analysis:** bottlenecks (ρ > 0.8), single points of failure (cut vertices of client → target reachability), an availability estimate and monthly cost.
- **Faults:** kill or slow any node, Traffic ×10, Lose an AZ, Cache flush (cold, then recovering over 60 s).
- **Challenges:** three generic ones for every design (10k QPS under 200 ms, survive an AZ, zero SPOFs), plus each case study's own run challenge.
- **This session's fixes:**
  - Availability no longer double-counts a component shared by several paths: it is conditioned exactly.
  - Queues have a replication factor, so a replicated Kafka topic is not a SPOF.
- **Verify:** /studio → New from template → Three-tier web app → Run → Play, kill "API 1", then Faults → Traffic ×10. Run `pnpm test` (model tests: utilization, cache split, SPOF on sample graphs, availability, queue replication) and `pnpm test:e2e` (studio-run.spec).

## Prompt 19 · Interview Mode
- **Start:** `/interview/<case>` opens with the interviewer's prompt, Mock or Practice, 30/45/60 min, and hints on or off.
- **Session:**
  - A large mono countdown. Pause is available in Practice only.
  - The 7 framework step panels (Requirements, Estimation, API, Data Model, High-Level Design, Deep Dives, Wrap-up), each with its suggested time and an over-time nudge.
  - The case's Design Studio canvas, with Run mode and the Notes tab.
- **Step panels:**
  - **Requirements:** click a clarifying question to reveal the interviewer's answer.
  - **Estimation:** a mini calculator.
  - **API:** an endpoint editor.
  - **Data model:** an entity editor, plus the DB choice and its justification.
  - **Deep dives:** questions revealed one at a time across the step's window. Practice can ask for the next one early.
  - **Hints:** up to 2 per step, derived from the case. Each one costs a point in Mock.
- **Self-review:**
  - The case rubric (0/1/2 per criterion, grouped by step).
  - Your design beside the reference.
  - Both designs run at the case's peak, compared metric by metric, with the run challenge for each.
  - The reference walkthrough, and the common-mistakes checklist.
- **Saving:** the attempt is saved as an InterviewAttempt. The dashboard shows each case's score trend, and a reload mid-interview resumes the attempt.
- **Verify:** /interview/url-shortener → Practice → Start, reveal a clarifying question, use a hint, then Submit, score every criterion and Save; /dashboard shows the trend. Run `pnpm test:e2e` (interview.spec on the fixture case).

## Prompt 20abc · Case studies
- **19 complete case studies**, about 92,000 words of worked solutions with 239 rubric criteria in all:
  - **The prompt's 15:** url-shortener, rate-limiter-service, news-feed, chat-app, notification-system, typeahead, video-streaming, ride-sharing, file-sync, payment-system, ticket-booking, job-scheduler, web-crawler, metrics-monitoring, rag-docs-assistant.
  - **The user's 4 additions:** api-gateway, search-engine, instagram (titled "Photo-sharing app"), food-delivery.
- **Each case:**
  - **Solution:** the 10 sections in order, with every number derived, an architecture diagram, one deep dive per question, failure timelines, and trade-off tables. It cites primary sources (papers, RFCs, engineering blogs).
  - **Reference design:** sized from the estimation, and it passes the case's run challenge with zero SPOFs.
  - **Rubric:** 10–14 criteria covering all 7 steps.
  - **Clarifying Q&As, deep-dive questions and common mistakes** in meta.json.
- **Pages:** `/case-studies` lists them. `/case-studies/<id>` shows the prompt behind a "try it first" fold, the solution, the reference design, traffic, run challenge, related lessons and common mistakes, with links to Interview Mode and the Studio template.
- **Links:** 55 lessons now link to the cases that use them, the 4 added cases are in week 16 of the plan, and 13 new glossary terms were added (658 total).
- **Verify:** open /case-studies and any case. Run `pnpm test` (`case-studies.test.ts`: files, section order, word count, rubric coverage, and every reference design passing its challenge) and `pnpm test:e2e` (every case page and interview page in both themes).

## Prompt 20d · Phase 7 Interview Mastery
- All 8 Phase 7 sections, each with lesson, quiz, flashcards, checkpoints and resources (about 25,000 lesson words, 92 quiz questions with 62 scenario-type, 131 flashcards):
  - **Week 14:** the 7-step interview framework (minute budgets for 30/45/60 minutes, say/draw tables, a full URL-shortener walkthrough), requirements and scoping (a clarifying-question bank built from the cases), the building-blocks map ("need → consider → watch out for", every row linked to its lesson) and trade-off communication (seven weak-vs-strong exchanges).
  - **Week 15:** deep-dive patterns (hot keys, fan-out, idempotency, consistency, read vs write scaling, backpressure, multi-region; each with the signal, solutions, a failure timeline and the cases that use it) and the mock-interview playbook (Interview Mode, honest self-review, a peer-mock script, the first six cases to mock).
  - **Week 16:** level expectations (one hot-key moment answered at junior, mid and senior level) and a two-week final review routine using Today, Flashcards, simulators, Interview Mode and the Dashboard.
- 19 new glossary terms. Sidebar and plan now show Phase 7 with real sections; no week has "Coming soon" items left.
- Fix: the dashboard trend and the saved-attempt list now apply the Mock hint penalty, so they match the save screen.
- Verify: open /phase/7/interview-framework and /plan (week 14); save a Mock attempt with a hint and check /dashboard shows the same % as the save screen. `pnpm test`, `pnpm test:e2e` (Phase 7 routes added).

## Prompt 21 · AI features (optional)
- Settings → AI: provider (Anthropic, or any OpenAI-compatible endpoint with a base URL), API key with a plain warning about browser storage, model (default claude-opus-5-5), Test connection, Remove key, and this month's requests, tokens and estimated cost.
- `lib/ai`: one client for both providers with streaming, a 60 s timeout, one retry with backoff (only before any text has streamed) and readable errors (invalid key, rate limit, overloaded, network/CORS, timeout, not found, refused). Anthropic goes through the official SDK with browser access enabled; OpenAI-compatible endpoints through fetch and server-sent events. `scripts/ai-proxy` is a tiny local CORS proxy for endpoints that block browsers.
- AI Tutor (right panel, `]`): chat grounded in the page title, lesson topics and the page's text (capped at 12,000 characters), with four modes (Explain simpler, Give me an example, Quiz me on this page, Check my understanding). Streams Markdown; each page's conversation is stored in `tutorConversations`.
- AI interviewer (Interview Mode, opt-in at start): answers free-text clarifying questions in character from the case's clarifying answers, asks follow-up deep dives about your own design and panels, and after submission grades every rubric criterion with a reason plus 3 improvements. AI scores sit under your own scores and never replace them; the feedback is saved in `InterviewAttempt.aiFeedback`.
- Explain my design (Design Studio toolbar): bottlenecks, single points of failure and missing pieces, citing the design's Run Mode numbers at average and peak.
- Every AI answer is labelled "AI-generated: may contain mistakes" and shows its tokens and estimated cost; monthly totals go to `aiUsage`.
- With no key, every entry point says "Add an API key in Settings" and nothing is sent anywhere.
- Verify: `pnpm test` (lib/ai/ai.test.ts: serializer, prompt builders, client, usage, export without the key) and `pnpm test:e2e` (tests/e2e/ai.spec.ts mocks the provider). By hand: add a key in Settings, Test connection, open a lesson, press `]` → AI Tutor.

## Prompt 21 follow-up · Gemini, Groq, OpenRouter, OpenAI keys
- Settings → AI → Provider now offers Anthropic (Claude), Google Gemini, Groq, OpenRouter, OpenAI, and Other OpenAI-compatible endpoint. Presets carry their API root and link to where to get a key and the model list; no proxy is needed for any of them.
- "Load models" lists the models your key can use (`GET /models`) and fills the Model box's suggestions.
- Endpoints that reject `stream_options` are retried once without it.
- Verify: `pnpm test` (preset routing, model listing, stream_options fallback) and `pnpm test:e2e tests/e2e/ai.spec.ts` (mocked Groq: load models, test connection, tutor stream). By hand: pick Groq, paste a key, Load models, choose one, Test connection.


## Prompt 22 · Reference library, resources, capstone
- `/reference`: 11 printable cheat sheets in `content/cheatsheets` (latency numbers, availability nines, estimation, database selection, caching strategies, consistency models, messaging semantics, reliability patterns, the 7-step framework, 50 trade-offs, interview-day checklist). Front matter is validated with zod, related sections are linked, there's a Print button and a print stylesheet, and sheets are indexed in ⌘K search under "Reference".
- `/resources`: 302 resources, made from every section's resources plus the classics in `content/resources.json` (SDI Vol 1 and 2, SRE book and workbook, HPBN, Bigtable, and the Netflix, Uber, Discord, Stripe, Cloudflare, Meta and Shopify blogs). You can search them and filter by phase, kind, topic and free/paid; the filters live in the URL.
- `/capstone`: "Serve an open-weights LLM like a frontier lab". A mini inference platform you run on your own machine with Docker: a CPU model server (llama.cpp), and a gateway with admission control, a router, token rate limits, exact and semantic caches, a batch queue, Prometheus, Grafana and Jaeger, fallbacks, guardrails and evals, plus a k6 load test and capacity plan. It has a stage 0 design review in the 7-step framework, 10 code stages that each work on their own, a "real scale" section per stage, 8 Break-it drills, and a coverage matrix that ties every phase 1–7 to at least 2 stages. Checkboxes are stored as CheckpointState rows (`capstone-<stage>-<n>`, `capstone-break-<n>`), so they show on the dashboard and in backups. The whole project downloads as a zip built in the browser (JSZip).
- Verify: `pnpm test` (cheat-sheet loader, resource library, capstone: files, ids, phase coverage, TS/YAML/JSON/k6 syntax, compose config, zip). `pnpm test:e2e` (reference, resources and capstone specs). By hand: open /reference/latency-numbers and print-preview it, filter /resources by Papers, then on /capstone tick a box and download the zip.
