import { describe, expect, it } from "vitest";
import { defaultProps } from "../catalog";
import { templateById } from "../templates";
import type { ComponentKind, EdgeKind, PropValue, StudioGraph, StudioNode } from "../types";
import {
  analyze, azToLose, defaultProfile, evaluateChallenge, frameMembers, initSim, NO_FAULTS, steadyState, stepSim,
  type Faults, type RequestType, type RunChallenge, type SimState, type TrafficProfile,
} from "./index";

// ---------- Builders ----------

type N = [id: string, kind: ComponentKind, props?: Record<string, PropValue>, parentId?: string];
type E = [source: string, target: string, kind?: EdgeKind];

function graph(nodes: N[], edges: E[]): StudioGraph {
  return {
    version: 1,
    nodes: nodes.map(([id, kind, props, parentId]): StudioNode => ({
      id, kind, x: 0, y: 0, label: id, props: { ...defaultProps(kind), ...props }, ...(parentId ? { parentId } : {}),
    })),
    edges: edges.map(([source, target, kind = "sync"]) => ({ id: `${source}>${target}`, source, target, kind, direction: "forward" as const })),
  };
}

const read = (kinds: ComponentKind[], id = "read"): RequestType => ({ id, name: "Read", op: "read", weight: 1, target: { kinds } });
const write = (kinds: ComponentKind[], id = "write"): RequestType => ({ id, name: "Write", op: "write", weight: 1, target: { kinds } });
const profile = (qps: number, requestTypes: RequestType[], readWriteRatio = 10): TrafficProfile => ({ qps, readWriteRatio, peakMultiplier: 3, requestTypes });
const faults = (f: Partial<Faults> = {}): Faults => ({ ...NO_FAULTS, ...f });
const run = (g: StudioGraph, p: TrafficProfile, f: Faults, steps: number, from?: SimState) => {
  let s = from ?? initSim(g, p);
  for (let i = 0; i < steps; i++) s = stepSim(g, p, s, f);
  return s;
};

/** client → service (2 × 100 QPS, 10 ms) → NoSQL with effectively unlimited capacity and no latency. */
const simple = (svc: Record<string, PropValue> = {}) =>
  graph([["c", "client"], ["svc", "service", { instances: 2, capacityQps: 100, latencyMs: 10, ...svc }], ["db", "nosql-db", { nodes: 1, capacityQps: 1e7, latencyMs: 0 }]], [["c", "svc"], ["svc", "db"]]);
const readNosql = (qps: number) => profile(qps, [read(["nosql-db"])]);

// ---------- Flow model ----------

describe("utilization and latency", () => {
  it("ρ = in / (instances × capacity) and latency = base / (1 − ρ)", () => {
    const s = steadyState(simple(), readNosql(100), NO_FAULTS);
    expect(s.nodes.svc.rho).toBeCloseTo(0.5);
    expect(s.nodes.svc.latencyMs).toBeCloseTo(20);
    expect(s.nodes.svc.status).toBe("ok");
    const hot = steadyState(simple(), readNosql(180), NO_FAULTS);
    expect(hot.nodes.svc.rho).toBeCloseTo(0.9);
    expect(hot.nodes.svc.latencyMs).toBeCloseTo(100);
    expect(hot.nodes.svc.status).toBe("hot");
    expect(hot.totals.errorQps).toBe(0);
  });

  it("at ρ ≥ 0.95 latency caps at 20× and the QPS above 0.95 × capacity is dropped", () => {
    const s = steadyState(simple(), readNosql(400), NO_FAULTS);
    expect(s.nodes.svc.rho).toBeCloseTo(2);
    expect(s.nodes.svc.latencyMs).toBeCloseTo(200);
    expect(s.nodes.svc.status).toBe("overloaded");
    expect(s.nodes.svc.droppedQps).toBeCloseTo(210);
    expect(s.nodes.db.inQps).toBeCloseTo(190);
    expect(s.totals.okQps).toBeCloseTo(190);
    expect(s.totals.errorRatePct).toBeCloseTo(52.5);
  });

  it("slowed nodes run at latency × 5 and capacity ÷ 5", () => {
    const s = steadyState(simple(), readNosql(20), faults({ slowed: ["svc"] }));
    expect(s.nodes.svc.rho).toBeCloseTo(0.5);
    expect(s.nodes.svc.latencyMs).toBeCloseTo(100);
  });

  it("peak and traffic multiplier scale qps", () => {
    expect(steadyState(simple(), readNosql(10), faults({ peak: true })).totals.offeredQps).toBeCloseTo(30);
    expect(steadyState(simple(), readNosql(10), faults({ peak: true, trafficMultiplier: 10 })).totals.offeredQps).toBeCloseTo(300);
  });

  it("p99 = mean × (1 + 3.6 ρ*) with ρ* the busiest node on the path", () => {
    const s = steadyState(simple(), readNosql(100), NO_FAULTS);
    const r = s.requestTypes[0];
    expect(r.meanMs).toBeCloseTo(20);
    expect(r.p99Ms).toBeCloseTo(20 * (1 + 3.6 * 0.5));
    const idle = steadyState(simple(), readNosql(0.0001), NO_FAULTS).requestTypes[0];
    expect(idle.p99Ms / idle.meanMs).toBeCloseTo(1, 4);
  });

  it("splits reads and writes by readWriteRatio and request types by weight", () => {
    const p = profile(110, [read(["nosql-db"], "a"), { ...read(["nosql-db"], "b"), weight: 3 }, write(["nosql-db"])]);
    const s = steadyState(simple({ capacityQps: 1e6 }), p, NO_FAULTS);
    expect(s.requestTypes.map((r) => r.offeredQps)).toEqual([25, 75, 10].map((v) => expect.closeTo(v)));
  });

  it("a request type with no reachable destination is all errors", () => {
    const g = graph([["c", "client"], ["x", "external-api"]], []);
    const s = steadyState(g, profile(50, [read(["sql-db"])]), NO_FAULTS);
    expect(s.requestTypes[0]).toMatchObject({ reachable: false, okQps: 0, errorQps: 50 });
    expect(s.totals.errorRatePct).toBe(100);
  });

  it("splits client traffic by users", () => {
    const g = graph([["a", "client", { users: 3 }], ["b", "client", { users: 1 }], ["db", "nosql-db"]], [["a", "db"]]);
    const s = steadyState(g, readNosql(100), NO_FAULTS);
    expect(s.requestTypes[0].okQps).toBeCloseTo(75);
    expect(s.requestTypes[0].errorQps).toBeCloseTo(25);
    expect(s.requestTypes[0].reachable).toBe(true);
  });
});

describe("caches", () => {
  const aside = graph(
    [["c", "client"], ["svc", "service", { capacityQps: 1e6 }], ["cache", "cache", { hitRate: 80 }], ["db", "sql-db", { replicas: 0, capacityQps: 1e6 }]],
    [["c", "svc"], ["svc", "cache"], ["svc", "db"]],
  );
  const inline = graph(
    [["c", "client"], ["svc", "service", { capacityQps: 1e6 }], ["cache", "cache", { hitRate: 80 }], ["db", "sql-db", { replicas: 0, capacityQps: 1e6 }]],
    [["c", "svc"], ["svc", "cache"], ["cache", "db"]],
  );
  const p = profile(110, [read(["sql-db"]), write(["sql-db"])]);

  it("cache-aside: every read checks the cache, misses go to the DB, writes skip the cache", () => {
    const s = steadyState(aside, p, NO_FAULTS);
    expect(s.nodes.cache.inQps).toBeCloseTo(100);
    expect(s.nodes.db.inQps).toBeCloseTo(20 + 10);
    expect(s.edges["svc>cache"]).toBeCloseTo(100);
    expect(s.edges["svc>db"]).toBeCloseTo(30);
    expect(s.totals.errorQps).toBe(0);
  });

  it("inline cache answers hits and forwards misses and all writes", () => {
    const s = steadyState(inline, p, NO_FAULTS);
    expect(s.nodes.cache.inQps).toBeCloseTo(110);
    expect(s.nodes.db.inQps).toBeCloseTo(30);
    expect(s.edges["cache>db"]).toBeCloseTo(30);
  });

  it("a killed cache-aside cache sends every read to the DB", () => {
    const s = steadyState(aside, p, faults({ killed: ["cache"] }));
    expect(s.nodes.cache.status).toBe("down");
    expect(s.nodes.db.inQps).toBeCloseTo(110);
    expect(s.totals.errorQps).toBe(0);
  });

  it("cache flush: hit rate drops to 0 and ramps back over 60 s", () => {
    const f = faults({ cacheFlushAt: 10 });
    expect(steadyState(aside, p, f, 5).nodes.cache.hitRate).toBeCloseTo(80);
    expect(steadyState(aside, p, f, 10).nodes.cache.hitRate).toBeCloseTo(0);
    expect(steadyState(aside, p, f, 10).nodes.db.inQps).toBeCloseTo(110);
    expect(steadyState(aside, p, f, 40).nodes.cache.hitRate).toBeCloseTo(40);
    expect(steadyState(aside, p, f, 70).nodes.cache.hitRate).toBeCloseTo(80);
  });

  it("CDN on the path answers its hit rate of reads", () => {
    const g = graph([["c", "client"], ["cdn", "cdn", { hitRate: 90 }], ["s3", "object-storage"]], [["c", "cdn"], ["cdn", "s3"]]);
    const s = steadyState(g, profile(100, [read(["object-storage"])]), NO_FAULTS);
    expect(s.nodes.s3.inQps).toBeCloseTo(10);
    expect(s.totals.okQps).toBeCloseTo(100);
  });
});

describe("load balancers, replicas and failover", () => {
  const lbGraph = (algorithm: string) =>
    graph(
      [["c", "client"], ["lb", "load-balancer", { algorithm }], ["a", "service", { instances: 1, capacityQps: 100 }], ["b", "service", { instances: 3, capacityQps: 100 }], ["db", "nosql-db"]],
      [["c", "lb"], ["lb", "a"], ["lb", "b"], ["a", "db"], ["b", "db"]],
    );

  it("round-robin and consistent-hash split evenly", () => {
    for (const algo of ["round-robin", "consistent-hash"]) {
      const s = steadyState(lbGraph(algo), readNosql(80), NO_FAULTS);
      expect(s.nodes.a.inQps).toBeCloseTo(40);
      expect(s.nodes.b.inQps).toBeCloseTo(40);
    }
  });

  it("weighted and least-connections split by capacity", () => {
    for (const algo of ["weighted", "least-connections"]) {
      const s = steadyState(lbGraph(algo), readNosql(80), NO_FAULTS);
      expect(s.nodes.a.inQps).toBeCloseTo(20);
      expect(s.nodes.b.inQps).toBeCloseTo(60);
    }
  });

  it("killing a target fails over to the rest", () => {
    const s = steadyState(lbGraph("round-robin"), readNosql(80), faults({ killed: ["a"] }));
    expect(s.nodes.a).toMatchObject({ status: "down", inQps: 0 });
    expect(s.nodes.b.inQps).toBeCloseTo(80);
    expect(s.edges["lb>a"]).toBe(0);
    expect(s.totals.errorQps).toBe(0);
  });

  it("sql-db: reads spread over primary + replicas, writes go to the primary", () => {
    const g = (replicas: number) => graph([["c", "client"], ["db", "sql-db", { replicas, capacityQps: 100, latencyMs: 0 }]], [["c", "db"]]);
    const reads = profile(150, [read(["sql-db"])]);
    expect(steadyState(g(2), reads, NO_FAULTS).nodes.db.rho).toBeCloseTo(0.5);
    const none = steadyState(g(0), reads, NO_FAULTS);
    expect(none.nodes.db.rho).toBeCloseTo(1.5);
    expect(none.totals.okQps).toBeCloseTo(95);
    // 150 writes all hit the one primary even with replicas.
    const writes = steadyState(g(2), profile(150, [write(["sql-db"])]), NO_FAULTS);
    expect(writes.nodes.db.rho).toBeCloseTo(1.5);
    expect(writes.totals.okQps).toBeCloseTo(95);
  });

  it("reads split across replication-linked sql-db nodes; writes stay on the primary", () => {
    const g = graph(
      [["c", "client"], ["p", "sql-db", { replicas: 0, capacityQps: 1000 }], ["r", "sql-db", { replicas: 0, capacityQps: 1000 }]],
      [["c", "p"], ["p", "r", "replication"]],
    );
    const s = steadyState(g, profile(150, [read(["sql-db"]), write(["sql-db"])], 2), NO_FAULTS);
    expect(s.nodes.p.inQps).toBeCloseTo(50 + 50);
    expect(s.nodes.r.inQps).toBeCloseTo(50);
    expect(s.edges["p>r"]).toBeCloseTo(50);
    expect(steadyState(g, profile(150, [read(["sql-db"])]), faults({ killed: ["r"] })).nodes.p.inQps).toBeCloseTo(150);
  });
});

describe("queues and rate limits", () => {
  // Producer → (async) queue → 1 worker at 10 ms (100 QPS) → NoSQL.
  const qGraph = graph(
    [["c", "client"], ["svc", "service", { capacityQps: 1e6 }], ["q", "queue"], ["w", "worker", { instances: 1, processingMs: 10 }], ["db", "nosql-db"]],
    [["c", "svc"], ["svc", "q", "async"], ["q", "w"], ["w", "db"]],
  );
  const writes = (qps: number) => profile(qps, [write(["nosql-db"])]);

  it("queue depth grows by (inflow − consumption) × dt; the caller still succeeds at once", () => {
    const s = run(qGraph, writes(200), NO_FAULTS, 10);
    expect(s.nodes.q.queueDepth).toBeCloseTo(10 * (200 - 95) * 0.5);
    expect(s.nodes.w.rho).toBeCloseTo(0.95);
    expect(s.nodes.w.droppedQps).toBeCloseTo(0);
    expect(s.totals.errorQps).toBeCloseTo(0);
    expect(s.requestTypes[0].okQps).toBeCloseTo(200, 0);
  });

  it("drains at consumption rate once inflow falls, never below zero", () => {
    const grown = run(qGraph, writes(200), NO_FAULTS, 10); // depth 525
    const one = run(qGraph, writes(200), faults({ trafficMultiplier: 0.25 }), 1, grown);
    expect(one.nodes.q.queueDepth).toBeCloseTo(525 - (95 - 50) * 0.5);
    const drained = run(qGraph, writes(200), faults({ trafficMultiplier: 0.25 }), 60, grown);
    expect(drained.nodes.q.queueDepth).toBe(0);
  });

  it("does not grow when consumers keep up, and grows by the full inflow when they die", () => {
    expect(run(qGraph, writes(50), NO_FAULTS, 10).nodes.q.queueDepth).toBe(0);
    const dead = run(qGraph, writes(50), faults({ killed: ["w"] }), 4);
    expect(dead.nodes.q.queueDepth).toBeCloseTo(4 * 50 * 0.5);
    expect(dead.totals.errorQps).toBeCloseTo(0);
  });

  it("api-gateway, external-api and llm-api drop above their rate limits", () => {
    const g = graph([["c", "client"], ["gw", "api-gateway", { rateLimitQps: 100, latencyMs: 5 }], ["x", "external-api", { rateLimitQps: 1000 }]], [["c", "gw"], ["gw", "x"]]);
    const s = steadyState(g, profile(150, [read(["external-api"])]), NO_FAULTS);
    expect(s.nodes.gw.droppedQps).toBeCloseTo(50);
    expect(s.nodes.gw.rho).toBeCloseTo(1.5);
    expect(s.nodes.gw.latencyMs).toBeCloseTo(5);
    expect(s.nodes.x.inQps).toBeCloseTo(100);
    expect(s.totals.okQps).toBeCloseTo(100);
    const llm = graph([["c", "client"], ["m", "llm-api", { rateLimitRpm: 600 }]], [["c", "m"]]);
    expect(steadyState(llm, profile(25, [read(["llm-api"])]), NO_FAULTS).totals.okQps).toBeCloseTo(10);
  });
});

// ---------- Analysis ----------

const nosql = (id = "db"): N => [id, "nosql-db", { nodes: 3 }];

describe("SPOF detection", () => {
  const p = readNosql(100);
  const spofsOf = (g: StudioGraph) => analyze(g, p, steadyState(g, p, NO_FAULTS), NO_FAULTS);

  it("a single-instance load balancer is a SPOF", () => {
    const g = graph([["c", "client"], ["lb", "load-balancer", { instances: 1 }], ["s1", "service", { instances: 1 }], ["s2", "service", { instances: 1 }], nosql()],
      [["c", "lb"], ["lb", "s1"], ["lb", "s2"], ["s1", "db"], ["s2", "db"]]);
    const a = spofsOf(g);
    expect(a.spofs.map((s) => s.id)).toEqual(["lb"]);
    expect(a.spofs[0].disconnects).toEqual([{ clientId: "c", requestTypeId: "read" }]);
    expect(a.redundantCuts).toEqual(["db"]);
  });

  it("redundant services are cut vertices but not SPOFs", () => {
    const g = graph([["c", "client"], ["lb", "load-balancer", { instances: 2 }], ["svc", "service", { instances: 3 }], nosql()], [["c", "lb"], ["lb", "svc"], ["svc", "db"]]);
    const a = spofsOf(g);
    expect(a.spofs).toEqual([]);
    expect(a.redundantCuts).toEqual(["lb", "svc", "db"]);
  });

  it("a SQL primary without replicas is a SPOF", () => {
    const g = graph([["c", "client"], ["lb", "load-balancer"], ["svc", "service"], ["db", "sql-db", { replicas: 0 }]], [["c", "lb"], ["lb", "svc"], ["svc", "db"]]);
    expect(analyze(g, profile(100, [read(["sql-db"])]), initSim(g, profile(100, [read(["sql-db"])])), NO_FAULTS).spofs.map((s) => s.id)).toEqual(["db"]);
  });

  const twoAz = graph(
    [
      ["c", "client"], ["dns", "dns"], ["region", "frame", { scope: "region" }], ["az-a", "frame", { scope: "az" }, "region"], ["az-b", "frame", { scope: "az" }, "region"],
      ["lb", "load-balancer", { instances: 2 }, "region"], ["sa", "service", { instances: 1 }, "az-a"], ["sb", "service", { instances: 1 }, "az-b"],
      ["sa2", "service", { instances: 1 }, "az-a"], ["db", "nosql-db", { nodes: 3 }, "region"],
    ],
    [["c", "dns"], ["c", "lb"], ["lb", "sa"], ["lb", "sa2"], ["lb", "sb"], ["sa", "db"], ["sa2", "db"], ["sb", "db"]],
  );

  it("a two-AZ design has no SPOFs, and losing an AZ reroutes to the other", () => {
    const a = spofsOf(twoAz);
    expect(a.spofs).toEqual([]);
    expect(a.redundantCuts).toEqual(["lb", "db"]);
    expect(azToLose(twoAz)).toBe("az-a");
    expect(frameMembers(twoAz, "az-a")).toEqual(["sa", "sa2"]);
    expect(frameMembers(twoAz, "region")).toEqual(["az-a", "sa", "sa2", "az-b", "sb", "lb", "db"]);
    const lost = steadyState(twoAz, p, faults({ killed: frameMembers(twoAz, azToLose(twoAz)!) }));
    expect(lost.nodes.sb.inQps).toBeCloseTo(100);
    expect(lost.totals.errorQps).toBe(0);
    // With an AZ gone the surviving single-instance service becomes a SPOF.
    const after = analyze(twoAz, p, lost, faults({ killed: ["sa", "sa2"] }));
    expect(after.spofs.map((s) => s.id)).toEqual(["sb"]);
  });

  it("azToLose is null without az frames", () => {
    expect(azToLose(simple())).toBeNull();
  });

  it("lists bottlenecks with ρ > 0.8, highest first", () => {
    const g = graph([["c", "client"], ["a", "service", { instances: 1, capacityQps: 100 }], ["b", "service", { instances: 1, capacityQps: 110 }], ["db", "nosql-db", { nodes: 1, capacityQps: 1e6 }]],
      [["c", "a"], ["a", "b"], ["b", "db"]]);
    const a = spofsOf(g);
    // a: ρ 1 drops to 95 → b: ρ 95 / 110.
    expect(a.bottlenecks.map((x) => x.id)).toEqual(["a", "b"]);
    expect(a.bottlenecks[1].rho).toBeCloseTo(95 / 110);
  });
});

describe("availability and cost", () => {
  const p = readNosql(10);
  const avail = (g: StudioGraph, pr = p) => analyze(g, pr, steadyState(g, pr, NO_FAULTS), NO_FAULTS).availabilityPct;
  const db: N = ["db", "nosql-db", { nodes: 1, availabilityPct: 99.9 }];

  it("series along the path", () => {
    const g = graph([["c", "client"], ["svc", "service", { instances: 1, availabilityPct: 99 }], db], [["c", "svc"], ["svc", "db"]]);
    expect(avail(g)).toBeCloseTo(99 * 0.999, 6);
  });

  it("k instances in parallel: 1 − (1 − a)^k", () => {
    const g = graph([["c", "client"], ["svc", "service", { instances: 2, availabilityPct: 99 }], db], [["c", "svc"], ["svc", "db"]]);
    expect(avail(g)).toBeCloseTo(99.99 * 0.999, 6);
  });

  it("split targets in parallel", () => {
    const g = graph(
      [["c", "client"], ["lb", "load-balancer", { availabilityPct: 100 }], ["a", "service", { instances: 1, availabilityPct: 99 }], ["b", "service", { instances: 1, availabilityPct: 99 }], db],
      [["c", "lb"], ["lb", "a"], ["lb", "b"], ["a", "db"], ["b", "db"]],
    );
    expect(avail(g)).toBeCloseTo(99.99 * 0.999, 6);
  });

  it("a cache-aside cache is not required; an inline cache is", () => {
    const aside = graph([["c", "client"], ["svc", "service", { instances: 1, availabilityPct: 99 }], ["k", "cache", { availabilityPct: 50 }], db], [["c", "svc"], ["svc", "k"], ["svc", "db"]]);
    expect(avail(aside)).toBeCloseTo(99 * 0.999, 6);
    const inline = graph([["c", "client"], ["svc", "service", { instances: 1, availabilityPct: 99 }], ["k", "cache", { availabilityPct: 90 }], db], [["c", "svc"], ["svc", "k"], ["k", "db"]]);
    expect(avail(inline)).toBeCloseTo(99 * 0.9 * 0.999, 6);
  });

  it("overall is traffic-weighted across request types", () => {
    const g = graph([["c", "client"], ["svc", "service", { instances: 1, availabilityPct: 99 }], db, ["s3", "object-storage", { availabilityPct: 90 }]], [["c", "svc"], ["svc", "db"], ["c", "s3"]]);
    const pr = profile(10, [read(["object-storage"]), write(["nosql-db"])], 3);
    const a = analyze(g, pr, steadyState(g, pr, NO_FAULTS), NO_FAULTS);
    expect(a.availabilityByType.read).toBeCloseTo(90, 6);
    expect(a.availabilityByType.write).toBeCloseTo(99 * 0.999, 6);
    expect(a.availabilityPct).toBeCloseTo(0.75 * 90 + 0.25 * 99 * 0.999, 6);
  });

  it("cost = Σ costPerMonth × instances / nodes / shards / (1 + replicas)", () => {
    const g = graph(
      [["c", "client"], ["svc", "service", { instances: 3, costPerMonth: 100 }], ["sql", "sql-db", { replicas: 2, costPerMonth: 50 }], ["sh", "shard-group", { shards: 4, costPerMonth: 10 }], ["lb", "load-balancer", { costPerMonth: 7 }]],
      [],
    );
    expect(analyze(g, p, initSim(g, p), NO_FAULTS).costPerMonth).toBe(300 + 150 + 40 + 14);
  });
});

// ---------- Templates, challenges, determinism, smoothing, perf ----------

describe("runs", () => {
  const threeTier = templateById("three-tier-web-app")!.graph;

  it("three-tier template at its default profile serves everything with no errors", () => {
    const p = defaultProfile(threeTier);
    expect(p.qps).toBe(Math.round((5_000_000 * 10) / 86_400));
    expect(p.requestTypes.map((r) => r.target.kinds)).toEqual([["sql-db"], ["sql-db"]]);
    const s = run(threeTier, p, NO_FAULTS, 20);
    expect(s.totals.errorQps).toBe(0);
    expect(s.requestTypes.every((r) => r.reachable)).toBe(true);
    expect(s.nodes.cache.inQps).toBeGreaterThan(0);
    expect(Object.values(s.nodes).every((n) => n.status === "ok")).toBe(true);
  });

  it("defaultProfile falls back to cache, then service, and has a floor of 10 QPS", () => {
    const cacheOnly = defaultProfile(graph([["c", "client", { users: 10 }], ["k", "cache"]], []));
    expect(cacheOnly.qps).toBe(10);
    expect(cacheOnly.requestTypes[0].target.kinds).toEqual(["cache"]);
    expect(defaultProfile(graph([["c", "client"]], [])).requestTypes[1].target.kinds).toEqual(["service"]);
    const blobs = defaultProfile(graph([["c", "client"], ["s3", "object-storage"], ["db", "nosql-db"], ["se", "search-index"]], []));
    expect(blobs.requestTypes[0].target.kinds).toEqual(["nosql-db", "object-storage", "search-index"]);
    expect(blobs.requestTypes[1].target.kinds).toEqual(["nosql-db"]);
  });

  it("stepSim smooths toward the steady state with τ = 1.5 s", () => {
    const p = readNosql(100);
    const s0 = initSim(simple(), p);
    const s1 = stepSim(simple(), p, s0, faults({ trafficMultiplier: 2 }));
    const a = 1 - Math.exp(-0.5 / 1.5);
    expect(s1.t).toBe(0.5);
    expect(s1.nodes.svc.inQps).toBeCloseTo(100 + 100 * a);
    const converged = run(simple(), p, faults({ trafficMultiplier: 2 }), 60, s0);
    expect(converged.nodes.svc.inQps).toBeCloseTo(steadyState(simple(), p, faults({ trafficMultiplier: 2 })).nodes.svc.inQps, 6);
  });

  it("is deterministic", () => {
    const p = defaultProfile(threeTier);
    const f = faults({ killed: ["api-1"], slowed: ["db"], cacheFlushAt: 2, peak: true });
    expect(run(threeTier, p, f, 30)).toEqual(run(threeTier, p, f, 30));
  });

  const challenge = (c: Partial<RunChallenge> & Pick<RunChallenge, "targets">): RunChallenge => ({ id: "c", title: "C", description: "D", atPeak: false, durationS: 60, ...c });

  it("evaluateChallenge: three-tier survives normal traffic but not losing an AZ", () => {
    const p = defaultProfile(threeTier);
    const ok = evaluateChallenge(threeTier, challenge({ targets: { maxErrorRatePct: 0.1, maxP99Ms: 200, maxSpofs: 0 } }), p);
    expect(ok.passed).toBe(true);
    expect(ok.results.map((r) => r.label)).toEqual(["p99 latency (worst request type)", "Error rate", "Single points of failure"]);
    const az = evaluateChallenge(threeTier, challenge({ scenario: "lose-az", targets: { maxErrorRatePct: 0.1 } }), p);
    expect(az.passed).toBe(false);
    // api-3 (500 QPS) alone gets all 579 QPS: it drops everything above 475.
    expect(az.results[0].actual).toBeCloseTo(((579 - 475) / 579) * 100, 1);
    const x10 = evaluateChallenge(threeTier, challenge({ scenario: "traffic-x10", targets: { minOkQps: 5000 } }), p);
    expect(x10.passed).toBe(false);
    const flush = evaluateChallenge(threeTier, challenge({ scenario: "cache-flush", durationS: 20, targets: { maxErrorRatePct: 0 } }), p);
    expect(flush.passed).toBe(true);
  });

  it("evaluateChallenge on an empty case-study template is all errors", () => {
    const g = templateById("url-shortener")!.graph;
    const res = evaluateChallenge(g, challenge({ durationS: 5, targets: { maxErrorRatePct: 1, minAvailabilityPct: 99 } }), defaultProfile(g));
    expect(res.passed).toBe(false);
    expect(res.results[0].actual).toBe(100);
    expect(res.results[1].actual).toBe(0);
  });

  it("steps a 60-node graph in under 2 ms", () => {
    const nodes: N[] = [["c", "client"], ["lb", "load-balancer"], ["k", "cache"], ["q", "queue"]];
    const edges: E[] = [["c", "lb"]];
    for (let i = 0; i < 30; i++) { nodes.push([`s${i}`, "service"]); edges.push(["lb", `s${i}`], [`s${i}`, "k"], [`s${i}`, `d${i % 10}`], [`s${i}`, `d${(i + 3) % 10}`], [`s${i}`, "q", "async"]); }
    for (let i = 0; i < 10; i++) { nodes.push([`d${i}`, "nosql-db"]); }
    for (let i = 0; i < 16; i++) { nodes.push([`w${i}`, "worker"]); edges.push(["q", `w${i}`], [`w${i}`, `d${i % 10}`]); }
    const g = graph(nodes, edges);
    expect(g.nodes).toHaveLength(60);
    const p = profile(5000, [read(["nosql-db"], "r1"), { ...read(["nosql-db"], "r2"), weight: 2 }, write(["nosql-db"])]);
    let s = initSim(g, p);
    for (let i = 0; i < 20; i++) s = stepSim(g, p, s, NO_FAULTS); // warm up
    const n = 200;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) s = stepSim(g, p, s, faults({ killed: i % 2 ? ["s3"] : [] }));
    const per = (performance.now() - t0) / n;
    expect(s.totals.offeredQps).toBeGreaterThan(0);
    expect(per).toBeLessThan(2);
  });
});

describe("queue replication", () => {
  it("a queue on the request path is a SPOF at replication 1 and not at 3", () => {
    const mk = (replication: number): StudioGraph => ({
      version: 1,
      nodes: [
        { id: "c", kind: "client", x: 0, y: 0, label: "Users", props: { users: 1000 } },
        { id: "svc", kind: "service", x: 0, y: 0, label: "API", props: { instances: 3, capacityQps: 1000, latencyMs: 10 } },
        { id: "q", kind: "queue", x: 0, y: 0, label: "Topic", props: { partitions: 6, replication } },
        { id: "w", kind: "worker", x: 0, y: 0, label: "Workers", props: { instances: 3 } },
        { id: "db", kind: "nosql-db", x: 0, y: 0, label: "Store", props: { nodes: 3 } },
      ],
      edges: [
        { id: "e1", source: "c", target: "svc", kind: "sync", direction: "forward" },
        { id: "e2", source: "svc", target: "q", kind: "async", direction: "forward" },
        { id: "e3", source: "q", target: "w", kind: "sync", direction: "forward" },
        { id: "e4", source: "w", target: "db", kind: "sync", direction: "forward" },
      ],
    });
    const pr: TrafficProfile = { qps: 100, readWriteRatio: 1, peakMultiplier: 1, requestTypes: [{ id: "write", name: "Write", op: "write", weight: 1, target: { kinds: ["nosql-db"] } }] };
    const spofs = (g: StudioGraph) => analyze(g, pr, steadyState(g, pr, NO_FAULTS), NO_FAULTS).spofs.map((s) => s.id);
    expect(spofs(mk(1))).toContain("q");
    expect(spofs(mk(3))).not.toContain("q");
  });
});
