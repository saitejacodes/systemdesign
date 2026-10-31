Read CLAUDE.md §6 and the framework from Prompt 05. Build these 5 simulators. Each gets
model.ts, view.tsx, config.ts, challenges.ts, model.test.ts, a guided tour, and a
models/simplifies drawer. Embed S1–S3 in their lesson sections. S4 and S5 belong to
Phase 2 sections that don't exist yet: for now, embed S4 in load-balancers and S5 in
load-balancers as 'Related simulator'. Prompt 08 embeds them in their own sections.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S1. estimation-calculator (section: estimation)
 Inputs: DAU, actions/user/day per action type (up to 4 rows: name, count, read|write,
 payload bytes), peak factor, retention years, replication factor, cache hit target.
 Outputs (live): avg & peak QPS per action and total; read:write ratio; storage/day,
 /year, total with replication; ingress/egress bandwidth; servers needed (input: QPS
 per server); cache memory for hot set (input: hot %).
 Show the formula for each output with the numbers substituted.
 Drill mode: 10 scenarios (Twitter, Instagram, WhatsApp, YouTube, Uber, Dropbox,
 URL shortener, Google Docs, Netflix, Slack). Learner enters estimates; accept within
 ±50% (order-of-magnitude thinking); show model answer with reasoning. Label scenario
 inputs as illustrative assumptions, not real company figures.
 Challenges: complete 5 drills within tolerance; complete a drill in under 3 minutes.

S2. request-journey (section: client-server / dns / http / tls)
 Step-through animation: browser cache → DNS (recursive, root, TLD, authoritative) →
 TCP handshake → TLS handshake → LB → app server → cache (hit/miss toggle) → DB → response.
 Each step shows elapsed ms (editable RTT inputs) and a 2–3 sentence explanation.
 Toggles: DNS cached, connection reused, HTTP/2 vs HTTP/1.1, cache hit, CDN in front.
 Total latency breakdown bar.
 Challenges: get first-byte time under 100ms for a user 150ms RTT away (needs CDN +
 reuse + DNS cache); explain which toggle saved the most (multiple choice).

S3. load-balancer (section: load-balancers)
 Model: N servers (2–10), each with capacity (req/s) and base latency; Poisson traffic;
 algorithms: round robin, weighted round robin, least connections, IP hash, random.
 Health checks with interval and failure threshold; LB stops routing after threshold.
 Faults: kill server, make server slow (latency ×5), make server flaky (30% errors),
 traffic spike (×3 for 10s).
 Metrics: per-server load and connections, error rate, p50/p95/p99, dropped requests.
 View: LB drawn as an isometric plate fanning out to isometric server blocks; animated
 request dots; server fill = load; OK / Hot / Overloaded labels.
 Challenges: keep error rate < 1% while one server is killed; pick the algorithm that
 handles heterogeneous servers best (weighted); keep p99 < 300ms during a spike.

S4. consistent-hashing (section: sharding (Phase 2) and load-balancers)
 Model: hash ring (0–2³²), nodes with V virtual nodes each, K keys (100–10,000).
 Actions: add node, remove node, change V. Compare mode: modulo hashing (key % N).
 Metrics: keys per node (bar chart), std deviation of load, % keys moved on last change
 (consistent vs modulo, side by side).
 View: circular ring with node and key positions; moved keys flash.
 Challenges: keep load std dev < 10% of mean with 5 nodes (needs vnodes);
 show that adding a node to 4 moves ≈ 1/5 of keys with consistent hashing vs ≈ 80% with modulo.

S5. rate-limiter (section: rate-limiting (Phase 2), linked from Phase 1)
 Algorithms side by side on the SAME traffic: token bucket (capacity, refill rate),
 leaky bucket (queue size, leak rate), fixed window (limit, window), sliding window log,
 sliding window counter.
 Traffic patterns: steady, bursty, boundary attack (burst at window edge), ramp.
 Metrics per algorithm: allowed, rejected, max burst allowed, memory per user (estimated).
 Distributed mode toggle: 3 app servers with local limiters vs one shared Redis counter
 (simulated): show over-admission with local limits.
 Challenges: find the boundary-attack weakness in fixed window; configure token bucket
 to allow bursts of 20 but average 5/s.

Definition of Done: CLAUDE.md §8; each simulator's tests pass; S1–S3 embedded in their
sections and S4–S5 embedded in load-balancers.
