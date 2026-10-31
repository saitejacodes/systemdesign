Read CLAUDE.md. Task: add a "Run" mode to the Design Studio that simulates traffic
through the learner's design. Put the model in /lib/studio/sim (pure, tested).

1. Traffic config: total QPS from clients, read:write ratio, peak multiplier,
   request types (up to 3, each with a path through the graph defined by edges from Client).
2. Flow model (steady-state, recomputed every 500ms sim time, with smoothing):
   - Traffic enters at clients, follows outgoing sync edges.
   - LB/gateway split traffic across targets (per algorithm, weighted by capacity).
   - Cache/CDN: hit fraction returns; misses continue downstream.
   - Reads may go to replicas if a read-replica edge exists; writes go to primary.
   - Async edges: traffic to queue returns immediately to caller; workers consume at
     their capacity; queue depth grows if inflow > consumption.
   - Utilization ρ = incoming QPS / (instances × capacity per instance).
   - Node latency = base latency / (1 − ρ) for ρ < 0.95; for ρ ≥ 0.95 cap latency and
     drop excess requests (count as errors).
   - End-to-end latency per request type = sum along path (sync only); p99 approximated
     as mean × factor based on ρ (document the approximation in the simplifies drawer).
3. Visualization: edges animate with thickness ∝ QPS; nodes colored by utilization
   (with text labels: OK / Hot / Overloaded, not color alone); tooltips show QPS,
   ρ, latency, errors; queue nodes show depth.
4. Analysis panel:
   - Bottlenecks: nodes with ρ > 0.8, sorted.
   - SPOF detection: for each node, check if removing it disconnects any client from any
     datastore/required service (graph reachability); list SPOFs.
   - Availability estimate using component availability (series/parallel derived from graph).
   - Cost estimate (optional per-node $/month input).
5. Failure injection: click any node → kill / slow down; watch reroutes, errors, and
   queue growth. Scenario buttons: "Traffic ×10", "Lose an AZ" (kills all nodes in a frame),
   "Cache flush" (hit rate → 0 then recovers over 60s).
6. Challenges per case-study template (data-driven): e.g. "Handle 50k QPS reads with
   p99 < 200ms, zero SPOFs".

Definition of Done: CLAUDE.md §8; unit tests: utilization math, cache split, SPOF detection on 4 sample graphs.
