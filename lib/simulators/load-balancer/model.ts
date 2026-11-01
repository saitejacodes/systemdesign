import { EventQueue, type Rng, type SimModel } from "@/lib/sim/engine";

export type Algorithm = "rr" | "wrr" | "least" | "iphash" | "random";
export const ALGORITHMS: { value: Algorithm; label: string }[] = [
  { value: "rr", label: "Round robin" },
  { value: "wrr", label: "Weighted round robin" },
  { value: "least", label: "Least connections" },
  { value: "iphash", label: "IP hash" },
  { value: "random", label: "Random" },
];

export interface LbConfig {
  servers: number;
  algorithm: Algorithm;
  rps: number;
  /** Capacity of a standard server, req/s. */
  capacity: number;
  latency: number;
  /** Every other server is twice as big. */
  hetero: boolean;
  checkMs: number;
  threshold: number;
  /** Challenge hooks: kill server 2 / start a 10 s ×3 spike at this sim time (0 = never). */
  killAt: number;
  spikeAt: number;
}

export const MAX_SERVERS = 10;
export const CLIENTS = 500;
const SPIKE_MS = 10_000;
const FLAKY_ERR = 0.3;

export interface Server {
  /** Capacity in req/s; concurrency slots = capacity × latency. */
  cap: number;
  slots: number;
  busy: number;
  /** Arrival times of queued requests (FIFO). */
  queue: number[];
  dead: boolean;
  slow: number;
  flaky: boolean;
  /** The load balancer's view of this server. */
  up: boolean;
  fails: number;
  oks: number;
  served: number;
}

type Ev = { kind: "done"; s: number; arrived: number; error: boolean };

export interface LbState {
  servers: Server[];
  events: EventQueue<Ev>;
  nextArrival: number;
  rrIndex: number;
  /** Smooth weighted round robin running weights. */
  wrrCurrent: number[];
  nextCheck: number;
  spikeUntil: number;
  killed: boolean;
  /** ms during which at least one server was dead, and during which a spike ran. */
  deadMs: number;
  spikeMs: number;
  /** Recent routed requests for the travelling dots. */
  recent: { t: number; s: number; id: number; error: boolean }[];
  nextId: number;
  t: number;
  /** Algorithm in use on the last tick, for challenge checks. */
  lastAlgorithm: Algorithm;
  arrivals: number;
  errors: number;
}

export const activeServers = (s: LbState, c: Pick<LbConfig, "servers">) => s.servers.slice(0, c.servers);

const capFor = (c: LbConfig, i: number) => (c.hetero && i % 2 === 0 ? c.capacity * 2 : c.capacity);

export function serverLoad(sv: Server) { return (sv.busy + sv.queue.length) / sv.slots; }

/** FNV-1a: a stable client → server mapping for IP hash. */
function hash(n: number) {
  let h = 0x811c9dc5;
  for (const ch of `client-${n}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function pick(s: LbState, c: LbConfig, rng: Rng, client: number): number | null {
  const live = activeServers(s, c).map((sv, i) => ({ sv, i })).filter((x) => x.sv.up);
  if (!live.length) return null;
  switch (c.algorithm) {
    case "rr": return live[s.rrIndex++ % live.length].i;
    case "random": return rng.pick(live).i;
    case "iphash": return live[hash(client) % live.length].i;
    case "least": {
      let best = live[0];
      for (const x of live) if (x.sv.busy + x.sv.queue.length < best.sv.busy + best.sv.queue.length) best = x;
      return best.i;
    }
    case "wrr": {
      // nginx's smooth weighted round robin: add each weight, pick the largest, subtract the total.
      let total = 0, best = live[0];
      for (const x of live) {
        s.wrrCurrent[x.i] += x.sv.cap;
        total += x.sv.cap;
        if (s.wrrCurrent[x.i] > s.wrrCurrent[best.i]) best = x;
      }
      s.wrrCurrent[best.i] -= total;
      return best.i;
    }
  }
}

function start(s: LbState, c: LbConfig, rng: Rng, i: number, arrived: number, now: number) {
  const sv = s.servers[i];
  sv.busy++;
  const error = sv.flaky && rng.chance(FLAKY_ERR);
  // Mean = latency, with a short tail: 60% fixed work plus an exponential part (p99 ≈ 2.4× mean).
  const service = error ? 2 : c.latency * sv.slow * (0.6 + 0.4 * rng.exponential(1));
  s.events.push(now + service, { kind: "done", s: i, arrived, error });
}

/** Queued requests on a crashed server fail; in-flight ones fail as they complete. */
function kill(sv: Server, s: LbState) { sv.dead = true; s.errors += sv.queue.length; sv.queue = []; }

export const lbModel: SimModel<LbConfig, LbState> = {
  init(c, rng) {
    const servers = Array.from({ length: MAX_SERVERS }, (_, i): Server => {
      const cap = capFor(c, i);
      return { cap, slots: Math.max(1, Math.round((cap * c.latency) / 1000)), busy: 0, queue: [], dead: false, slow: 1, flaky: false, up: true, fails: 0, oks: 0, served: 0 };
    });
    return {
      servers, events: new EventQueue<Ev>(), nextArrival: rng.exponential(c.rps) * 1000, rrIndex: 0, wrrCurrent: new Array(MAX_SERVERS).fill(0),
      nextCheck: c.checkMs, spikeUntil: 0, killed: false, deadMs: 0, spikeMs: 0, recent: [], nextId: 0, t: 0, lastAlgorithm: c.algorithm, arrivals: 0, errors: 0,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.lastAlgorithm = c.algorithm;
    // Capacity follows the controls; slots shrink only as requests finish.
    s.servers.forEach((sv, i) => { sv.cap = capFor(c, i); sv.slots = Math.max(1, Math.round((sv.cap * c.latency) / 1000)); });

    if (c.killAt && !s.killed && ctx.t >= c.killAt) { kill(s.servers[1], s); s.killed = true; ctx.log("error", "Server 2 crashed"); }
    if (c.spikeAt && ctx.t >= c.spikeAt && ctx.t < c.spikeAt + ctx.dt) { s.spikeUntil = ctx.t + SPIKE_MS; ctx.log("warn", "Traffic spike: ×3 for 10 s"); }
    const spiking = ctx.t < s.spikeUntil;
    const rate = c.rps * (spiking ? 3 : 1);
    if (spiking) s.spikeMs += ctx.dt;
    if (activeServers(s, c).some((sv) => sv.dead)) s.deadMs += ctx.dt;

    // Completions first, then arrivals, both in time order within the tick.
    for (const { t, e } of s.events.drain(ctx.t)) {
      const sv = s.servers[e.s];
      sv.busy = Math.max(0, sv.busy - 1);
      if (e.error || sv.dead) { ctx.metrics.inc("errors"); s.errors++; }
      else { ctx.metrics.observe("latency", t - e.arrived); ctx.metrics.inc("served"); sv.served++; }
      while (sv.queue.length && sv.busy < sv.slots && !sv.dead) start(s, c, ctx.rng, e.s, sv.queue.shift()!, t);
    }
    while (s.nextArrival <= ctx.t) {
      const t = s.nextArrival;
      s.nextArrival += ctx.rng.exponential(rate) * 1000;
      s.arrivals++;
      ctx.metrics.inc("arrivals");
      const i = pick(s, c, ctx.rng, ctx.rng.int(0, CLIENTS - 1));
      let error = false;
      if (i === null) { error = true; ctx.metrics.inc("noBackend"); }
      else {
        const sv = s.servers[i];
        if (sv.dead) error = true; // connection refused
        else if (sv.busy < sv.slots) start(s, c, ctx.rng, i, t, t);
        else if (sv.queue.length < sv.slots * 4) sv.queue.push(t);
        else { error = true; ctx.metrics.inc("dropped"); }
      }
      if (error) { ctx.metrics.inc("errors"); s.errors++; }
      if (i !== null && s.nextId % 3 === 0) s.recent.push({ t, s: i, id: s.nextId, error });
      s.nextId++;
    }
    while (s.recent.length && ctx.t - s.recent[0].t > 500) s.recent.shift();

    // Health checks: a dead server fails, a flaky one fails 30% of the time; slowness goes unnoticed.
    if (ctx.t >= s.nextCheck) {
      s.nextCheck = ctx.t + c.checkMs;
      activeServers(s, c).forEach((sv, i) => {
        const ok = !sv.dead && !(sv.flaky && ctx.rng.chance(FLAKY_ERR));
        if (ok) { sv.fails = 0; sv.oks++; } else { sv.oks = 0; sv.fails++; }
        if (sv.up && sv.fails >= c.threshold) { sv.up = false; ctx.log("warn", `Health check: server ${i + 1} marked DOWN after ${sv.fails} failures`); }
        if (!sv.up && sv.oks >= 2) { sv.up = true; ctx.log("info", `Health check: server ${i + 1} back UP`); }
      });
    }
    s.t = ctx.t;
    return s;
  },

  actions: {
    revive(s, payload) { const sv = s.servers[Number(payload)]; if (sv) sv.dead = false; return s; },
  },

  faults: [
    { id: "kill", label: "Kill server 1", description: "The process crashes. Requests routed to it fail until health checks remove it.", apply: (s) => { kill(s.servers[0], s); return s; }, revert: (s) => { s.servers[0].dead = false; return s; } },
    { id: "slow", label: "Slow server 2 (latency ×5)", description: "A GC storm or noisy neighbour. Health checks still pass, so the LB keeps sending traffic.", apply: (s) => { s.servers[1].slow = 5; return s; }, revert: (s) => { s.servers[1].slow = 1; return s; } },
    { id: "flaky", label: "Flaky server 3 (30% errors)", description: "A bad deploy: 30% of requests (and health checks) fail fast.", apply: (s) => { s.servers[2].flaky = true; return s; }, revert: (s) => { s.servers[2].flaky = false; return s; } },
    { id: "spike", label: "Traffic spike (×3 for 10 s)", description: "A push notification goes out and everyone opens the app at once.", apply: (s) => { s.spikeUntil = s.t + SPIKE_MS; return s; }, revert: (s) => { s.spikeUntil = 0; return s; } },
  ],

  metrics(s, reg, t) {
    const p = reg.histogram("latency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const arrivals = reg.rate("arrivals", t);
    const m: Record<string, number> = {
      qps: reg.rate("served", t), arrivals,
      errorRate: arrivals ? Math.min(1, reg.rate("errors", t) / arrivals) : 0,
      dropped: reg.rate("dropped", t),
      p50: p.p50, p95: p.p95, p99: p.p99,
      totalErrorRate: s.arrivals ? s.errors / s.arrivals : 0,
    };
    s.servers.forEach((sv, i) => { m[`load${i}`] = serverLoad(sv); m[`conn${i}`] = sv.busy + sv.queue.length; });
    return m;
  },
};
