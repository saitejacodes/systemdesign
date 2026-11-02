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
  {
    id: "sql-sandbox",
    code: "S-06A",
    title: "SQL sandbox",
    phase: 2,
    depth: "deep",
    sectionIds: ["p2-indexing", "p2-transactions", "p2-data-modeling"],
    summary: "A real PostgreSQL (PGlite) in your browser with a social-and-shop dataset, EXPLAIN plan trees and 15 auto-checked exercises on indexing, modeling and transactions.",
    models: ["PostgreSQL compiled to WebAssembly (PGlite): the real planner, MVCC, constraints and EXPLAIN ANALYZE", "50,000 users, 200,000 posts, 300,000 follows, 100,000 orders, 250,000 order items, 1,000 products, generated deterministically", "Exercise checkers that inspect your results, the live query plan and the schema"],
    simplifies: ["One connection in one browser tab: no concurrency between sessions (the isolation lab simulates that)", "Small data next to production: timings are milliseconds where a real table would take seconds, but plan shapes are the same", "Everything resets when you reload or press Reset database"],
    challengeIds: ["track-indexing", "track-modeling", "track-transactions"],
    load: () => import("./sql-sandbox"),
  },
  {
    id: "isolation-lab",
    code: "S-06B",
    title: "Isolation lab",
    phase: 2,
    depth: "deep",
    sectionIds: ["p2-transactions", "p2-locking"],
    summary: "Two sessions side by side on a simulated Postgres MVCC engine. Replay dirty reads, non-repeatable reads, phantoms, lost updates and write skew at each isolation level.",
    models: ["Row versions with xmin/xmax and snapshots: one per statement in READ COMMITTED, one per transaction in REPEATABLE READ and SERIALIZABLE (taken at the first statement, as Postgres does)", "Row locks for UPDATE and SELECT … FOR UPDATE: the second writer waits; READ COMMITTED then re-checks the newest version, the stricter levels fail with 40001", "SERIALIZABLE as Postgres's SSI: read→write dependencies between serializable transactions; the one completing a dangerous cycle gets 40001"],
    simplifies: ["A small TypeScript engine, not Postgres itself: PGlite has one connection per database, so it can't run two concurrent sessions", "It reproduces Postgres's documented results for these five scenarios, including the 40001 failure for write skew under SERIALIZABLE, but not every edge case (no deletes, predicate locks are table-wide, no read-only optimisations)", "Fixed schedules: the app logic (e.g. reading 10 and writing 11) is scripted; there is no deadlock detection because these schedules never deadlock"],
    challengeIds: ["two-fixes", "stop-write-skew", "all-anomalies"],
    load: () => import("./isolation-lab"),
  },
  {
    id: "index-visualizer",
    code: "S-07",
    title: "Index visualizer",
    phase: 2,
    depth: "deep",
    sectionIds: ["p2-indexing"],
    summary: "Feed the same keys to a B-tree and an LSM tree. Watch nodes split, memtables flush and SSTables compact, and compare write amplification and read cost.",
    models: ["A B-tree of order 3–5 with node splits on insert and borrow/merge on delete; each batch writes every page it dirtied", "An LSM tree: memtable → L0 SSTables → leveled compaction into L1 and L2, with tombstones for deletes", "Reads: B-tree root-to-leaf; LSM memtable, then newest-first files with fence pointers and optional ~1% false-positive Bloom filters"],
    simplifies: ["Nodes are drawn with 2–4 keys so splits are visible, but costs assume real 4 KB pages and 100-byte entries", "No write-ahead log, buffer pool eviction or page compression on the B-tree side; no size-tiered compaction on the LSM side", "Costs count bytes and files, not time: sequential vs random disk speed is left to the lesson"],
    challengeIds: ["write-cost", "bloom-reads"],
    load: () => import("./index-visualizer"),
  },
  {
    id: "replication",
    code: "S-08",
    title: "Replication",
    phase: 2,
    depth: "deep",
    sectionIds: ["p2-replication"],
    summary: "Replicate a leader's log to 2–4 followers in async, semi-sync or sync mode, then crash the leader, partition the network or spike a follower's lag and watch stale reads and lost writes.",
    models: ["A leader log with sequence numbers, shipped over FIFO per-link channels with an adjustable delay and jitter; acks travel back the same way", "Async acks on the leader write, semi-sync after the first follower ack, sync after every live follower; read-your-writes and monotonic (sticky-follower) reads", "Leader crash with a failover timeout that promotes the most up-to-date follower; acknowledged writes it never received are counted and listed as lost"],
    simplifies: ["Failover is automatic and instant once the timeout fires: no election protocol, no split brain, no fencing of the old leader", "Reads and the leader's local commit take no service time, and nodes never overload; only replication delay adds latency", "A partition holds messages and delivers them all on heal (like TCP retransmits); sync writes stall forever rather than timing out"],
    challengeIds: ["read-your-writes", "no-lost-writes"],
    load: () => import("./replication"),
  },
  {
    id: "sharding",
    code: "S-09",
    title: "Sharding",
    phase: 2,
    depth: "deep",
    sectionIds: ["p2-sharding"],
    summary: "Split 10,000 users across 4–16 shards by id range, name range, hash or a directory; skew the traffic, add shards, tame a celebrity and see what moves.",
    models: ["Per-user traffic that is uniform or Zipf by rank (low ids hottest), summed per shard against a 2,500 req/s capacity", "Four placement strategies and the share of data each moves when a shard is added (rehash vs splitting the hot range or shard)", "Hot-key fixes: salting a key across every shard, or a dedicated shard via the directory, and the cost in shards touched by a friends' feed query"],
    simplifies: ["Every user stores the same amount of data, so data moved is the share of users that changed shard", "Load is expected traffic plus Poisson noise; there are no queues, latency or replication", "Moves are instant; real systems copy data in the background while still serving reads and writes"],
    challengeIds: ["zipf-balance", "celebrity"],
    load: () => import("./sharding"),
  },
];

export const getSim = (id: string) => REGISTRY.find((s) => s.id === id);
