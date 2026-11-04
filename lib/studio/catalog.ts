import type { ComponentKind, PropValue } from "./types";

export interface PropSpec {
  key: string;
  label: string;
  type: "number" | "select" | "boolean" | "text";
  default: PropValue;
  unit?: string;
  min?: number;
  max?: number;
  /** Integer-only numbers (instances, replicas, partitions). */
  int?: boolean;
  options?: string[];
  help?: string;
}

export interface ComponentSpec {
  kind: ComponentKind;
  title: string;
  /** One line for the palette tooltip. */
  blurb: string;
  /** Curriculum phase that teaches it: its palette icon uses var(--phase-N). */
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  /** Lesson to open from the properties panel. */
  sectionId: string;
  props: PropSpec[];
  /** Extra palette search words. */
  keywords: string[];
}

const instances = (d = 2): PropSpec => ({ key: "instances", label: "Instances", type: "number", default: d, min: 1, max: 10_000, int: true });
const latency = (d: number): PropSpec => ({ key: "latencyMs", label: "Latency", type: "number", default: d, unit: "ms", min: 0, max: 60_000 });
const capacity = (d: number, label = "Capacity per instance"): PropSpec => ({ key: "capacityQps", label, type: "number", default: d, unit: "QPS", min: 1, max: 10_000_000 });
const hitRate = (d: number): PropSpec => ({ key: "hitRate", label: "Hit rate", type: "number", default: d, unit: "%", min: 0, max: 100 });

// Defaults are deliberately round, plausible starting points, not benchmarks: learners are expected to change them.
export const CATALOG: Record<ComponentKind, ComponentSpec> = {
  client: { kind: "client", title: "Client", blurb: "Users on web or mobile; where traffic starts.", phase: 1, sectionId: "p1-client-server", keywords: ["user", "browser", "mobile", "app"],
    props: [{ key: "platform", label: "Platform", type: "select", default: "web", options: ["web", "mobile", "both"] }, { key: "users", label: "Users", type: "number", default: 1_000_000, min: 1, max: 10_000_000_000, int: true }] },
  dns: { kind: "dns", title: "DNS", blurb: "Resolves names to addresses; can steer by geography or health.", phase: 1, sectionId: "p1-dns", keywords: ["route53", "resolver", "geo"],
    props: [{ key: "ttlS", label: "TTL", type: "number", default: 60, unit: "s", min: 0, max: 86_400, int: true }] },
  cdn: { kind: "cdn", title: "CDN", blurb: "Edge cache for static and cacheable content.", phase: 3, sectionId: "p3-cdn", keywords: ["edge", "cloudfront", "akamai", "static"],
    props: [hitRate(90), latency(20)] },
  "load-balancer": { kind: "load-balancer", title: "Load Balancer", blurb: "Spreads requests across healthy instances.", phase: 1, sectionId: "p1-load-balancers", keywords: ["lb", "alb", "nlb", "haproxy", "nginx"],
    props: [{ key: "layer", label: "Layer", type: "select", default: "L7", options: ["L4", "L7"] }, { key: "algorithm", label: "Algorithm", type: "select", default: "round-robin", options: ["round-robin", "least-connections", "weighted", "consistent-hash"] }, instances(2), latency(1)] },
  "api-gateway": { kind: "api-gateway", title: "API Gateway", blurb: "Auth, rate limiting and routing at the edge of your services.", phase: 2, sectionId: "p2-api-gateway", keywords: ["gateway", "kong", "envoy", "rate limit"],
    props: [{ key: "rateLimitQps", label: "Rate limit", type: "number", default: 10_000, unit: "QPS", min: 1, max: 10_000_000 }, instances(2), latency(5)] },
  service: { kind: "service", title: "Service", blurb: "Your application code, scaled out behind a load balancer.", phase: 1, sectionId: "p1-scaling", keywords: ["app", "server", "api", "microservice", "backend"],
    props: [{ key: "name", label: "Name", type: "text", default: "api" }, instances(3), capacity(500), latency(20), { key: "stateless", label: "Stateless", type: "boolean", default: true, help: "Stateless instances can be added or replaced freely." }] },
  cache: { kind: "cache", title: "Cache", blurb: "In-memory cache in front of a slower store.", phase: 3, sectionId: "p3-cache-strategies", keywords: ["redis", "memcached", "memory"],
    props: [{ key: "sizeGb", label: "Size", type: "number", default: 16, unit: "GB", min: 0.1, max: 100_000 }, hitRate(80), latency(1)] },
  "sql-db": { kind: "sql-db", title: "SQL DB", blurb: "Relational primary with read replicas.", phase: 2, sectionId: "p2-replication", keywords: ["postgres", "mysql", "relational", "rdbms", "database"],
    props: [{ key: "replicas", label: "Read replicas", type: "number", default: 2, min: 0, max: 15, int: true }, capacity(5_000, "Capacity per node"), latency(5)] },
  "nosql-db": { kind: "nosql-db", title: "NoSQL DB", blurb: "Partitioned key-value or wide-column store.", phase: 2, sectionId: "p2-sql-vs-nosql", keywords: ["cassandra", "dynamodb", "mongodb", "key-value", "database"],
    props: [{ key: "nodes", label: "Nodes", type: "number", default: 3, min: 1, max: 1_000, int: true }, { key: "consistency", label: "Consistency", type: "select", default: "quorum", options: ["one", "quorum", "all"] }, capacity(10_000, "Capacity per node"), latency(5)] },
  "shard-group": { kind: "shard-group", title: "Shard group", blurb: "A database split by key across shards.", phase: 2, sectionId: "p2-sharding", keywords: ["sharding", "partition", "horizontal"],
    props: [{ key: "shards", label: "Shards", type: "number", default: 4, min: 1, max: 4_096, int: true }, capacity(5_000, "Capacity per shard"), latency(5)] },
  queue: { kind: "queue", title: "Queue / Topic", blurb: "Decouples producers from consumers; absorbs bursts.", phase: 3, sectionId: "p3-queues-vs-pubsub", keywords: ["kafka", "sqs", "rabbitmq", "topic", "stream", "pubsub"],
    props: [{ key: "partitions", label: "Partitions", type: "number", default: 6, min: 1, max: 10_000, int: true }, { key: "retentionH", label: "Retention", type: "number", default: 168, unit: "h", min: 0, max: 100_000 }, { key: "replication", label: "Replication factor", type: "number", default: 1, min: 1, max: 7, int: true }] },
  worker: { kind: "worker", title: "Worker", blurb: "Consumes from a queue and does background work.", phase: 3, sectionId: "p3-failure-handling", keywords: ["consumer", "job", "background", "async"],
    props: [instances(2), { key: "processingMs", label: "Processing time", type: "number", default: 50, unit: "ms", min: 0.1, max: 3_600_000 }] },
  "object-storage": { kind: "object-storage", title: "Object Storage", blurb: "Durable blobs: images, video, backups.", phase: 2, sectionId: "p2-object-storage", keywords: ["s3", "blob", "gcs", "files"],
    props: [latency(50)] },
  "search-index": { kind: "search-index", title: "Search Index", blurb: "Inverted index for full-text search.", phase: 2, sectionId: "p2-search", keywords: ["elasticsearch", "opensearch", "lucene", "full-text"],
    props: [{ key: "nodes", label: "Nodes", type: "number", default: 3, min: 1, max: 1_000, int: true }, capacity(2_000, "Capacity per node"), latency(20)] },
  "vector-db": { kind: "vector-db", title: "Vector DB", blurb: "Approximate nearest-neighbour search over embeddings.", phase: 6, sectionId: "p6-embeddings-vector-search", keywords: ["embeddings", "hnsw", "pgvector", "ann"],
    props: [{ key: "nodes", label: "Nodes", type: "number", default: 2, min: 1, max: 1_000, int: true }, capacity(1_000, "Capacity per node"), latency(15)] },
  "llm-api": { kind: "llm-api", title: "LLM API", blurb: "A hosted or self-served model endpoint.", phase: 6, sectionId: "p6-llm-serving", keywords: ["ai", "model", "gpt", "claude", "inference"],
    props: [latency(800), { key: "tokensPerS", label: "Output speed", type: "number", default: 60, unit: "tokens/s", min: 1, max: 100_000 }, { key: "rateLimitRpm", label: "Rate limit", type: "number", default: 1_000, unit: "req/min", min: 1, max: 10_000_000 }] },
  monitoring: { kind: "monitoring", title: "Monitoring", blurb: "Metrics, logs, traces and alerts.", phase: 5, sectionId: "p5-metrics", keywords: ["prometheus", "grafana", "observability", "logs", "alerts"],
    props: [] },
  "external-api": { kind: "external-api", title: "External API", blurb: "A third-party dependency you don't control.", phase: 4, sectionId: "p4-timeouts-retries", keywords: ["third-party", "payment", "stripe", "vendor"],
    props: [latency(200), { key: "rateLimitQps", label: "Rate limit", type: "number", default: 100, unit: "QPS", min: 1, max: 10_000_000 }] },
  frame: { kind: "frame", title: "Region / AZ frame", blurb: "A labelled box that groups components, like a region or availability zone.", phase: 6, sectionId: "p6-multi-region", keywords: ["region", "az", "zone", "group", "vpc", "boundary"],
    props: [{ key: "scope", label: "Scope", type: "select", default: "region", options: ["region", "az", "vpc", "group"] }] },
};

/**
 * Run-mode inputs every runnable component also has (Prompt 18): availability of ONE instance/node and its monthly cost.
 * Defaults are illustrative, not vendor SLAs: managed, internally replicated services start at 99.99%, things you run at 99.9%.
 */
const MANAGED: ReadonlySet<ComponentKind> = new Set(["dns", "cdn", "load-balancer", "api-gateway", "object-storage", "monitoring"]);
export function runProps(kind: ComponentKind): PropSpec[] {
  if (kind === "client" || kind === "frame") return [];
  return [
    { key: "availabilityPct", label: "Availability (one instance)", type: "number", default: MANAGED.has(kind) ? 99.99 : kind === "llm-api" ? 99.5 : 99.9, unit: "%", min: 0, max: 100, help: "Used by the availability estimate in Run mode. An assumption: set your provider's SLA if you know it." },
    { key: "costPerMonth", label: "Cost per instance", type: "number", default: 0, unit: "$/month", min: 0, max: 100_000_000, help: "Optional. Run mode multiplies it by the instance or node count." },
  ];
}

/** Catalog properties followed by the run-mode properties: what the properties panel shows. */
export const allProps = (kind: ComponentKind): PropSpec[] => [...CATALOG[kind].props, ...runProps(kind)];

export function defaultProps(kind: ComponentKind): Record<string, PropValue> {
  return Object.fromEntries(allProps(kind).map((p) => [p.key, p.default]));
}

/** Validation message for one property value, or null if it is fine. */
export function validateProp(spec: PropSpec, value: PropValue): string | null {
  if (spec.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return `${spec.label} must be a number`;
    if (spec.int && !Number.isInteger(value)) return `${spec.label} must be a whole number`;
    if (spec.min !== undefined && value < spec.min) return `${spec.label} must be at least ${spec.min}${spec.unit ? ` ${spec.unit}` : ""}`;
    if (spec.max !== undefined && value > spec.max) return `${spec.label} must be at most ${spec.max}${spec.unit ? ` ${spec.unit}` : ""}`;
  }
  if (spec.type === "select" && !spec.options?.includes(String(value))) return `${spec.label} must be one of ${spec.options?.join(", ")}`;
  if (spec.type === "boolean" && typeof value !== "boolean") return `${spec.label} must be on or off`;
  return null;
}
