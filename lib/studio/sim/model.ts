import { defaultProps } from "../catalog";
import type { ComponentKind, PropValue, StudioGraph, StudioNode } from "../types";
import type { Faults, NodeStatus, RequestType, RequestTypeResult, SimNodeState, SimState, TrafficProfile } from "./types";

/*
 * Run-mode flow model. Implements the routing rules in ./types.ts. Readings chosen where those rules leave a gap
 * (also listed in the "What it simplifies" drawer):
 * - Edges carry traffic from source to target only (the arrowhead style is ignored). Traffic never passes through a client.
 * - Cycles: the graph is ordered by a depth-first walk from the clients and the first back edge found closes the cycle.
 * - Cache-aside applies to a node (not an LB / gateway) that has a cache child and at least one other candidate; the cache
 *   then answers hitRate of reads and the misses go to the other candidates (the cache's own outgoing edges are not used).
 * - Caches, queues, CDNs, DNS, LBs and object storage have no capacity limit, so they never drop.
 * - sql-db: the primary takes all writes plus 1/(1+replicas) of reads (capacity capacityQps); the replicas share the rest
 *   (replicas × capacityQps). The node's ρ is the busier of the two pools. Replication-linked sql-db nodes share reads by
 *   read capacity.
 * - Rate-limited nodes (api-gateway, external-api, llm-api) drop above the limit and show ρ = in / limit, but their
 *   latency does not grow with ρ and they do not count towards the p99 factor (a limiter rejects, it does not queue).
 * - A request ends successfully when it reaches a destination, is answered by a cache/CDN hit, or is handed to a queue
 *   (entering a queue node or crossing an async edge). Work after that hand-off is "background": its drops show on the
 *   nodes but not in the request-type errors, and its latency is not part of the end-to-end latency.
 * - A queue stays a valid route while its consumers exist in the design even if they are killed (the producer cannot see
 *   them): messages pile up instead. Consumers pull at up to 95% of their capacity, split by capacity.
 * - Each client's share of qps is users / Σ users; a killed client sends nothing.
 * - With only reads (or only writes) defined, that op gets all the traffic; otherwise reads get R / (R + 1).
 */

export const DEFAULT_DT_S = 0.5;
export const SMOOTHING_TAU_S = 1.5;
export const CACHE_RECOVERY_S = 60;
export const DROP_RHO = 0.95;
export const LATENCY_CAP = 20;
export const P99_SLOPE = 3.6;
export const SLOW_FACTOR = 5;
/** Consumers pull from a queue at up to this fraction of their capacity, so queue-fed workers never drop. */
export const CONSUMER_PULL = 0.95;

export const NO_FAULTS: Faults = { killed: [], slowed: [], trafficMultiplier: 1, peak: false };

// ---------- Graph helpers ----------

const isComponent = (n: StudioNode): n is StudioNode & { kind: ComponentKind } => n.kind !== "note" && n.kind !== "frame";

/** Ids of every node inside a frame, at any depth (nested frames and their children included). */
export function frameMembers(graph: StudioGraph, frameId: string): string[] {
  const children = new Map<string, string[]>();
  for (const n of graph.nodes) if (n.parentId) (children.get(n.parentId) ?? children.set(n.parentId, []).get(n.parentId)!).push(n.id);
  const out: string[] = [];
  const seen = new Set<string>([frameId]);
  const stack = [...(children.get(frameId) ?? [])].reverse();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    const c = children.get(id);
    if (c) for (let i = c.length - 1; i >= 0; i--) stack.push(c[i]);
  }
  return out;
}

/** The frame with scope "az" that holds the most components (first in node order on ties), or null if there is none. */
export function azToLose(graph: StudioGraph): string | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  let best: string | null = null;
  let bestCount = -1;
  for (const f of graph.nodes) {
    if (f.kind !== "frame" || f.props.scope !== "az") continue;
    const count = frameMembers(graph, f.id).filter((id) => { const n = byId.get(id); return !!n && isComponent(n); }).length;
    if (count > bestCount) { best = f.id; bestCount = count; }
  }
  return best;
}

const DEFAULTS = new Map<ComponentKind, Record<string, PropValue>>();
export function numProp(n: StudioNode & { kind: ComponentKind }, key: string): number | undefined {
  const v = n.props[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let d = DEFAULTS.get(n.kind);
  if (!d) { d = defaultProps(n.kind); DEFAULTS.set(n.kind, d); }
  const dv = d[key];
  return typeof dv === "number" ? dv : undefined;
}

/** Copies of a node for availability and redundancy: instances, nodes, 1 + replicas, or a queue's replication factor (shards are not copies). */
export function copiesOf(n: StudioNode & { kind: ComponentKind }): number {
  if (n.kind === "sql-db") return 1 + Math.max(0, numProp(n, "replicas") ?? 0);
  // A topic replicated across brokers (e.g. Kafka with replication factor 3) survives losing one of them.
  if (n.kind === "queue") return Math.max(1, numProp(n, "replication") ?? 1);
  return Math.max(1, numProp(n, "instances") ?? numProp(n, "nodes") ?? 1);
}

/** Billable units: instances, nodes, shards or 1 + replicas. */
export function unitsOf(n: StudioNode & { kind: ComponentKind }): number {
  if (n.kind === "shard-group") return Math.max(1, numProp(n, "shards") ?? 1);
  return copiesOf(n);
}

interface OutEdge { to: number; edge: string; async: boolean }

/** Static structure of a graph, cached per graph object (graphs are treated as immutable values). */
export interface Net {
  n: number;
  nodes: (StudioNode & { kind: ComponentKind })[];
  ids: string[];
  index: Map<string, number>;
  kind: ComponentKind[];
  out: OutEdge[][];
  inn: number[][];
  /** sql-db nodes linked by replication edges (both directions), with the edge id. */
  repl: { to: number; edge: string }[][];
  users: number[];
  edgeIds: string[];
}

const NETS = new WeakMap<StudioGraph, Net>();
export function netOf(graph: StudioGraph): Net {
  const cached = NETS.get(graph);
  if (cached) return cached;
  const nodes = graph.nodes.filter(isComponent);
  const index = new Map(nodes.map((nd, i) => [nd.id, i]));
  const out: OutEdge[][] = nodes.map(() => []);
  const inn: number[][] = nodes.map(() => []);
  const repl: { to: number; edge: string }[][] = nodes.map(() => []);
  for (const e of graph.edges) {
    const s = index.get(e.source), t = index.get(e.target);
    if (s === undefined || t === undefined || s === t) continue;
    if (e.kind === "replication") {
      if (nodes[s].kind === "sql-db" && nodes[t].kind === "sql-db") {
        if (!repl[s].some((r) => r.to === t)) repl[s].push({ to: t, edge: e.id });
        if (!repl[t].some((r) => r.to === s)) repl[t].push({ to: s, edge: e.id });
      }
      continue;
    }
    if (out[s].some((o) => o.to === t)) continue; // first edge between a pair wins
    out[s].push({ to: t, edge: e.id, async: e.kind === "async" });
    inn[t].push(s);
  }
  const net: Net = {
    n: nodes.length, nodes, ids: nodes.map((x) => x.id), index, kind: nodes.map((x) => x.kind), out, inn, repl,
    users: nodes.map((x) => (x.kind === "client" ? Math.max(0, numProp(x, "users") ?? 0) : 0)),
    edgeIds: graph.edges.map((e) => e.id),
  };
  NETS.set(graph, net);
  return net;
}

// ---------- Per-node parameters for the current faults ----------

const LB_KINDS: ReadonlySet<ComponentKind> = new Set(["load-balancer", "api-gateway"]);
const HIT_KINDS: ReadonlySet<ComponentKind> = new Set(["cache", "cdn"]);

export interface Params {
  alive: boolean[];
  lat: number[];
  /** Capacity for reads / writes (Infinity = no limit). sql-db: primary and replica pools separately. */
  cap: number[];
  sqlPrimary: number[];
  sqlReplicas: number[];
  replicaCount: number[];
  rateLimit: number[];
  hit: number[];
}

function params(net: Net, faults: Faults, t: number): Params {
  const killed = new Set(faults.killed), slowed = new Set(faults.slowed);
  const p: Params = { alive: [], lat: [], cap: [], sqlPrimary: [], sqlReplicas: [], replicaCount: [], rateLimit: [], hit: [] };
  let ramp = 1;
  if (faults.cacheFlushAt !== undefined && t >= faults.cacheFlushAt) ramp = Math.min(1, (t - faults.cacheFlushAt) / CACHE_RECOVERY_S);
  for (let i = 0; i < net.n; i++) {
    const nd = net.nodes[i], k = nd.kind, slow = slowed.has(nd.id) ? SLOW_FACTOR : 1;
    p.alive.push(!killed.has(nd.id));
    p.lat.push((numProp(nd, "latencyMs") ?? 0) * slow);
    const per = numProp(nd, "capacityQps") ?? 0;
    let cap = Infinity, prim = Infinity, reps = 0, repN = 0;
    if (k === "service") cap = (numProp(nd, "instances") ?? 1) * per;
    else if (k === "nosql-db" || k === "search-index" || k === "vector-db") cap = (numProp(nd, "nodes") ?? 1) * per;
    else if (k === "shard-group") cap = (numProp(nd, "shards") ?? 1) * per;
    else if (k === "worker") cap = ((numProp(nd, "instances") ?? 1) * 1000) / Math.max(0.001, numProp(nd, "processingMs") ?? 50);
    else if (k === "sql-db") { repN = Math.max(0, numProp(nd, "replicas") ?? 0); prim = per / slow; reps = (repN * per) / slow; cap = prim + reps; }
    if (k !== "sql-db") cap /= slow;
    p.cap.push(cap); p.sqlPrimary.push(prim); p.sqlReplicas.push(reps); p.replicaCount.push(repN);
    p.rateLimit.push(k === "api-gateway" || k === "external-api" ? numProp(nd, "rateLimitQps") ?? Infinity : k === "llm-api" ? (numProp(nd, "rateLimitRpm") ?? Infinity) / 60 : Infinity);
    p.hit.push(HIT_KINDS.has(k) ? Math.min(1, Math.max(0, (numProp(nd, "hitRate") ?? 0) / 100)) * ramp : 0);
  }
  return p;
}

/** Capacity used to weight splits and queue consumption (sql-db: the primary for writes, all nodes for reads). */
const splitCap = (p: Params, net: Net, i: number, op: "read" | "write") => (net.kind[i] === "sql-db" && op === "write" ? p.sqlPrimary[i] : p.cap[i]);

// ---------- Routing ----------

export interface Route {
  rt: RequestType;
  isDest: boolean[];
  /** Alive queues that structurally lead to a destination: valid hand-off points even with dead consumers. */
  queueSeed: boolean[];
  cands: number[][];
  aside: number[][];
  reach: boolean[];
}

export interface Routing { net: Net; p: Params; order: number[]; routes: Route[]; back: Set<number> }

function isTarget(net: Net, rt: RequestType, i: number): boolean {
  return rt.target.nodeId ? net.ids[i] === rt.target.nodeId : !!rt.target.kinds?.includes(net.kind[i]);
}

export function buildRouting(graph: StudioGraph, profile: TrafficProfile, faults: Faults, t = 0): Routing {
  const net = netOf(graph);
  const p = params(net, faults, t);
  const N = net.n;
  // Global order: depth-first from alive clients over alive sync/async edges, never through a client.
  const state = new Uint8Array(N); // 0 new, 1 on stack, 2 done
  const back = new Set<number>();
  const post: number[] = [];
  const visit = (root: number) => {
    const stack: [number, number][] = [[root, 0]];
    state[root] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [u, j] = top;
      if (j < net.out[u].length) {
        top[1]++;
        const v = net.out[u][j].to;
        if (!p.alive[v] || net.kind[v] === "client") continue;
        if (state[v] === 1) back.add(u * N + v);
        else if (state[v] === 0) { state[v] = 1; stack.push([v, 0]); }
      } else { state[u] = 2; post.push(u); stack.pop(); }
    }
  };
  for (let i = 0; i < N; i++) if (net.kind[i] === "client" && p.alive[i] && state[i] === 0) visit(i);
  const order = post.reverse();

  const routes = profile.requestTypes.map((rt): Route => {
    const isDest = new Array<boolean>(N).fill(false);
    const struct = new Array<boolean>(N).fill(false);
    const queue: number[] = [];
    for (let i = 0; i < N; i++) if (isTarget(net, rt, i)) { struct[i] = true; queue.push(i); if (p.alive[i]) isDest[i] = true; }
    while (queue.length) { const v = queue.pop()!; for (const u of net.inn[v]) if (!struct[u] && net.kind[u] !== "client") { struct[u] = true; queue.push(u); } }
    const queueSeed = net.kind.map((k, i) => k === "queue" && p.alive[i] && struct[i] && !isDest[i]);
    const reach = new Array<boolean>(N).fill(false);
    const cands: number[][] = Array.from({ length: N }, () => []);
    const aside: number[][] = Array.from({ length: N }, () => []);
    for (let o = order.length - 1; o >= 0; o--) {
      const u = order[o];
      if (isDest[u]) { reach[u] = true; continue; }
      const fwd = net.out[u].filter((e) => p.alive[e.to] && net.kind[e.to] !== "client" && !back.has(u * N + e.to)).map((e) => e.to);
      const r = fwd.filter((v) => reach[v]);
      const caches = fwd.filter((v) => net.kind[v] === "cache" && !isDest[v]);
      const others = r.filter((v) => net.kind[v] !== "cache" || isDest[v]);
      if (!LB_KINDS.has(net.kind[u]) && caches.length && others.length) {
        cands[u] = others;
        if (rt.op === "read") aside[u] = caches;
      } else cands[u] = r;
      reach[u] = queueSeed[u] || cands[u].length > 0;
    }
    return { rt, isDest, queueSeed, cands, aside, reach };
  });
  return { net, p, order, routes, back };
}

// ---------- Steady state ----------

const qFactor = (rho: number) => (rho < DROP_RHO ? 1 / (1 - rho) : LATENCY_CAP);
const passOf = (rho: number) => (rho < DROP_RHO ? 1 : DROP_RHO / rho);

interface Loads { r: number; w: number }

/** ρ of each sql-db pool, given read and write load. */
function sqlRhos(p: Params, i: number, l: Loads) {
  const share = 1 / (1 + p.replicaCount[i]);
  const rp = (l.w + l.r * share) / p.sqlPrimary[i];
  const rr = p.replicaCount[i] > 0 ? (l.r * (1 - share)) / p.sqlReplicas[i] : 0;
  return { rp, rr, share };
}

function nodeRho(net: Net, p: Params, i: number, l: Loads): { rho: number; capacityRho: number } {
  const tot = l.r + l.w;
  if (net.kind[i] === "sql-db") { const s = sqlRhos(p, i, l); const rho = Math.max(s.rp, s.rr); return { rho, capacityRho: rho }; }
  if (Number.isFinite(p.cap[i])) { const rho = tot / p.cap[i]; return { rho, capacityRho: rho }; }
  if (Number.isFinite(p.rateLimit[i])) return { rho: tot / p.rateLimit[i], capacityRho: 0 };
  return { rho: 0, capacityRho: 0 };
}

function nodePass(net: Net, p: Params, i: number, l: Loads, op: "read" | "write"): number {
  const tot = l.r + l.w;
  if (net.kind[i] === "sql-db") {
    const s = sqlRhos(p, i, l);
    return op === "write" ? passOf(s.rp) : s.share * passOf(s.rp) + (1 - s.share) * passOf(s.rr);
  }
  if (Number.isFinite(p.cap[i])) return passOf(tot / p.cap[i]);
  if (Number.isFinite(p.rateLimit[i]) && tot > p.rateLimit[i]) return p.rateLimit[i] / tot;
  return 1;
}

function nodeLatency(net: Net, p: Params, i: number, l: Loads, op: "read" | "write"): number {
  const base = p.lat[i];
  if (net.kind[i] === "sql-db") {
    const s = sqlRhos(p, i, l);
    return op === "write" ? base * qFactor(s.rp) : base * (s.share * qFactor(s.rp) + (1 - s.share) * qFactor(s.rr));
  }
  if (Number.isFinite(p.cap[i])) return base * qFactor((l.r + l.w) / p.cap[i]);
  return base;
}

function statusOf(alive: boolean, rho: number): NodeStatus {
  if (!alive) return "down";
  return rho < 0.8 ? "ok" : rho < DROP_RHO ? "hot" : "overloaded";
}

/** Offered qps per request type (before clients split it). */
export function offeredByType(profile: TrafficProfile, faults: Faults): number[] {
  const total = profile.qps * (faults.peak ? profile.peakMultiplier : 1) * faults.trafficMultiplier;
  const hasR = profile.requestTypes.some((r) => r.op === "read"), hasW = profile.requestTypes.some((r) => r.op === "write");
  const readShare = hasR && hasW ? profile.readWriteRatio / (profile.readWriteRatio + 1) : hasR ? 1 : 0;
  const wSum = { read: 0, write: 0 };
  for (const r of profile.requestTypes) wSum[r.op] += r.weight;
  return profile.requestTypes.map((r) => total * (r.op === "read" ? readShare : 1 - readShare) * (r.weight / wSum[r.op]));
}

interface Core { state: SimState; depth: Map<string, number> }

function compute(graph: StudioGraph, profile: TrafficProfile, faults: Faults, t: number, prevDepth?: Map<string, number>, dt = DEFAULT_DT_S): Core {
  const R = buildRouting(graph, profile, faults, t);
  const { net, p, order, routes } = R;
  const N = net.n, K = routes.length;
  const mk = () => Array.from({ length: K }, () => new Float64Array(N));
  const fg = mk(), bg = mk(), dFg = mk(), dBg = mk(), aFg = mk(), aBg = mk();
  const okK = new Float64Array(K);
  const noRoute = new Float64Array(N);
  const edgeQ = new Map<string, number>();
  const addEdge = (id: string, q: number) => { if (q > 0) edgeQ.set(id, (edgeQ.get(id) ?? 0) + q); };
  const depth = new Map<string, number>();

  // Inject client traffic.
  const offered = offeredByType(profile, faults);
  let totalUsers = 0;
  for (let i = 0; i < N; i++) totalUsers += net.users[i];
  const clients = net.kind.flatMap((k, i) => (k === "client" ? [i] : []));
  const offeredK = new Float64Array(K);
  const routedK = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    if (!clients.length) { offeredK[k] = offered[k]; continue; }
    for (const c of clients) {
      const share = totalUsers > 0 ? net.users[c] / totalUsers : 1 / clients.length;
      if (!p.alive[c]) continue;
      fg[k][c] += offered[k] * share;
      offeredK[k] += offered[k] * share;
      if (routes[k].cands[c].length) routedK[k] += offered[k] * share;
    }
  }

  const loadsOf = (i: number): Loads => {
    let r = 0, w = 0;
    for (let k = 0; k < K; k++) {
      const v = fg[k][i] + bg[k][i] + dFg[k][i] + dBg[k][i] + aFg[k][i] + aBg[k][i];
      if (routes[k].rt.op === "read") r += v; else w += v;
    }
    return { r, w };
  };

  const edgeTo = (u: number, v: number) => net.out[u].find((e) => e.to === v)!;

  const deliver = (k: number, u: number, v: number, f: number, b: number) => {
    const e = edgeTo(u, v);
    addEdge(e.edge, f + b);
    const route = routes[k];
    if (e.async && f > 0) { okK[k] += f; b += f; f = 0; }
    if (net.kind[v] === "queue" && !route.isDest[v] && f > 0) { okK[k] += f; b += f; f = 0; }
    if (!route.isDest[v]) { fg[k][v] += f; bg[k][v] += b; return; }
    const group = route.rt.op === "read" && net.kind[v] === "sql-db" ? net.repl[v].filter((r) => p.alive[r.to]) : [];
    if (!group.length) { dFg[k][v] += f; dBg[k][v] += b; return; }
    const members = [{ to: v, edge: "" }, ...group];
    const caps = members.map((m) => p.cap[m.to]);
    const sum = caps.reduce((a, c) => a + c, 0);
    members.forEach((m, j) => {
      const w = sum > 0 && Number.isFinite(sum) ? caps[j] / sum : 1 / members.length;
      dFg[k][m.to] += f * w; dBg[k][m.to] += b * w;
      if (m.edge) addEdge(m.edge, (f + b) * w);
    });
  };

  const weights = (u: number, list: number[], op: "read" | "write"): number[] => {
    const kind = net.kind[u];
    const algo = net.nodes[u].props.algorithm;
    const byCap = kind === "queue" || (kind === "load-balancer" && (algo === "weighted" || algo === "least-connections"));
    if (byCap) {
      const caps = list.map((v) => splitCap(p, net, v, op));
      const sum = caps.reduce((a, c) => a + c, 0);
      if (Number.isFinite(sum) && sum > 0) return caps.map((c) => c / sum);
    }
    return list.map(() => 1 / list.length);
  };

  for (const u of order) {
    const loads = loadsOf(u);
    const kind = net.kind[u];
    let queueRatio = 1;
    let queueDrain = 0;
    if (kind === "queue") {
      const inflow = loads.r + loads.w;
      const consumers = new Set<number>();
      for (const route of routes) if (!route.isDest[u]) for (const v of route.cands[u]) consumers.add(v);
      let consCap = 0;
      for (const v of consumers) consCap += CONSUMER_PULL * splitCap(p, net, v, "write");
      const d0 = prevDepth?.get(net.ids[u]) ?? 0;
      const outflow = d0 > 0 ? Math.min(consCap, inflow + d0 / dt) : Math.min(inflow, consCap);
      depth.set(net.ids[u], prevDepth ? Math.max(0, d0 + (inflow - outflow) * dt) : 0);
      if (inflow > 0) queueRatio = outflow / inflow;
      else queueDrain = outflow;
    }
    let drainWeights: number[] | null = null;
    if (queueDrain > 0) {
      const ws = routes.map((r, k) => (!r.isDest[u] && r.cands[u].length ? offered[k] : 0));
      const s = ws.reduce((a, b) => a + b, 0);
      drainWeights = s > 0 ? ws.map((x) => x / s) : null;
    }
    for (let k = 0; k < K; k++) {
      const route = routes[k];
      if (route.isDest[u]) continue;
      const op = route.rt.op;
      const pass = nodePass(net, p, u, loads, op);
      let f = fg[k][u] * pass, b = bg[k][u] * pass;
      if (kind === "queue") { b = (b + f) * queueRatio + (drainWeights ? queueDrain * drainWeights[k] : 0); f = 0; }
      if (f + b <= 0) continue;
      if (HIT_KINDS.has(kind) && op === "read") { okK[k] += f * p.hit[u]; f *= 1 - p.hit[u]; b *= 1 - p.hit[u]; }
      const aside = route.aside[u];
      if (aside.length) {
        let miss = 0;
        for (const c of aside) {
          const share = 1 / aside.length;
          aFg[k][c] += f * share; aBg[k][c] += b * share;
          addEdge(edgeTo(u, c).edge, (f + b) * share);
          okK[k] += f * share * p.hit[c];
          miss += share * (1 - p.hit[c]);
        }
        f *= miss; b *= miss;
      }
      const cands = route.cands[u];
      if (!cands.length) { noRoute[u] += f + b; continue; }
      const w = weights(u, cands, op);
      cands.forEach((v, j) => deliver(k, u, v, f * w[j], b * w[j]));
    }
  }

  // Final node stats on final loads.
  const nodes: Record<string, SimNodeState> = {};
  const capRho = new Float64Array(N);
  const latR = new Float64Array(N), latW = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const id = net.ids[i], kind = net.kind[i];
    const l = loadsOf(i);
    const alive = p.alive[i];
    const { rho, capacityRho } = nodeRho(net, p, i, l);
    capRho[i] = capacityRho;
    latR[i] = nodeLatency(net, p, i, l, "read");
    latW[i] = nodeLatency(net, p, i, l, "write");
    const inQps = l.r + l.w;
    const dropped = Math.min(inQps, l.r * (1 - nodePass(net, p, i, l, "read")) + l.w * (1 - nodePass(net, p, i, l, "write")) + noRoute[i]);
    const s: SimNodeState = {
      id, inQps, okQps: Math.max(0, inQps - dropped), droppedQps: dropped, rho, status: statusOf(alive, rho),
      latencyMs: inQps > 0 ? (l.r * latR[i] + l.w * latW[i]) / inQps : latR[i],
    };
    if (kind === "queue") s.queueDepth = depth.get(id) ?? 0;
    if (HIT_KINDS.has(kind)) s.hitRate = p.hit[i] * 100;
    if (!alive) Object.assign(s, { inQps: 0, okQps: 0, droppedQps: 0, rho: 0, latencyMs: 0 });
    nodes[id] = s;
  }

  const requestTypes: RequestTypeResult[] = routes.map((route, k) => {
    const op = route.rt.op;
    let ok = okK[k], latSum = 0, rhoStar = 0;
    for (let i = 0; i < N; i++) {
      if (dFg[k][i] > 0) ok += dFg[k][i] * nodePass(net, p, i, loadsOf(i), op);
      const visit = fg[k][i] + dFg[k][i] + aFg[k][i];
      if (visit > 0) { latSum += visit * (op === "read" ? latR[i] : latW[i]); rhoStar = Math.max(rhoStar, capRho[i]); }
    }
    const offeredQ = offeredK[k];
    // Float noise from splitting: treat a shortfall below one part in 10^9 as none.
    ok = offeredQ - ok < 1e-9 * Math.max(1, offeredQ) ? offeredQ : ok;
    const meanMs = routedK[k] > 0 ? latSum / routedK[k] : 0;
    return {
      id: route.rt.id, name: route.rt.name, offeredQps: offeredQ, okQps: ok, errorQps: Math.max(0, offeredQ - ok),
      meanMs, p99Ms: meanMs * (1 + P99_SLOPE * Math.min(1, rhoStar)), reachable: routedK[k] > 0,
    };
  });

  const edges: Record<string, number> = {};
  for (const id of net.edgeIds) edges[id] = edgeQ.get(id) ?? 0;
  return { state: { t, nodes, edges, requestTypes, totals: totalsOf(requestTypes) }, depth };
}

function totalsOf(rts: RequestTypeResult[]): SimState["totals"] {
  let offeredQps = 0, okQps = 0, errorQps = 0;
  for (const r of rts) { offeredQps += r.offeredQps; okQps += r.okQps; errorQps += r.errorQps; }
  return { offeredQps, okQps, errorQps, errorRatePct: offeredQps > 0 ? (errorQps / offeredQps) * 100 : 0 };
}

/** The values stepSim converges to for these faults at sim time t (queues treated as empty, no smoothing). */
export function steadyState(graph: StudioGraph, profile: TrafficProfile, faults: Faults, t = 0): SimState {
  return compute(graph, profile, faults, t).state;
}

/** The first state of a run: the no-fault steady state at t = 0. */
export function initSim(graph: StudioGraph, profile: TrafficProfile): SimState {
  return compute(graph, profile, NO_FAULTS, 0).state;
}

/** Advance dtS seconds: new steady state for the current faults, queues integrated, displayed values smoothed (τ = 1.5 s). */
export function stepSim(graph: StudioGraph, profile: TrafficProfile, prev: SimState, faults: Faults, dtS = DEFAULT_DT_S): SimState {
  const t = prev.t + dtS;
  const prevDepth = new Map<string, number>();
  for (const s of Object.values(prev.nodes)) if (s.queueDepth !== undefined) prevDepth.set(s.id, s.queueDepth);
  const target = compute(graph, profile, faults, t, prevDepth, dtS).state;
  const a = 1 - Math.exp(-dtS / SMOOTHING_TAU_S);
  const mix = (from: number | undefined, to: number) => (from === undefined ? to : from + (to - from) * a);
  const nodes: Record<string, SimNodeState> = {};
  for (const [id, s] of Object.entries(target.nodes)) {
    const old = prev.nodes[id];
    if (!old || s.status === "down") { nodes[id] = s; continue; }
    const rho = mix(old.rho, s.rho);
    nodes[id] = {
      ...s,
      inQps: mix(old.inQps, s.inQps), okQps: mix(old.okQps, s.okQps), droppedQps: mix(old.droppedQps, s.droppedQps),
      rho, latencyMs: mix(old.latencyMs, s.latencyMs), status: statusOf(true, rho),
    };
  }
  const edges: Record<string, number> = {};
  for (const [id, q] of Object.entries(target.edges)) edges[id] = mix(prev.edges[id], q);
  const requestTypes = target.requestTypes.map((r) => {
    const old = prev.requestTypes.find((x) => x.id === r.id);
    if (!old) return r;
    return {
      ...r, offeredQps: mix(old.offeredQps, r.offeredQps), okQps: mix(old.okQps, r.okQps), errorQps: mix(old.errorQps, r.errorQps),
      meanMs: mix(old.meanMs, r.meanMs), p99Ms: mix(old.p99Ms, r.p99Ms),
    };
  });
  return { t, nodes, edges, requestTypes, totals: totalsOf(requestTypes) };
}
