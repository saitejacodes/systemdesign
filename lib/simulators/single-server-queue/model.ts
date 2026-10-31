import { EventQueue, type SimModel } from "@/lib/sim/engine";

export interface QueueConfig { lambda: number; mu: number }
type Ev = { kind: "arrive" } | { kind: "depart" };

export interface QueueState {
  events: EventQueue<Ev>;
  /** Arrival times of waiting requests, oldest first. */
  waiting: number[];
  head: number; // index of the oldest waiting request (avoids O(n) shifts)
  inService: { arrived: number; start: number; end: number } | null;
  /** Divides μ; 3 while the "slow server" fault is on. */
  slow: number;
  busyMs: number;
  t: number;
  /** Recent departures, for the travelling dots. */
  departed: { t: number; id: number }[];
  nextId: number;
  level: "ok" | "hot" | "over";
  /** μ in use on the last tick, for challenge checks. */
  lastMu: number;
}

export const queueLength = (s: QueueState) => s.waiting.length - s.head;

const serviceMs = (s: QueueState, mu: number, rng: { exponential(r: number): number }) => rng.exponential(mu / s.slow) * 1000;

export const queueModel: SimModel<QueueConfig, QueueState> = {
  init(_config, rng) {
    const events = new EventQueue<Ev>();
    events.push(rng.exponential(_config.lambda) * 1000, { kind: "arrive" });
    return { events, waiting: [], head: 0, inService: null, slow: 1, busyMs: 0, t: 0, departed: [], nextId: 0, level: "ok", lastMu: _config.mu };
  },

  tick(s, ctx) {
    const { lambda, mu } = ctx.config;
    const before = s.busyMs;
    s.lastMu = mu;
    for (const { t, e } of s.events.drain(ctx.t)) {
      if (s.inService) s.busyMs += Math.max(0, t - Math.max(s.t, s.inService.start));
      s.t = t;
      if (e.kind === "arrive") {
        ctx.metrics.inc("arrivals");
        if (!s.inService) {
          const end = t + serviceMs(s, mu, ctx.rng);
          s.inService = { arrived: t, start: t, end };
          s.events.push(end, { kind: "depart" });
        } else s.waiting.push(t);
        s.events.push(t + ctx.rng.exponential(lambda) * 1000, { kind: "arrive" });
      } else {
        const done = s.inService!;
        ctx.metrics.observe("latency", t - done.arrived);
        ctx.metrics.inc("served");
        s.departed.push({ t, id: s.nextId++ });
        s.inService = null;
        if (queueLength(s) > 0) {
          const arrived = s.waiting[s.head++];
          const end = t + serviceMs(s, mu, ctx.rng);
          s.inService = { arrived, start: t, end };
          s.events.push(end, { kind: "depart" });
        }
        // Compact the waiting array once the consumed prefix is large.
        if (s.head > 4096) { s.waiting = s.waiting.slice(s.head); s.head = 0; }
      }
    }
    if (s.inService) s.busyMs += Math.max(0, ctx.t - Math.max(s.t, s.inService.start));
    s.t = ctx.t;
    ctx.metrics.inc("busy", (s.busyMs - before) / 1000); // busy seconds; its per-second rate is utilization
    while (s.departed.length && ctx.t - s.departed[0].t > 400) s.departed.shift();

    const q = queueLength(s);
    const level = q >= 200 ? "over" : q >= 30 ? "hot" : "ok";
    if (level !== s.level) {
      ctx.log(level === "over" ? "error" : level === "hot" ? "warn" : "info", level === "ok" ? `Queue drained to ${q}` : `Queue length ${q}: server ${level === "over" ? "overloaded" : "running hot"}`);
      s.level = level;
    }
    return s;
  },

  actions: {
    /** Drops every waiting request (an operator flushing the queue). */
    flush(s) { s.waiting = []; s.head = 0; return s; },
  },

  faults: [
    {
      id: "slow-server",
      label: "Slow server (μ/3)",
      description: "A noisy neighbour or a GC storm: each request now takes 3× longer.",
      apply: (s) => ({ ...s, slow: 3 }),
      revert: (s) => ({ ...s, slow: 1 }),
    },
  ],

  metrics(s, reg, t) {
    const p = reg.histogram("latency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    return {
      qps: reg.rate("served", t),
      arrivalRate: reg.rate("arrivals", t),
      utilization: t ? Math.min(1, reg.rate("busy", t)) : 0,
      queue: queueLength(s),
      p50: p.p50,
      p95: p.p95,
      p99: p.p99,
      meanLatency: reg.histogram("latency")?.mean ?? 0,
    };
  },
};
