Read CLAUDE.md §5 and §7. Task: build the reference layer.

1. /reference and /reference/[sheet] with cheat sheets in /content/cheatsheets (one MDX
   each, styled as Field Manual spec sheets, printable via a print stylesheet):
   latency numbers; availability nines & math; estimation formulas & conversions;
   database selection guide; caching strategy guide; consistency models; messaging
   semantics; reliability patterns; the 7-step framework (1-page, matching Phase 7);
   "tradeoffs glossary" (50 common tradeoffs, one line each); interview day checklist.
2. /resources: library from resources.json (aggregate all section resources + extra):
   filter by topic, phase (derived from topicIds), kind and free/paid; search.
   Include the classics:
   Designing Data-Intensive Applications (Kleppmann), System Design Interview Vol 1 & 2
   (Alex Xu), Google SRE Book & Workbook (free online), Release It! (Nygard),
   The System Design Primer (GitHub), High Performance Browser Networking (free),
   Dynamo, Bigtable, Spanner, Raft papers, plus engineering blogs (Netflix, Uber, Discord,
   Stripe, Cloudflare, Meta, Shopify). Never fabricate URLs; if unsure, link the
   publisher/blog homepage.
3. /capstone: a step-by-step guide (10 stages) to build a URL shortener with analytics
   LOCALLY (clearly state it runs on the learner's machine, not in the browser):
   stage 1 single service + Postgres → 2 Docker Compose → 3 Redis cache-aside →
   4 two app instances behind Nginx → 5 read replica → 6 rate limiter → 7 click events
   to a queue (Redpanda or RabbitMQ) + consumer → 8 Prometheus + Grafana dashboards →
   9 OpenTelemetry tracing (Jaeger) → 10 load testing with k6.
   Provide full, working code for each stage (Node.js/TypeScript or Python: pick one,
   note it in DECISIONS.md): docker-compose.yml, service code, config files, k6 scripts.
   Include a "Break it" checklist (8 experiments: kill cache, kill replica, kill one app
   instance, slow DB with tc/netem or a sleep injection, flood traffic, fill disk
   (simulated), restart broker, clock skew discussion) with what to observe and how to fix.
   Each stage has checkboxes saved as CheckpointState rows (ids "capstone-<stage>-<n>")
   so they appear in progress and backups.
   Also offer the whole capstone as a downloadable zip generated in-browser (JSZip).

Definition of Done: CLAUDE.md §8. Capstone code must be syntactically valid
(lint the code files in CI) and the compose file must validate with `docker compose config`
if Docker is available; otherwise note it.
