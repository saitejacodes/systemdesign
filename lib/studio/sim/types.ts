import { z } from "@/lib/zod";
import { COMPONENT_KINDS } from "../types";

/*
 * Run mode (Prompt 18): a steady-state flow model of a StudioGraph. Contract shared by the model (lib/studio/sim/model.ts),
 * the Run-mode UI, the case-study run challenges (content/case-studies/<id>/meta.json) and their design.json tests.
 *
 * Routing rules (the model implements exactly these; the "What it simplifies" drawer explains them):
 * - Each request type starts at every client node (split by the client's `users`) and ends at its DESTINATION SET: the alive
 *   nodes of `target.kinds` (or the one `target.nodeId`) reachable from the client. Traffic only follows edges from which a
 *   destination is still reachable, so a "static" type goes client → CDN → object storage while "read" goes client → LB → …
 * - sync edges carry the request and its latency; async edges hand it to a queue, which returns to the caller at once.
 * - load-balancer / api-gateway split across their candidate targets: round-robin and consistent-hash evenly, weighted and
 *   least-connections by capacity (instances × capacityQps). Dead targets are excluded (that is how failover shows up).
 * - Any other node with several candidates: if one candidate is a cache (cache-aside), reads go to the cache first and only
 *   the misses go to the other candidates; writes skip the cache. Otherwise traffic splits evenly.
 * - A cache or CDN that is NOT a destination answers `hitRate` of reads and forwards the misses (and all writes).
 * - sql-db: writes go to the primary, reads spread over primary + `replicas`; read traffic also splits across sql-db nodes
 *   linked to it by a replication edge (writes never do).
 * - Capacity: instances × capacityQps (service), nodes/shards × capacityQps (nosql, shard-group, search, vector),
 *   (1 + replicas) × capacityQps for reads on sql-db, instances × 1000 / processingMs (worker). Rate limits drop the excess
 *   (api-gateway rateLimitQps, external-api rateLimitQps, llm-api rateLimitRpm / 60). Clients, DNS, CDN, LB, object storage
 *   and monitoring have no capacity limit.
 * - ρ = incoming QPS / capacity. Latency = latencyMs / (1 − ρ) for ρ < 0.95; at ρ ≥ 0.95 latency is capped at 20× and the
 *   QPS above 0.95 × capacity is dropped (errors). A queue's depth grows by (inflow − consumption) × dt and never goes below 0;
 *   its workers are the worker nodes it has edges to.
 * - End-to-end mean latency per request type = traffic-weighted sum of node latencies along sync hops. p99 ≈ mean × (1 + 3.6 ρ*),
 *   where ρ* is the highest ρ on the type's path (1 at an idle system, ≈ 4.6 = ln 100 for an M/M/1 queue near saturation).
 * - Recomputed every 0.5 s of sim time; displayed values move toward the new steady state with exponential smoothing (τ = 1.5 s).
 */

export const RequestType = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(60),
  op: z.enum(["read", "write"]),
  /** Relative share among request types with the same op. */
  weight: z.number().positive(),
  target: z.strictObject({ kinds: z.array(z.enum(COMPONENT_KINDS)).min(1).optional(), nodeId: z.string().optional() })
    .refine((t) => (t.kinds?.length ?? 0) > 0 || !!t.nodeId, "target needs kinds or nodeId"),
});
export type RequestType = z.infer<typeof RequestType>;

export const TrafficProfile = z.strictObject({
  /** Average total QPS from all clients. */
  qps: z.number().positive(),
  /** Reads per write (100 means 100:1). */
  readWriteRatio: z.number().positive(),
  /** Multiplies qps while the "Peak" toggle is on. */
  peakMultiplier: z.number().min(1).max(100),
  requestTypes: z.array(RequestType).min(1).max(3),
});
export type TrafficProfile = z.infer<typeof TrafficProfile>;

export const SCENARIOS = ["traffic-x10", "lose-az", "cache-flush"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const RunChallenge = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Run at peak (qps × peakMultiplier). */
  atPeak: z.boolean().default(false),
  /** Optional scenario applied after 10 s; "lose-az" kills the frame with scope "az" that holds the most components. */
  scenario: z.enum(SCENARIOS).optional(),
  /** Sim seconds to run before checking (checked on the final state). */
  durationS: z.number().min(5).max(600).default(60),
  targets: z.strictObject({
    minOkQps: z.number().positive().optional(),
    maxP99Ms: z.number().positive().optional(),
    maxErrorRatePct: z.number().min(0).max(100).optional(),
    maxSpofs: z.number().int().min(0).optional(),
    minAvailabilityPct: z.number().min(0).max(100).optional(),
    maxCostPerMonth: z.number().min(0).optional(),
  }).refine((t) => Object.values(t).some((v) => v !== undefined), "at least one target"),
});
export type RunChallenge = z.infer<typeof RunChallenge>;

export type NodeStatus = "ok" | "hot" | "overloaded" | "down";

export interface SimNodeState {
  id: string;
  inQps: number;
  okQps: number;
  droppedQps: number;
  /** Utilization; 0 for nodes without a capacity limit. */
  rho: number;
  latencyMs: number;
  /** ok ρ < 0.8, hot 0.8–0.95, overloaded ≥ 0.95, down when killed. Always shown with its text label. */
  status: NodeStatus;
  queueDepth?: number;
  /** Current hit rate for caches/CDNs (drops to 0 on a cache flush, recovers over 60 s). */
  hitRate?: number;
}

export interface RequestTypeResult { id: string; name: string; offeredQps: number; okQps: number; errorQps: number; meanMs: number; p99Ms: number; reachable: boolean }

export interface Faults {
  killed: string[];
  /** Slowed nodes run at latency × 5 and capacity ÷ 5. */
  slowed: string[];
  trafficMultiplier: number;
  peak: boolean;
  /** Sim time of the last cache flush; hit rates ramp linearly from 0 back to configured over 60 s. */
  cacheFlushAt?: number;
}

export interface SimState {
  t: number;
  nodes: Record<string, SimNodeState>;
  /** QPS on each edge. */
  edges: Record<string, number>;
  requestTypes: RequestTypeResult[];
  totals: { offeredQps: number; okQps: number; errorQps: number; errorRatePct: number };
}

export interface Analysis {
  /** Nodes with ρ > 0.8, highest first. */
  bottlenecks: { id: string; rho: number }[];
  /** Nodes whose removal disconnects some client from some destination and that have no internal redundancy. */
  spofs: { id: string; disconnects: { clientId: string; requestTypeId: string }[] }[];
  /** Cut vertices that are internally redundant (instances/nodes/replicas ≥ 2, or a managed kind: DNS, CDN, object storage, monitoring). */
  redundantCuts: string[];
  /** Per request type and overall (traffic-weighted), from per-instance availability: parallel inside a node and across split targets, series along a path. */
  availabilityPct: number;
  availabilityByType: Record<string, number>;
  /** Σ costPerMonth × instances (or nodes/shards/(1+replicas)). */
  costPerMonth: number;
}

export interface ChallengeCheck { passed: boolean; results: { key: keyof RunChallenge["targets"]; label: string; actual: number; target: number; passed: boolean }[] }
