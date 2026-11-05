# Decisions

## Fixes to the kit (from FIXES.md, Prompt 00)
1. Hero = PhasePath (7 isometric steps climbing Phase 1 → 7, one shape per phase). Ignore any "IsoLayerStack" / "7 layers" mention.
2. Fonts exactly: Archivo (display AND body), Instrument Serif Italic (one accent word per headline), IBM Plex Mono (labels, captions, metrics, HUD). Never IBM Plex Sans, Inter or a system stack. Load with next/font/google.
3. design/landing/landing.html uses local CSS variables; rebuild it with the variables from design/tokens.json / tokens.css.
4. Only the Paper landing is drawn. Build Blueprint (dark) from the [data-theme="blueprint"] tokens: same layout, chalk on navy.
5. Today, Lesson, Simulator, Studio, Interview, Dashboard are not drawn: compose them from design/components/* and design/notes.md.
6. If design/notes.md and design/design-system.md disagree, notes.md wins.
7. Lesson pages: no drafting grid, crosshairs or heavy motion behind reading text.

## Prompt 01
- Next.js 16.4 (latest stable). `cacheComponents` is off: all content is static files, so the simpler caching model is enough.
- pnpm pinned to 10.24.0 via `packageManager` (corepack's pnpm 12 cache on this machine is broken). Use Node 22.
- shadcn/ui is the Base UI flavour (`base-nova`); its semantic CSS variables are mapped onto the Field Manual tokens in `app/globals.css`, radius capped at 4px.
- `design/components.css` and the landing styles are copied into `app/styles/` inside `@layer components`, so Tailwind utilities can override them. Values unchanged.
- PhasePath and the landing simulator preview use the approved SVG geometry from `design/landing/landing.html` (generated into `*-markup.ts`). Hover readouts, rise and draw-in motion are CSS from components.css.
- Theme choice is stored in localStorage (`sdl-theme`) and applied by an inline script before paint. It moves to the Dexie Settings table in Prompt 03 only if needed.
- The landing page keeps its own header (as drawn); every other route uses the app shell via the `app/(shell)` route group.
- Sidebar tree shows the 7 phases; sections come from content in Prompt 02 (empty phases say "Coming soon"). No placeholder section names.

## Prompt 02
- MDX via `next-mdx-remote/rsc` with `blockJS: false` (lessons are trusted repo files; props like `items={[...]}` need JS expressions).
- Search uses MiniSearch. The index is built at build time into the static route `/search-index.json` and loaded in the browser on first query. That route also runs cross-file validation, so bad content fails `pnpm build`.
- Content validation errors name the file and field path (`lib/content/parse.ts`). `lib/content/content.test.ts` also enforces the §7 volume targets for every section.
- `<Term>` tooltips are pure CSS (hover and keyboard focus), linking to `/glossary#slug`.
- Shiki renders both github-light and github-dark colours; CSS picks one per `data-theme`.
- `/phase/[n]` lists a phase's sections (the collapsed sidebar links there).

## Prompt 03
- Content-derived ids are namespaced in the DB: checkpoint `"<sectionId>:<checkpointId>"`, card `"<sectionId>:<cardId>"`.
- SM-2 follows Wozniak's original text: on q < 3 the card restarts (repetitions 0, interval 1 day) and the ease factor is left unchanged. Otherwise EF' is applied, min 1.3.
- Extra table `cardReviews` (one row per grading) feeds the daily new-card limit and the Prompt 04 dashboard. `CardState.reviewedAt` was added to tell new cards from learning ones.
- Card stages: new = never graded; learning = interval ≤ 6 days; review = longer.
- Only full quiz runs are saved as QuizAttempts; "Retry wrong only" is practice and does not change the best score.
- Hooks use Dexie `useLiveQuery` over the StorageAdapter. A remote adapter would need its own change feed.
- Notes are keyed by URL path and searched from IndexedDB at query time (not in the build index). Note previews use react-markdown with no raw HTML.
- `lib/simulators/challenge-index.ts` lists challenge ids per registered simulator; progress weighting reads it.

## Prompt 04
- `plan.json` `simulatorChallengeIds` entries are either `"simulatorId"` (all its challenges) or `"simulatorId:challengeId"`, because challenge ids are only defined by the simulator prompts.
- Section ids for unwritten phases come from the section lists in prompts 08, 10, 12, 14, 15 and 20d (`p<phase>-<slug>`).
- The current week counts calendar days from local midnight of the start date, clamped to 1–16. Before the start date it is week 1.
- A day that hasn't reached 10 minutes yet doesn't break the streak until it ends.
- "Behind" means a written lesson from an earlier week that isn't complete. Unwritten sections never count.
- Import keeps the local API key in both modes. Reset keeps the Settings row (theme, plan start, key) and clears everything else.
- Study time is counted only on learning pages (lessons, simulators, flashcards, studio, interview, case studies, reference, capstone), not on the dashboard or settings.

## Prompt 05
- "Pure" model means no React, DOM or globals, and deterministic for a seed. `tick` may mutate and return the same state object, so 60 fps runs don't copy state every tick.
- Histograms keep the last 1,024 observations (a sliding reservoir), so percentiles react to faults. Mean and count cover the whole run.
- Rates are per second over the last 1 s of sim time, read from the 250 ms counter samples.
- Challenges run live at the chosen speed. Config keys set by a challenge's `setup` are locked while it runs. A challenge passes once and stays passed; `bestValue` keeps the best value from passing runs (direction set by `better`, default lower).
- The guided tour opens automatically on a learner's first visit to each full-screen simulator (localStorage flag), never in lesson embeds.
- The Web Worker path is not built yet. shortcut: every model ticks on the main thread; add a worker runner when a model opts in with `worker: true` and can't hold 60 fps.
- Registry entries list `challengeIds` statically so progress can use them without loading the module. registry.test.ts checks they match the module.
- Uppercase mono labels wrap Greek letters in `.greek` (no text-transform), so μ never renders as M.

## Prompt 06
- Seven Phase 1 sections (DNS through realtime) were drafted in Antigravity, then rewritten and fact-checked here. Unverifiable company stats were replaced or removed rather than kept.
- Analogies use a new `analogy` Callout type instead of a separate component, so they share the box styling and the MDX stays simple.
- Lessons that embed simulators not built yet (Prompt 07) keep the `<Simulator id>` tag; the embed falls back to the plain simulator card until the registry has the id.

## Prompt 07
- Simulator config and controls live in each module's index.ts (as in Prompt 05) rather than a separate config.ts.
- Interactive simulators (estimation, request journey) still use the shared shell: the clock drives drill timers and the journey animation, and `Challenge.done` ends a run as soon as its goal is met.
- Load balancer service time is 60% fixed plus an exponential part (p99 ≈ 2.4× mean). A pure exponential put p99 near 270 ms with no queueing at all, which hid the effect of the algorithms.
- The heterogeneous-servers challenge accepts least connections as well as weighted round robin: both adapt to capacity, and the result explains the difference.
- Request journey: the "under 100 ms" challenge uses a 35 ms CDN edge, so it needs CDN, connection reuse and a cached DNS answer together (each alone fails). Resolvers usually cache root and TLD answers; the cold walk is shown as a worst case and stated in the simplifications.
- The fixed-window challenge requires choosing the boundary-attack pattern: plain Poisson traffic can also slip 2× through by chance, which is true but not the lesson.
- The token-burst challenge checks the measured burst (≥ 20 in one second) and that the refill rate is 5/s; average throughput alone can't distinguish R under bursty traffic with idle gaps.
- Drill inputs are labelled as illustrative assumptions, not company figures.

## Prompt 08
- Section JSON was generated from compact per-section specs with a scratch script that also checks volumes, topic ids and glossary slugs; the lessons were written by hand.
- Lessons embed `<Simulator>` only for simulators that exist (rate-limiter, consistent-hashing). Prompt 09's simulators are listed in meta.json `simulatorIds`, so they appear on the plan and section cards and become live when the registry gains them, without an embed that would link to a missing page.
- Vendor-specific behaviour is stated with the vendor named (Postgres defaults to Read Committed, InnoDB to Repeatable Read; S3 limits and consistency as AWS documents them). Where only an illustrative number exists (timeout rates, per-server capacity) the lesson says it's an assumption.
- Where practitioners disagree (how far to denormalise in relational stores, HTAP vs a separate analytics path), the lesson gives both sides.
- The plan e2e test now checks week 7 for "Coming soon": weeks 3–6 are fully live.

## Prompt 09
- The isolation lab runs a TypeScript MVCC model, not PGlite: PGlite has one connection per database, so two truly concurrent sessions are impossible. Each preset is unit-tested against the behaviour the Postgres docs describe; the simplifies drawer says it is a model with no deletes, table-wide predicate tracking and no deadlock detection.
- Isolation-lab choices (scenario, technique, levels) live in state and change through actions, because `setConfig` doesn't re-initialise state; finished runs are kept so challenges can add up runs across scenarios.
- SQL sandbox exercise checkers probe the same connection with BEGIN/ROLLBACK. Shortcut: if the learner leaves a transaction open, a check can interfere with it; Reset database recovers.
- Index visualizer draws nodes with 2–4 keys, but costs use 4 KB pages and 100-byte entries; at toy page sizes a B-tree would look cheaper to write than an LSM, which is the opposite of real systems.
- Sharding: a celebrity is a fixed 1,500 req/s rather than 100× an average user, because 100× is about 1% of total traffic and never overloads a shard. "Add shard" rehashes for hash, splits the hottest range for range strategies and splits the hottest shard for a directory.
- Replication uses 100 users so read-your-writes still sends most reads to followers; the lost-writes challenge's p99 limit is 200 ms (semi-sync passes, sync with a 4× remote follower does not).
- S8 and S9 were built in parallel by two subagents, each confined to its own folder; registry entries, lesson embeds and verification were done here.
- The single-server-queue statistics test got a 20 s timeout: it simulates ~100k requests and passed 5 s only when not sharing the CPU with the PGlite tests.

## Prompt 10
- The 13 sections were written by four parallel subagents (caching 1–4, caching 5–7, messaging 8–10, messaging 11–13) from one shared brief; each wrote only its own section folders and put new glossary terms in a separate file, merged here with duplicates dropped. Shared files (glossary, e2e routes, plan test, simulator titles) were changed only here.
- Vendor facts the agents flagged as from memory were checked here (SQS limits and timeouts, Kafka defaults and KIP-848, Redis versions and eviction sampling); illustrative prices (CDN egress) are labelled as assumptions in the lessons.
- As in Prompt 08, lessons don't embed `<Simulator>` for simulators that don't exist yet; meta.json lists them.
- Review of agent work: all 35 Phase 3 resource URLs were fetched; the one dead link (Jay Kreps's "The Log" on engineering.linkedin.com, now 404) was replaced with the Kafka design docs. The Valkey sentence was corrected (forked by former maintainers under the Linux Foundation; Redis 8 added AGPL). S9's hash label now says hash(id) mod N.
- Known content debt across Phases 1–3: in 58–71% of single-answer quiz questions the correct option is noticeably longer than every distractor, a test-taking giveaway (options are shuffled, so position is not). Left for a dedicated pass over all quizzes.

## Prompt 11
- S11–S13 were built by three parallel subagents (one folder each) from a shared brief; S10 was built here. Registry entries, lesson embeds, e2e routes and verification were done here. All four quiz-rebalance and simulator agents were interrupted by a usage limit once and resumed from their saved transcripts.
- S10's challenges were tuned with a parameter sweep so each needs its intended fix, and each was checked over six seeds:
  - **Flush:** no protection peaks at 94–101% DB load, per-server coalescing at about 93%, and the global lock at about 46% (the limit is 70%). With four app servers, per-server coalescing still sends up to four queries per key.
  - **Mass expiry:** none peaks at 86–94%, jitter at 40–52%. Coalescing would also pass, so the challenge rejects it ("fix the cause, not the symptom").
  - **Hit rate:** cache-aside with LFU and a long TTL tops out near 77% because every write deletes a hot key; write-through reaches 83–86%. The target is 82%, and the challenge rejects a bigger cache or the local cache.
- The mass-expiry and flush challenges use a read-only workload. With writes, delete-on-write keeps re-filling the hot keys at random times, which hides the synchronised expiry the challenge is about.
- Missing-id lookups draw from 1,000 fixed absent ids, not unbounded random ones, so caching "not found" has repeats to catch. Truly random ids need a Bloom filter, which the lesson covers and the sim does not.
- Agents' choices kept as reported: Redis HyperLogLog uses 1,024 registers; message-queue commit-after is periodic (1 s) like Kafka auto-commit; the outbox's 1,000-order run uses a `maxOrders` config key that stays set after the challenge (same as `crashAt` in replication).

## Prompt 12
- Written by five parallel subagents (three sections each) from one shared brief, with a raised quality bar sent mid-run at the user's request (primary sources, failure timelines, worked arithmetic, staff-level judgement). Each agent wrote only its own section folders and its own glossary file; the 106 terms merged with no slug collisions. All five were interrupted once by the usage limit and resumed from their saved transcripts.
- Review: all 51 resource URLs fetched (all live); every lesson's Mermaid diagrams rendered in the browser; distributed-locks read in full; vendor facts the agents flagged as from memory were checked (etcd election timeout, Cassandra hint window and gc_grace_seconds, DynamoDB read units, S3 strong consistency, Resilience4j and Envoy outlier-detection defaults, ntpd's 128 ms step threshold, Spanner's 1–7 ms ε, PostgreSQL 18 uuidv7(), RDS Multi-AZ failover time).
- consistency-models had no diagram; a strength-ladder figure was added here.
- Quizzes were held to the rebalance standard from the start (quizcheck passes for all 15).
- Phase 4 has no case study yet, so practiceCaseStudyIds is empty; distributed-locks and chaos-engineering have no simulator in the spec.

## Prompt 13
- The nine simulators were built by six parallel subagents (one folder each) from a shared brief; registry entries, titles, lesson embeds, e2e routes and verification were done here.
- Raft was reviewed against Figure 2 of the paper: the up-to-date check before granting a vote, truncating a conflicting suffix, follower commit = min(leaderCommit, index of last new entry), a leader commits only entries from its current term (with a no-op on election), and restart clears only volatile state.
- Retry storm: with open-loop Poisson clients, the retry budget alone brings the system back; jitter does not, because arrivals are already random. Jitter matters for synchronised clients, so it is shown with the "restart all clients" fault, and the timeouts-retries lesson says so.
- Several sims have more challenges than the minimum (up to four), kept because each tests a different idea.
- Known limitation: in the saga sim the "Recover coordinator" button and the coordinator-crash fault toggle are independent, so the fault chip can stay on after recovery.

## Prompt 14
- Content and simulators were built at the same time by nine parallel subagents (six content, three simulator) from two shared briefs, each confined to its own folders; glossaries, registry entries, titles, lesson embeds, routes and verification were done here. All nine were interrupted once by the usage limit and resumed from their saved transcripts.
- Review: all 52 resource URLs fetched (ACM Queue blocks curl; checked in a browser). Facts the agents flagged as from memory were checked here, among them Facebook's 2018 token reset, Storm-0558, Capital One dates, RFC 9700 (2025), Alertmanager defaults, Prometheus 2.42 keep_firing_for, Go 1.25 GOMAXPROCS, EKS pricing, Terraform 1.10 S3 lockfile, Google's 2016 flaky-test figures. Worked arithmetic was rechecked (burn rates and budget minutes, 0.995^200, histogram series count, KMS cost per day).
- Observability lab has three challenges (one per tricky incident plus "solve all five") instead of the spec's one, and accepts payments or the payment provider as the component for the third-party timeout, since the spec names it "payments 3rd-party timeout".
- Error budget simulates one window from day 0, not a rolling window, and adds "no shipping into an active page" to the workbook's freeze policy; 7- and 28-day windows scale thresholds with the workbook's formula.
- JWT inspector keeps crypto in the view (Web Crypto) and feeds results to the pure model, so model tests are deterministic. alg: none and RS256→HS256 confusion are explained, not run.
- The deployment simulator's title is "Release strategies" (its section); feature flags and dark launches stay in the lesson. A fully promoted bad build can't be rolled back in the sim.
- The glossary e2e test filtered "jwt" and expected exactly one hit; definitions now mention JWT in four terms, so it checks the term appears and the list narrows instead.

## Prompt 15
- Built by twelve parallel subagents: five for the spec sections, three for the extra AI-infrastructure sections, and one each for S-27, S-28 and S-30, each confined to its own folders. Glossaries, registry, titles, plan, embeds, routes and verification were done here. Agents were interrupted twice by the usage limit and resumed from their saved transcripts.
- **Extra scope requested by the user:** six AI-infrastructure sections (orders 13–18, added to week 13 in plan.json, which goes from 10 to 14 hours) and the LLM inference simulator. Its code is S-30 because S-29 belongs to Prompt 16's code labs. The serving-at-scale lesson describes how such systems are typically built from public sources and makes no claims about any provider's internals.
- **Embeddings:** both retrieval sims use LSA vectors (TF-IDF + truncated SVD, built by a committed Python script) rather than a neural model, because nothing may be sent to a service and no model ships offline. The drawers say so. The RAG sim embeds chunks at runtime from build-time word vectors, so any chunking works.
- **RAG online mode** (real generation and LLM-as-judge with an API key) is deferred to Prompt 21, which builds lib/ai and the key settings. `generate()` in rag-pipeline/model.ts is the single place to plug it in. No disabled UI is shown meanwhile.
- **RAG retrieval** is deterministic, so challenges were checked once rather than over seeds. The retriever is a three-way choice (vector, BM25, hybrid) rather than a hybrid toggle. The lean-context target is 90% within 800 tokens, with zero margin on the reference setup.
- **LLM inference:** chat-slo adds a 1,000-token shared system prompt so paged KV and prefix caching are both needed. The 7B model stays memory-bound at long context, so "speculation stops paying at large batch" is shown on 70B TP4. Draft acceptance falls as the draft gets cheaper (an illustrative curve), so "free draft" isn't a trivial answer.
- **Fact fix:** the inference-optimization lesson said fp16 70B "needs 2 GPUs"; it now says 2 just for weights and 4 in practice to leave KV room, matching the simulator's memory model.
- **Accepted limits:** RAG canvas edits are state overrides on top of the Controls panel, so the two can differ until "Use Controls-panel values" is pressed; vector-search dots are mouse-only (item number and ◀ ▶ are the keyboard path); the LLM inference ticker shows placeholder words.

## Prompt 16
- Built by four parallel subagents (three writing labs, one building the engine) from shared briefs, each confined to its own folders; the harnesses, the LRU reference lab, schema, CI test and verification were done here. All four were interrupted once by the usage limit and resumed.
- **Five languages (user request).**
  - Python, JavaScript and TypeScript run in the browser.
  - Java and C++ don't. Compiling them in a tab needs a 30–60 MB toolchain (CheerpJ, clang-in-WASM) that is slow and fragile, so they are bundled into one runnable file instead. The user chose this over in-browser compilers.
  - Only in-browser passes record a challenge result.
- **TypeScript is transpiled, not type-checked, when it runs.** Monaco shows type errors while editing, and CI type-checks every lab .ts file under `strict`.
- **Lab code is outside the app's tsconfig and ESLint.** Lab files are learner code in five languages, so lib/labs/labs.test.ts checks them instead.
- **CI runs every reference solution and every starter in every language:**
  - Python through local `python3` with the same harness the Pyodide worker uses.
  - JavaScript and TypeScript through Node.
  - Java with `java` single-file launch.
  - C++ with the first compiler that actually compiles. The Xcode shim at /usr/bin/c++ can be broken while Command Line Tools work, so SDKROOT is set when needed.
  - Java or C++ cases are skipped, not failed, on a machine without the toolchain.
- **Cross-language determinism.**
  - Hash-based labs (ring, Bloom filter) use FNV-1a 32-bit plus MurmurHash3's fmix32, since plain FNV-1a spread `node#i` labels too unevenly.
  - Merkle uses FNV-1a 64 with RFC 6962 0x00/0x01 domain separation and promotes an odd node instead of duplicating it (CVE-2012-2459).
  - Random tests use mulberry32 or assert bounds only.
- **Behaviour the spec left open** (stated in each lab's "Your task"):
  - The circuit breaker trips on consecutive failures and exposes `allow_request` and `record_*`, so the half-open trial limit is testable.
  - A Snowflake clock that moves backwards raises.
  - Leaky bucket is the queue form.
  - The trie sorts by weight, then by code point.
- **The sandbox is best-effort.** The JS worker hides network and storage globals so learner code can't reach out by accident. It isn't a security boundary, because the code is the learner's own.
- **Backup import:** `lib/db/backup.ts` uses `z.partialRecord`, so exports made before the `labCode` table existed still import.
- Geohash links only to p2-indexing until the ride-sharing case study exists (Prompt 20).

## Prompt 17
- **How it was built.** Three parallel subagents (canvas and engine, icons, templates) built against a contract written here first: `lib/studio/types.ts` (the zod graph), `catalog.ts` (components, defaults, validation, lesson links) and `notes.ts`.
- **Graph format.** `Design.graph` is our own versioned `StudioGraph` (nodes, edges, parentId for frames), not React Flow's raw JSON. It is validated on import and converted to React Flow at the edge, so React Flow internals never reach saved data and Prompt 18's simulator reads a stable format. Case-study `design.json` files (Prompt 20) will use the same format.
- **Templates are practice starters, not answers.** Each of the 19 case templates gives only the givens: clients with user counts, fixed third parties such as a payment provider or a maps/ETA provider, and a problem statement with the scale framed as assumptions. Only "three-tier web app" is a full example. The list includes the four cases the user added (api-gateway, search-engine, instagram, food-delivery). The photo-sharing template never names the company.
- **Notes.** The 7 framework headings each carry the user's six focus areas as prompts, so the notes double as a self-review checklist for Interview Mode (Prompt 19).
- **Export.** PNG/SVG are generated from the graph with the theme's token values inlined, and PNG is that SVG drawn on a 2× canvas, so there is no html-to-image dependency (§2 is fixed). Fonts fall back to system fonts because web fonts aren't embedded.
- **Interaction choices.**
  - Edges float from border to border, because StudioEdge has no handle fields.
  - The clipboard is in-memory for the tab, not the system clipboard.
  - Deleting a frame keeps its contents.
  - Undo history isn't persisted across reloads; saved versions are.
- **Routes.** Designs live only in the browser, so `/studio/[designId]` loads client-side and shows "Design not found" for unknown ids. Smoke tests use `/studio/new`.
- **Limitation.** Resizing a frame doesn't re-check which nodes are inside it; drag a node to move it in or out.

## Prompt 18
- **Built from the session cut off by the usage limit.** The run model, its tests and the editor wiring existed; this session found and fixed one bug before finishing.
- **Availability with shared components.** A single bottom-up pass treats parallel branches as independent, so two servers in front of one database counted the database twice (99.988% instead of 99.890%). Nodes reached by two or more paths are now conditioned exactly (up/down, weighted). Above 12 shared nodes per request type the estimate falls back to the single pass, which overstates availability.

## Prompt 19
- **Layout.** Left = the 7 step panels; centre and right = the full Design Studio editor for the attempt's design, whose Notes tab is the "notes" column. Reusing the editor gives Run mode inside an interview for free, and the canvas also appears in /studio.
- **Persistence.** The running session is a Dexie draft (`interviewDrafts`, one per case), so a reload resumes it. The clock is wall-clock based, so Mock keeps counting across a closed tab. Saving writes an InterviewAttempt and deletes the draft.
- **Scoring.** Every criterion must be scored before saving. Mock subtracts 1 point per hint, Practice nothing. (Amended in 20d: the dashboard and attempt list now apply the penalty too, read back from the stored session.)
- **Hints** are derived from the case meta (clarifying questions, traffic profile, common mistakes), not stored per case, so every case gets them without a new schema field.
- **Comparison.** Both designs run headlessly (steady state) at the case's peak with the case's run challenge. ▲ marks a metric more than 5% worse than the reference.
- **Fixture.** `tests/fixtures/case-studies/fixture-kv-store` loads only when `SDL_FIXTURE_CASES=1` (unit tests, the e2e server).

## Prompt 20
- **Case pages.** `/case-studies` lists cases that have a rubric. `/case-studies/[id]` shows the interviewer's prompt behind a "try it first" fold, the solution, and a side column (reference design, traffic, run challenge, related lessons, common mistakes).
- **Word count.** The spec says 2,500–5,000 words. The test counts prose without code fences and allows up to 5,500, because the richest cases (web-crawler, file-sync) run about 5% over with nothing worth cutting.
- **Diagrams.** The High-level design diagram is the site's `<Diagram>` (Mermaid source inside a `<Figure>`) rather than a bare fenced block, so it gets a caption and an accessible label.
- **Written by six parallel agents** from one brief (`drafts/BRIEF.md`, deleted afterwards), each confined to its own case folders, and checked by `lib/content/case-studies.test.ts`.
- **Queue replication (Run mode).** Queues gained a "Replication factor" prop (default 1, so older designs are unchanged). With 2 or more copies a queue counts as redundant, so a Kafka topic at RF 3 on a request path is not a SPOF. Cost multiplies by it too, because brokers cost money.
- **job-scheduler traffic.** Its `qps` is an ordinary top-of-hour burst (24,600/s) and its peak multiplier of 2 is midnight, not a daily average. The real average (~1,470/s) sizes nothing, and a uniform multiplier can't represent the hour mark. The solution explains this.
- **Run-mode limits the cases work around**, each explained in a note node on the design:
  - Every request type comes from every client in proportion to users.
  - Background paths (fan-out, transcoding, ingestion) are drawn and sized in the prose but carry no Run traffic.
  - A few edges are left off so one request type does not route through another's nodes.
- **Lesson → case links.** Each lesson's `practiceCaseStudyIds` lists up to 3 cases whose `relatedSectionIds` include it, preferring cases that list it earliest.

## Prompt 20d
- **Written by four parallel agents** from one brief, two sections each, built in a scratch folder and copied in whole, then checked by the content test and a quiz balance check (the correct option may be the longest in at most 30% of questions). The scratch folder was deleted afterwards.
- **Hint penalty on the dashboard.** Writing the mock-interview lesson showed that the dashboard trend left out the Mock hint penalty, so the same attempt showed two different scores. `attemptScore()` now reads mode and hints back from the attempt's stored session JSON; no schema change, and older attempts score the same way.
- **Figures** are numbered by section order inside the phase (FIG. 1.1 … FIG. 8.1), as in Phases 1–6.
- **Interview-day checklist.** `final-review` links `/reference/interview-day-checklist`; Prompt 22 must create the cheat sheet with that slug.
- **No company rubrics.** Level expectations describe general patterns and say plainly that they vary by company and interviewer.
- **Week 16 deliverable** asked for "3+ on every rubric row" on a 0–2 scale; it now asks for 80% or more with no row scored 0.

## Prompt 21
- **Browser access.** Anthropic accepts direct browser calls when the client opts in; the official SDK does this with `dangerouslyAllowBrowser: true` (it sends `anthropic-dangerous-direct-browser-access: true`). SDK 1.x sends the key as `Authorization: Bearer`. OpenAI-compatible endpoints vary on CORS, so they go through plain `fetch`, and the network error points to `scripts/ai-proxy`.
- **Retries.** The SDK's own retries are off; `lib/ai/client.ts` retries once after 1.5 s on rate limit, overload, network and timeout, and only if no text has streamed, so a retry never duplicates visible output.
- **Model and effort.** Default model `claude-opus-5-5`. Effort is sent only to models that accept it: low for chat (tutor, interviewer answers), medium for follow-ups and Explain, high for grading. The server-side refusal fallback (`fallbacks: "default"`) is on for models that support it. Unknown models (every OpenAI-compatible one) get token counts but no cost estimate, rather than a guessed price.
- **Prices** are Anthropic list prices per million tokens (Opus 5.5: $4 in, $20 out). Cost is an estimate; the provider's bill is the real number.
- **Tutor context** is the page's `<main>` text (capped at 12,000 characters) plus the lesson topics set by the lesson page, so it works on every page, not only lessons. The last 12 turns are resent; older turns stay stored.
- **AI grading** asks for JSON in a fenced block (works on every provider) and validates it with zod, keeping only known, unique criterion ids. A malformed reply is reported, not guessed at.
- **AI interviewer state** lives in the session (`ai`: asks, follow-ups, feedback), optional so older drafts and attempts still parse. AI asks cost no points in Mock.

## Prompt 21 follow-up · More providers
- **Presets, not a free-for-all.** Gemini, Groq, OpenRouter and OpenAI are presets on the OpenAI chat-completions path with fixed API roots; "Other OpenAI-compatible endpoint" keeps the custom base URL. On 2026-11-04 all four answered a CORS preflight from `http://localhost:3000` allowing `authorization` and `content-type`, so none needs the proxy.
- **No hard-coded model names** for these providers: their catalogues change monthly. "Load models" calls `GET {base}/models` with the learner's key and fills a datalist (Gemini's `models/` prefix is stripped). Anthropic keeps its default `claude-opus-5-5`.
- **stream_options.** Sent for usage counts; if an endpoint rejects it with a 400 that names it, the request is re-sent once without it and tokens are estimated.
- **Cost** stays token-only for non-Anthropic models (no guessed prices).


## Prompt 22
- **Capstone project (the user's call).** The prompt specified a URL shortener. The user asked for something more ambitious that most engineers attempt and fail at, so the capstone is an LLM inference platform. Its stages map to the prompt's stage list: single service, Compose, cache, several instances, rate limiter, queue, Prometheus/Grafana, tracing and k6 all appear. The read replica becomes model replicas plus a router. Every phase 1–7 is linked from at least 2 stages, and a unit test enforces it.
- **Capstone stack.** A Node 22 + TypeScript `node:http` gateway, and llama.cpp `server-b6075` on CPU (an optional CUDA override). Postgres 17.4 (pgvector 0.8.0 from stage 6), Redis 7.4.2, NATS 2.10.26 JetStream, Prometheus v3.2.1, Grafana 11.5.2, Jaeger 2.3.0, k6 0.57.0. Models are pinned by Hugging Face commit and SHA-256: Qwen2.5-0.5B-Instruct Q4_K_M (Q8_0 is the canary), SmolLM2-135M as the fallback, bge-small for embeddings. "Real scale" numbers are labelled assumptions with the arithmetic shown.
- **Capstone validation.** Docker was not running here, so no stage was started. Every stage passes `docker compose config -q`, and the tests parse every TS, YAML, JSON and k6 file. The guide describes output shapes rather than numbers measured on this machine.
- **Capstone code** lives in `content/capstone/stage-*` and is excluded from the app's tsconfig and ESLint. Its dependencies are the learner's, not the app's.
- **Checkbox feedback.** Capstone checkboxes show the click at once and then follow the stored row. A controlled checkbox that only reflected IndexedDB flickered back to unticked until the write landed.
- **Cheat sheets.** The slug is the file name, and a required `group` drives the index. Codes R-01 to R-11 come from `order`. Unknown slugs return 404 (`dynamicParams = false`). Print rules apply only to `[data-print-sheet]` pages.
- **Resource library.** Duplicates by id are merged, with topicIds unioned. Ids that share a URL are merged into the first one. A resource's phases come from the sections that list it and the sections that teach its topics. Search is a plain word filter, because the list is small enough. Two section links moved to https, and the second `grpc-deadlines` id became `grpc-deadlines-guide`.
- **Classics behind bot blocks.** Amazon, Netflix and Uber refuse automated requests. SDI links point to the ByteByteGo chapter pages, and the Netflix and Uber blogs to their homepages.

## Prompt 23
- **Counts come from data.** `PHASES` section and simulator counts and `CASE_STUDY_COUNT` are checked against content and the simulator registry by `lib/curriculum.test.ts`. The landing page and the PhasePath drawing (whose generated markup carried the counts from when it was drawn) read them, so they cannot go stale again.
- **axe scope.** Every route in `tests/e2e/routes.ts`, both themes, 1440 and 375 px, WCAG 2.1 A/AA tags; serious and critical violations fail. The check runs with reduced motion so colours are read at rest, not mid-transition.
- **Accessible names match visible text** (WCAG 2.5.3): sidebar lessons, the search button, flashcards, deck buttons, studio palette items and resource phase filters lost `aria-label`s that replaced their visible text; extra words go in `sr-only` spans.
- **Code colours.** Light code blocks use `github-light-high-contrast`; comment greys in both themes are replaced so every token reaches 4.5:1 on the code background.
- **Cheat-sheet task boxes** render as drawn boxes, not disabled form controls: they are for ticking on paper.
- **Scrollable tables and figures** are focusable regions so keyboard users can scroll them (axe `scrollable-region-focusable`).
- **Closed mobile drawer** is `visibility: hidden` below 1024 px, so its links leave the tab order and the accessibility tree when it is off-screen.
- **Touch targets.** Controls are at least 44×44 px at 375 and 768 px, or have no other target within a 44 px circle (the WCAG 2.5.8 spacing exception). Links inside running text are exempt.
- **Simulator shell is lazy.** Lesson pages load the shell and its chart library only when an embedded simulator mounts.
- **Break-it menu** follows the WAI-ARIA menu pattern: focus moves into it, arrows and Home/End move, Escape closes it and returns focus.
- **First-visit tour** is marked seen when it opens, not when the effect runs, so React Strict Mode's re-run in dev no longer hides it.
- **Service worker: Serwist via `@serwist/turbopack`.** `@serwist/next` needs webpack; the Turbopack variant bundles `app/sw.ts` with esbuild through a force-static route (`/serwist/sw.js`, scope `/`). Precache is the app shell only (CSS, fonts, icons, `/offline`: 30 entries, about 370 KB). JS chunks are not precached because `.next/static` is 26 MB (Monaco, Mermaid, PGlite); pages tell the worker which files they loaded, so a visited page works offline. Navigations and RSC requests are network-first with a 4 s timeout; hashed static files and the jsDelivr/unpkg CDN (Pyodide, Monaco) are cache-first. AI provider hosts, local proxies, other cross-origin hosts and every non-GET are never cached. Limits are first-pass; Prompt 24 finalizes them.
- **Registration** is production-only and waits 3 s after `load`, so it never competes with first paint (and the e2e suite runs about 40% faster than with immediate registration). Tests exercise the real worker; service workers are not blocked.
- **Offline page** is plain server markup with no JS, because its own client chunk would not be cached when it is needed.
- **Error boundaries** call `retry()` (Next 16.4 re-fetches the segment), not `reset()`. No `loading.tsx` on case-study and interview routes: streaming made unknown ids return 200 instead of 404.
- **`.env.example` files are committed.** `.gitignore`'s `.env*` was hiding the capstone's examples (placeholder values only); `!.env.example` re-includes them.
- **Practice links** (Content Standard item 12) are rendered by the lesson page from `meta.practiceCaseStudyIds` plus a Design Studio link, instead of being written into 98 lessons.
- **Content QA** (`pnpm qa:content`): broken references and missing required §7 elements are errors (exit 1); volume targets, missing figures or worked-example headings, and orphan glossary terms are warnings, left for content passes.
- **Monaco dark theme** (`components/labs/monaco-theme.ts`, `sdl-dark`) is vs-dark with a lighter comment colour, because vs-dark's comments fail 4.5:1.
- **Duplicate SVG controls are mouse-only.** Where a simulator drawing repeated an HTML button (CAP, clocks, quorum nodes), the SVG copy is `aria-hidden` and keeps only its click; keyboard and screen-reader users use the HTML button, so there is one control per action in the tab order.
- **Frame rate.** The LLM-inference batch grid renders one memoised component per column, and the shell's metric charts read the history themselves so they copy it only when a new 4 Hz sample arrives, not every frame.

## Design revision · less template, more system (2026-11-05, user request)
- **Why.** The user asked to drop the "AI design slop" markers while keeping the design top tier and system-design specific down to the cursor. CLAUDE.md §5 is updated to match.
- **Retired:** the italic Instrument Serif accent word (the font is no longer loaded), headline periods, heavy negative tracking, uppercase wide-tracked mono labels, § section numbers ("Lesson 2.13" instead), FIG / S-03 / K-00 / B-2.13 codes, spec-label plates, "Rev. A" / "NTS" / "Sheet 05 / 05", rotated depth stamps, filled status pills, hard 3 px offset shadows, crosshair marks on the landing hero, and the default status bar's made-up QPS / P99.
- **Kept:** Archivo + IBM Plex Mono, the Paper and Blueprint palettes, phase colours, the isometric PhasePath and load-balancer drawings, simulator canvases as technical drawings (their uppercase mono labels are drawing annotations), the HUD as telemetry.
- **Lines.** Structure uses `--rule` (ink mixed 48% into paper: 3:1 on Paper, 4.3:1 on Blueprint, WCAG 1.4.11). `.border-ink` and shadcn's `--border` map to it; buttons, inputs and checkboxes keep full ink.
- **Mono means data.** `.fm-cap`, labels, tabs, toggles, card and box heads, table text and captions are sans, sentence case. Mono stays for metrics, units, code, paths, slider ticks and the HUD.
- **System details** (`app/styles/details.css`): a custom cursor (pointer plus a request packet; over anything clickable the packet is wired to a server node), one per theme, with the native cursor as fallback and I-beam kept on text fields; a packet that runs along a prose link's underline on hover; lessons in the sidebar drawn as nodes on the phase's wire (hollow, done, current); loading as a packet crossing a wire; errors as log lines with a status dot; 404 as `404 Not Found`; the default HUD shows the request line (`GET /path`); thin rule-coloured scrollbars; cobalt text selection. All motion stops under reduced motion.
- **Callout boxes** are a coloured left rule with a bold sans head instead of a fully bordered box with an inverted header bar.
- **Figure captions** in content were all caps; they are now sentence case ("Figure 2.1 · Cache-aside · The application fills the cache on a miss"), converted once by script with acronyms and product names kept (API, DNS, mTLS, Kafka, Interview Mode …).
- **Brand mark and favicon.** The tab showed the default Next.js "N". The new mark is one request node fanning out to two servers on a rounded ink tile; it reads at 16 px. `scripts/make-icons.mjs` draws `app/icon.svg`, `app/favicon.ico` (16/32/48 PNG entries) and the PWA icons from the same geometry as `components/brand` `MARK_PATHS`.

## Design Studio tools (2026-11-05, user request)
- **Arrows by clicking.** Dragging from a hover-only edge square was the only pointer way to connect, and the user could not find it. The Arrow tool connects by click, click (sync request, arrow at the target); the edge dots and "Connect to" still work.
- **Hand tool instead of changing the default.** Drag on empty canvas stays box-select in the Select tool (as in Figma and Excalidraw); Hand makes left-drag pan, and scroll or Space + drag pan in any tool. Touch screens pan on drag as before.
- **Focus mode** is a fixed full-window layout over the app shell plus a Fullscreen API request; dialogs still open above it (they portal to the body at a higher z-index). Where the browser refuses full screen, the in-window layout still applies.

## Free-drawn arrows (2026-11-05, user request)
- **Two kinds of arrow, one tool.** A drag that starts and ends on components makes a connection, because connections carry meaning (traffic, SPOF analysis); every other drag makes a free arrow stored in `graph.arrows`. Free arrows are drawings, so the simulator ignores them.
- **No binding.** A free arrow keeps absolute canvas points and does not follow a component when it moves (Excalidraw binds). Binding would need anchor maths on every node move; a connection already gives a following arrow.
- **Curves are one bend point.** A quadratic curve through the dragged middle point (control = 2·mid − average of the ends): one handle, predictable, and it exports to SVG as a single path. Multi-point polylines are left out.

## Prompt 24 · Deploy (2026-11-05)
- **Vercel, not a static export.** The owner's choice. It also fits the code: `/case-studies/[id]`, `/interview/[caseId]` and `/studio/[designId]` render on demand, and the service worker is served from a route handler. `vercel.json` only sets framework, pnpm install and `pnpm build`, and turns off Vercel's own Git deploys of `main` (headers live in `next.config.ts`).
- **Deploys go through CI.** The GitHub Actions `deploy` job runs after the `CI` job passes on a push to `main` (`vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod`, with `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). We chose this over the Git integration plus a required check because only this gives a hard guarantee that a red commit never reaches production. Without the secrets the job skips itself; deleting the `git` block in `vercel.json` hands deploys back to Vercel.
- **No COOP/COEP.** Nothing uses SharedArrayBuffer. PGlite runs single-threaded in the page, Pyodide runs in a plain worker without an interrupt buffer, and nothing reads `crossOriginIsolated`. Isolation headers would only put the CDN loads (Pyodide, Monaco, TypeScript) at risk. The e2e suite asserts the header is absent.
- **CSP** (`lib/security/csp.ts`, one source for the header and for the client check):
  - Pages: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` plus the two CDNs. 'unsafe-inline' is there because Next inlines its bootstrap into static HTML, and nonces would make every page dynamic. There is no 'unsafe-eval' on pages.
  - `connect-src`: self, the five AI providers, the CDNs, and `http://localhost:*` / `http://127.0.0.1:*` for the local proxy.
  - `style-src` keeps 'unsafe-inline' (React Flow, Mermaid, Monaco). `worker-src` is self and blob:.
  - Also set: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
  - The `/labs/*` worker scripts get their own CSP with 'unsafe-eval', because they run learner code with `new Function` and Pyodide. A worker's CSP comes from its own script response, so pages stay eval-free.
- **Custom OpenAI-compatible hosts are blocked by the CSP.** We chose the simplest safe option: no `https:` wildcard in connect-src, which would let any injected script send data anywhere. The AI client checks the base URL before fetching and throws a `blocked` error that names the host and points to `scripts/ai-proxy`. Settings shows the same warning under the Base URL field as soon as you type a host that isn't allowed.
- **Service worker.**
  - Runtime caches are named `sdl-<name>-v2`. On activate the worker deletes every `sdl-` cache from another version, and Serwist's `cleanupOutdatedCaches` removes old precaches.
  - Bump `CACHE_VERSION` only when a cache's contents or strategy change. Normal deploys are handled by the precache revisions.
  - `/serwist/sw.js` is sent `no-store`, so a deploy is picked up on the next visit.
  - The limits from Prompt 23 stay as they are: static 400 entries / 60 days, CDN 80 / 30 days, pages 200, RSC 150, assets 60.
- **Lessons are not precached on install.** The 98 lesson pages weigh 22 MB of HTML (4.5 MB gzipped). Each deploy changes every page, so precaching would re-download them all for every learner on every deploy. A lesson is cached when first opened, and so are the JS files it used, so it then reloads offline. The app shell and `/offline` are precached.
- **Tracing.** `lib/content` reads folders by computed path, so Next traces the whole project into server functions (about 43 MB). `outputFileTracingExcludes` drops `design/`, `prompts/`, the e2e specs and Markdown files.
- **Remote e2e.** With `PLAYWRIGHT_BASE_URL` set, no web server is started and tests that need the fixture case study (`SDL_FIXTURE_CASES`) skip themselves. The no-key AI check uses a real case.
