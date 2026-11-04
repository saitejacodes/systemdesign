import type { ComponentKind, StudioGraph } from "../types";
import { buildRouting, copiesOf, numProp, offeredByType, unitsOf, type Net } from "./model";
import type { Analysis, Faults, SimState, TrafficProfile } from "./types";

/** Kinds treated as internally redundant whatever their counts (the provider runs them replicated). */
const MANAGED_KINDS: ReadonlySet<ComponentKind> = new Set(["dns", "cdn", "object-storage", "monitoring"]);

/** Shared nodes conditioned exactly in the availability estimate (2^n passes). */
const MAX_FACTORED = 12;

function availabilityOf(net: Net, i: number): number {
  const nd = net.nodes[i];
  if (nd.kind === "client") return 1;
  const pct = numProp(nd, "availabilityPct") ?? 100;
  const a = Math.min(1, Math.max(0, pct / 100));
  return 1 - Math.pow(1 - a, copiesOf(nd));
}

/** Plain reachability client → any alive destination over sync + async edges, optionally with one node removed. */
function reachesDest(net: Net, alive: boolean[], isDest: boolean[], from: number, removed: number): boolean {
  const seen = new Uint8Array(net.n);
  const stack = [from];
  seen[from] = 1;
  while (stack.length) {
    const u = stack.pop()!;
    if (u !== from && isDest[u]) return true;
    for (const e of net.out[u]) {
      const v = e.to;
      if (seen[v] || v === removed || !alive[v] || net.kind[v] === "client") continue;
      seen[v] = 1;
      stack.push(v);
    }
  }
  return false;
}

/** Bottlenecks, single points of failure, availability estimate and monthly cost for the current design and faults. */
export function analyze(graph: StudioGraph, profile: TrafficProfile, state: SimState, faults: Faults): Analysis {
  const R = buildRouting(graph, profile, faults, state.t);
  const { net, p, order, routes } = R;
  const N = net.n;

  const bottlenecks = Object.values(state.nodes)
    .filter((s) => s.status !== "down" && s.rho > 0.8)
    .map((s) => ({ id: s.id, rho: s.rho }))
    .sort((a, b) => b.rho - a.rho || a.id.localeCompare(b.id));

  // SPOFs: cut vertices of client → destination reachability, killed nodes ignored.
  const clients = net.kind.flatMap((k, i) => (k === "client" && p.alive[i] ? [i] : []));
  const cuts = new Map<number, { clientId: string; requestTypeId: string }[]>();
  for (const route of routes) {
    for (const c of clients) {
      if (!reachesDest(net, p.alive, route.isDest, c, -1)) continue;
      for (let v = 0; v < N; v++) {
        if (v === c || !p.alive[v] || net.kind[v] === "client") continue;
        if (!reachesDest(net, p.alive, route.isDest, c, v)) {
          const list = cuts.get(v) ?? [];
          list.push({ clientId: net.ids[c], requestTypeId: route.rt.id });
          cuts.set(v, list);
        }
      }
    }
  }
  const spofs: Analysis["spofs"] = [];
  const redundantCuts: string[] = [];
  for (const [v, disconnects] of [...cuts.entries()].sort((a, b) => a[0] - b[0])) {
    const nd = net.nodes[v];
    if (MANAGED_KINDS.has(nd.kind) || copiesOf(nd) >= 2) redundantCuts.push(nd.id);
    else spofs.push({ id: nd.id, disconnects });
  }

  // Availability: parallel inside a node and across split targets, series along the path; cache-aside caches optional.
  const total = profile.requestTypes.length ? offeredByType(profile, { ...faults, trafficMultiplier: 1, peak: false }) : [];
  const nodeA = Array.from({ length: N }, (_, i) => (p.alive[i] ? availabilityOf(net, i) : 0));
  let users = 0;
  for (const c of clients) users += net.users[c];
  const availabilityByType: Record<string, number> = {};
  let weighted = 0, weightSum = 0;
  routes.forEach((route, k) => {
    // One bottom-up pass is exact on a tree. Nodes reached by two or more paths (a database behind two
    // app servers) would be counted as independent copies, so they are factored out instead: condition
    // on each one being up or down and weight the passes. Above MAX_FACTORED such nodes, fall back to
    // the single pass, which overstates availability.
    const paths = new Uint8Array(N);
    for (const c of clients) paths[c] = 1;
    for (const u of order) {
      if (!paths[u] || route.isDest[u]) continue;
      for (const v of route.cands[u]) paths[v] = Math.min(2, paths[v] + paths[u]);
    }
    const shared = order.filter((u) => paths[u] >= 2 && net.kind[u] !== "client");
    const factored = shared.length <= MAX_FACTORED ? shared : [];
    const fixed = new Int8Array(N).fill(-1);
    const pass = (): number => {
      const A = new Float64Array(N);
      for (let o = order.length - 1; o >= 0; o--) {
        const u = order[o];
        const own = fixed[u] >= 0 ? fixed[u] : nodeA[u];
        if (route.isDest[u]) {
          let fail = 1 - own;
          if (route.rt.op === "read" && net.kind[u] === "sql-db") for (const r of net.repl[u]) if (p.alive[r.to]) fail *= 1 - (fixed[r.to] >= 0 ? fixed[r.to] : nodeA[r.to]);
          A[u] = 1 - fail;
          continue;
        }
        const cands = route.cands[u];
        let combine: number;
        if (cands.length) { let fail = 1; for (const v of cands) fail *= 1 - A[v]; combine = 1 - fail; }
        else combine = route.queueSeed[u] ? 1 : 0;
        A[u] = own * combine;
      }
      let a = 0;
      for (const c of clients) a += A[c] * (users > 0 ? net.users[c] / users : 1 / clients.length);
      return a;
    };
    const factor = (i: number): number => {
      if (i === factored.length) return pass();
      const u = factored[i];
      const up = nodeA[u];
      let a = 0;
      fixed[u] = 1;
      if (up > 0) a += up * factor(i + 1);
      fixed[u] = 0;
      if (up < 1) a += (1 - up) * factor(i + 1);
      fixed[u] = -1;
      return a;
    };
    const a = factor(0);
    availabilityByType[route.rt.id] = a * 100;
    weighted += a * total[k];
    weightSum += total[k];
  });
  const availabilityPct = weightSum > 0 ? (weighted / weightSum) * 100 : 0;

  let costPerMonth = 0;
  for (const nd of net.nodes) {
    const c = nd.props.costPerMonth;
    if (typeof c === "number" && Number.isFinite(c) && c > 0) costPerMonth += c * unitsOf(nd);
  }

  return { bottlenecks, spofs, redundantCuts, availabilityPct, availabilityByType, costPerMonth };
}

