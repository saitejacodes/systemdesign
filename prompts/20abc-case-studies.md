<!-- Run this THREE times. Each time, keep only one of [20a: 1–5] / [20b: 6–10] / [20c: 11–15] in the Task line. -->

Read CLAUDE.md §7 and the case-study format below. Task: write these case studies
completely: [20a: 1–5] / [20b: 6–10] / [20c: 11–15].
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."
(Here a "section" is one case study; use its id as the marker.)

Case list:
1 url-shortener | 2 rate-limiter-service | 3 news-feed | 4 chat-app |
5 notification-system | 6 typeahead | 7 video-streaming | 8 ride-sharing |
9 file-sync | 10 payment-system | 11 ticket-booking | 12 job-scheduler |
13 web-crawler | 14 metrics-monitoring | 15 rag-docs-assistant

For EACH case create /content/case-studies/<id>/ with:

meta.json: id, title, difficulty (1–3), weekRecommended, relatedSectionIds,
  interviewerPrompt (2–4 sentences, deliberately underspecified like a real interview),
  clarifyingQuestions [{question, answer}] (8–12),
  deepDiveQuestions [] (3–5), trafficProfile (for Run Mode: qps, readWriteRatio,
  requestTypes), runChallenge (target metrics), commonMistakes [] (5–8).

solution.mdx (2,500–5,000 words), sections in this exact order:
  1. Requirements (functional, non-functional, out of scope)
  2. Estimation (every number derived step by step)
  3. API design (endpoints with request/response examples)
  4. Data model (entities, keys, DB choice with justification)
  5. High-level design (Mermaid diagram + walkthrough of each request type)
  6. Deep dives (one H3 per deepDiveQuestion, with alternatives considered and the
     tradeoff that decides it)
  7. Failure modes & mitigations (table)
  8. Scaling to 10× (what breaks first and what changes)
  9. Tradeoffs summary (table: decision, alternative, why)
  10. What interviewers look for

design.json: a reference design in Design Studio JSON format (must load and pass its
  runChallenge in Run Mode: verify this programmatically in a test).

rubric.json: 10–14 criteria, grouped by framework step, each with descriptions for
  scores 0, 1, 2.

Case-specific must-covers:
- url-shortener: ID generation options (hash vs counter vs Snowflake), base62, 301 vs 302,
  read-heavy caching, analytics via async events, custom aliases, expiry.
- rate-limiter-service: algorithm choice, distributed counters in Redis, Lua atomicity,
  multi-region limits, failure mode (fail open vs closed).
- news-feed: fan-out on write vs read vs hybrid (celebrities), feed cache, ranking (high
  level), pagination with cursors.
- chat-app: WebSocket gateway, connection registry, message ordering per conversation,
  delivery receipts, offline delivery, group chat fan-out, presence, end-to-end encryption (awareness).
- notification-system: multi-channel (push/SMS/email), templates, user preferences,
  queues per channel, retries & DLQ, deduplication, rate limiting per user.
- typeahead: trie vs precomputed top-k, update pipeline from query logs, caching at edge, personalization (awareness).
- video-streaming: upload with multipart + presigned URLs, transcoding pipeline (DAG of
  jobs), adaptive bitrate (HLS/DASH), CDN strategy, metadata store, view counts.
- ride-sharing: location updates at scale, geospatial indexing (geohash/quadtree/H3),
  matching, trip state machine, surge (awareness), consistency of driver assignment.
- file-sync: chunking, content hashing & dedup, metadata vs block storage, sync protocol,
  conflict handling, Merkle trees / delta sync, notifications of changes.
- payment-system: idempotency keys, double-entry ledger, state machine, PSP integration,
  reconciliation, exactly-once effects, audit, never losing money.
- ticket-booking: seat inventory contention, temporary holds with expiry, optimistic vs
  pessimistic locking, virtual waiting room for spikes, payment timeout handling.
- job-scheduler: job definitions, time-based triggers, leader election or partitioned
  scheduling, at-least-once execution + idempotent jobs, retries, visibility.
- web-crawler: URL frontier, politeness per host, dedup (URL + content hashing, Bloom
  filters), robots.txt, distributed workers, recrawl scheduling.
- metrics-monitoring: high-cardinality write path, time-series storage & compression
  (awareness), downsampling, query path, alert evaluation.
- rag-docs-assistant: ingestion pipeline, chunking, hybrid retrieval, permissions-aware
  retrieval (document ACLs), caching, evals, cost controls, freshness.

Definition of Done: CLAUDE.md §8 + every design.json passes its runChallenge test.
