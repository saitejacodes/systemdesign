import type { SimDefinition } from "@/lib/sim/definition";
import type { Depth } from "@/lib/content/schemas";

export interface SimEntry {
  id: string;
  /** Spec code shown in the header, e.g. "S-03". */
  code: string;
  title: string;
  phase: number;
  depth: Depth;
  sectionIds: string[];
  summary: string;
  models: string[];
  simplifies: string[];
  /** Must match the ids in the module's challenges (checked by registry.test.ts). */
  challengeIds: string[];
  load: () => Promise<{ definition: SimDefinition }>;
}

// Each simulator prompt adds one entry. load() is a dynamic import, so each one is its own chunk.
export const REGISTRY: SimEntry[] = [
  {
    id: "single-server-queue",
    code: "S-00",
    title: "Single-server queue",
    phase: 1,
    depth: "deep",
    sectionIds: ["p1-latency-throughput"],
    summary: "One server, random arrivals. See why latency explodes as utilization nears 100%.",
    models: ["Poisson arrivals at rate λ and exponential service at rate μ (an M/M/1 queue)", "First-come, first-served with an unbounded queue", "Latency = time waiting + time in service"],
    simplifies: ["One server, one queue, no timeouts or retries", "No request is ever dropped", "Service time doesn't depend on the request"],
    challengeIds: ["p99-under-200"],
    load: () => import("./single-server-queue"),
  },
  {
    id: "estimation-calculator",
    code: "S-01",
    title: "Estimation calculator",
    phase: 1,
    depth: "deep",
    sectionIds: ["p1-estimation"],
    summary: "Turn daily users and per-user actions into QPS, storage, bandwidth, servers and cache size, with every formula shown, then practise on 10 timed drills.",
    models: ["Average QPS = users × actions per day ÷ 86,400; peak = average × peak factor", "Storage = writes × payload, per day and year, times retention and replication", "Servers, database reads after a cache and cache size for a hot set of daily reads"],
    simplifies: ["Traffic is spread evenly within the day apart from one peak factor", "Payload sizes are averages; no compression, deduplication or metadata overhead", "Drill inputs are illustrative assumptions, not real company figures"],
    challengeIds: ["five-drills", "speed-drill"],
    load: () => import("./estimation-calculator"),
  },
  {
    id: "request-journey",
    code: "S-02",
    title: "Request journey",
    phase: 1,
    depth: "deep",
    sectionIds: ["p1-client-server", "p1-dns", "p1-http", "p1-tls", "p1-tcp-udp"],
    summary: "Follow one HTTPS request from the browser through DNS, TCP, TLS, a load balancer, app, cache and database, and see where every millisecond goes.",
    models: ["A cold DNS walk (resolver, root, TLD, authoritative) or a cached answer", "TCP and TLS 1.3 handshakes as one round trip each, skipped on a reused connection", "A CDN edge cache hit vs a trip to the origin; HTTP/1.1's 6 connections vs HTTP/2 multiplexing for 12 assets"],
    simplifies: ["Fixed round-trip times with no jitter, bandwidth limit or packet loss (except the injected SYN loss)", "Resolvers normally cache root and TLD answers; the cold walk is a worst case", "No TCP slow start, TLS 0-RTT or HTTP/3"],
    challengeIds: ["fast-first-byte", "biggest-saver"],
    load: () => import("./request-journey"),
  },
  {
    id: "load-balancer",
    code: "S-03",
    title: "Load balancer",
    phase: 1,
    depth: "deep",
    sectionIds: ["p1-load-balancers", "p1-scaling"],
    summary: "Route Poisson traffic across 2–10 servers with five algorithms, then kill, slow down or flake a server and watch health checks react.",
    models: ["Round robin, smooth weighted round robin (nginx's method), least connections, IP hash and random", "Each server has worker slots (capacity × latency) and a bounded queue; beyond it requests are dropped", "Active health checks with an interval and a consecutive-failure threshold; two passes bring a server back"],
    simplifies: ["One load balancer that never fails itself", "Health checks only detect crashes and errors, not slowness (true of plain TCP/HTTP checks)", "No retries, timeouts or connection reuse between LB and servers"],
    challengeIds: ["survive-kill", "heterogeneous", "spike-p99"],
    load: () => import("./load-balancer"),
  },
  {
    id: "consistent-hashing",
    code: "S-04",
    title: "Consistent hashing",
    phase: 2,
    depth: "deep",
    sectionIds: ["p1-load-balancers", "p2-sharding", "p2-consistent-hashing"],
    summary: "Hash keys and nodes onto a 2³² ring, add and remove nodes, and compare how many keys move against key % N.",
    models: ["A hash ring of 2³² positions; each key belongs to the first node clockwise", "V virtual nodes per physical node", "Modulo hashing (hash % N) on the same keys for comparison"],
    simplifies: ["All nodes have equal capacity (no weighted vnodes)", "Moving a key is instant; real systems stream data and must serve reads during the move", "No replication: each key lives on exactly one node"],
    challengeIds: ["even-load", "add-fifth"],
    load: () => import("./consistent-hashing"),
  },
  {
    id: "rate-limiter",
    code: "S-05",
    title: "Rate limiter",
    phase: 2,
    depth: "deep",
    sectionIds: ["p1-load-balancers", "p2-rate-limiting", "p2-api-gateway"],
    summary: "Five rate-limiting algorithms side by side on the same traffic: steady, bursty, a boundary attack and a ramp, plus local vs shared limits across 3 servers.",
    models: ["Token bucket, leaky bucket (as a queue), fixed window, sliding window log and sliding window counter for one client", "Four traffic patterns, including bursts timed on both sides of a window boundary", "Three app servers with local buckets vs one shared counter"],
    simplifies: ["One client; real limiters keep this state per user or per API key", "The shared counter has no network delay or race conditions (real Redis checks cost a round trip)", "Memory figures are rough estimates of the per-user state, not measurements"],
    challengeIds: ["boundary-attack", "token-burst"],
    load: () => import("./rate-limiter"),
  },
];

export const getSim = (id: string) => REGISTRY.find((s) => s.id === id);
