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
