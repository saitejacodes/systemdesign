import type { SimModel } from "@/lib/sim/engine";

export type Pattern = "steady" | "bursty" | "boundary" | "ramp";
export const PATTERNS: { value: Pattern; label: string }[] = [
  { value: "steady", label: "Steady (Poisson)" },
  { value: "bursty", label: "Bursty (30 at once every 6 s)" },
  { value: "boundary", label: "Boundary attack" },
  { value: "ramp", label: "Ramp up" },
];

export type Algo = "tb" | "lb" | "fw" | "sl" | "sc";
export const ALGOS: { id: Algo; label: string }[] = [
  { id: "tb", label: "Token bucket" },
  { id: "lb", label: "Leaky bucket" },
  { id: "fw", label: "Fixed window" },
  { id: "sl", label: "Sliding log" },
  { id: "sc", label: "Sliding counter" },
];

export interface RlConfig {
  pattern: Pattern;
  /** Offered traffic for steady and ramp, req/s. */
  traffic: number;
  /** Sustained rate R (token refill, leak rate); window limit = R × W. */
  rate: number;
  /** Burst B: token bucket capacity and leaky bucket queue size. */
  burst: number;
  /** Window W in seconds for the window algorithms. */
  window: number;
  distributed: boolean;
}

export const NODES = 3;
const HISTORY_MS = 8_000;
const BURST_EVERY = 6_000, BURST_N = 30, BURST_MS = 200;
const EDGE_MS = 150;

interface Lane {
  allowed: number;
  rejected: number;
  /** Allowed timestamps in the last max(W, 1 s), for burst measurements. */
  recentAllowed: number[];
  maxInWindow: number;
  maxIn1s: number;
  /** Decisions for the timeline: 1 allowed, 0 rejected, 2 queued (leaky bucket). */
  marks: { t: number; v: 0 | 1 | 2 }[];
}

export interface RlState {
  t: number;
  nextPoisson: number;
  lanes: Record<Algo, Lane>;
  tokens: number;
  lastRefill: number;
  /** Leaky bucket queue of arrival times and the next leak time. */
  leakQ: number[];
  nextLeak: number;
  fwIndex: number;
  fwCount: number;
  log: number[];
  scIndex: number;
  scPrev: number;
  scCur: number;
  /** Distributed comparison: three local token buckets fed round robin. */
  local: number[];
  localNext: number;
  localAllowed: number;
  offered: number;
  lastRate: number;
  lastBurst: number;
  flood: boolean;
  warned: boolean;
  lastPattern: Pattern;
}

const lane = (): Lane => ({ allowed: 0, rejected: 0, recentAllowed: [], maxInWindow: 0, maxIn1s: 0, marks: [] });

/** Times of n evenly spaced requests over [start, start + dur) that fall in (a, b]. */
function burstTimes(start: number, dur: number, n: number, a: number, b: number) {
  const out: number[] = [];
  for (let j = 0; j < n; j++) { const x = start + (j * dur) / n; if (x > a && x <= b) out.push(x); }
  return out;
}

/** Arrivals in (a, b] for patterns with scheduled bursts. */
function scheduled(c: RlConfig, a: number, b: number) {
  const out: number[] = [];
  if (c.pattern === "bursty") {
    for (let k = Math.floor(a / BURST_EVERY); k * BURST_EVERY <= b; k++) out.push(...burstTimes(k * BURST_EVERY + 1_000, BURST_MS, BURST_N, a, b));
  } else if (c.pattern === "boundary") {
    // Every 2 windows: L requests just before a boundary and L just after it. Each window sees exactly L.
    const W = c.window * 1000, L = Math.round(c.rate * c.window);
    for (let k = Math.floor(a / (2 * W)); k * 2 * W <= b; k++) {
      const edge = k * 2 * W + W;
      out.push(...burstTimes(edge - EDGE_MS, EDGE_MS, L, a, b), ...burstTimes(edge, EDGE_MS, L, a, b));
    }
  }
  return out;
}

const poissonRate = (c: RlConfig, t: number) =>
  c.pattern === "steady" ? c.traffic : c.pattern === "ramp" ? c.traffic * (0.25 + 1.75 * ((t % 30_000) / 30_000)) : c.pattern === "bursty" ? 1 : 0;

function record(s: RlState, c: RlConfig, a: Algo, t: number, ok: boolean) {
  const l = s.lanes[a];
  l.marks.push({ t, v: ok ? 1 : 0 });
  if (!ok) { l.rejected++; return; }
  l.allowed++;
  l.recentAllowed.push(t);
  const span = Math.max(c.window * 1000, 1000);
  while (l.recentAllowed.length && t - l.recentAllowed[0] >= span) l.recentAllowed.shift();
  let inW = 0, in1 = 0;
  for (const x of l.recentAllowed) { if (t - x < c.window * 1000) inW++; if (t - x < 1000) in1++; }
  l.maxInWindow = Math.max(l.maxInWindow, inW);
  l.maxIn1s = Math.max(l.maxIn1s, in1);
}

function arrive(s: RlState, c: RlConfig, t: number) {
  s.offered++;
  const L = Math.max(1, Math.round(c.rate * c.window)), W = c.window * 1000;

  // Token bucket: refill lazily, spend one token per request.
  s.tokens = Math.min(c.burst, s.tokens + ((t - s.lastRefill) / 1000) * c.rate);
  s.lastRefill = t;
  const tb = s.tokens >= 1;
  if (tb) s.tokens -= 1;
  record(s, c, "tb", t, tb);

  // Leaky bucket: join the queue if there is room; requests leave at R/s.
  if (s.leakQ.length < c.burst) { if (!s.leakQ.length) s.nextLeak = Math.max(s.nextLeak, t); s.leakQ.push(t); s.lanes.lb.marks.push({ t, v: 2 }); }
  else record(s, c, "lb", t, false);

  // Fixed window: a counter that resets at each window boundary.
  const idx = Math.floor(t / W);
  if (idx !== s.fwIndex) { s.fwIndex = idx; s.fwCount = 0; }
  const fw = s.fwCount < L;
  if (fw) s.fwCount++;
  record(s, c, "fw", t, fw);

  // Sliding log: keep every allowed timestamp from the last W.
  while (s.log.length && t - s.log[0] >= W) s.log.shift();
  const sl = s.log.length < L;
  if (sl) s.log.push(t);
  record(s, c, "sl", t, sl);

  // Sliding counter: weight the previous window by how much of it still overlaps.
  const si = Math.floor(t / W);
  if (si !== s.scIndex) { s.scPrev = si === s.scIndex + 1 ? s.scCur : 0; s.scCur = 0; s.scIndex = si; }
  const est = s.scPrev * (1 - (t - si * W) / W) + s.scCur;
  const sc = est < L;
  if (sc) s.scCur++;
  record(s, c, "sc", t, sc);

  // Distributed: each node has its own full-size bucket and sees a third of the traffic.
  const n = s.localNext++ % NODES;
  if (s.local[n] >= 1) { s.local[n] -= 1; s.localAllowed++; }
}

export const rlModel: SimModel<RlConfig, RlState> = {
  init(c, rng) {
    return {
      t: 0, nextPoisson: c.pattern === "boundary" ? Infinity : rng.exponential(Math.max(0.01, poissonRate(c, 0))) * 1000,
      lanes: { tb: lane(), lb: lane(), fw: lane(), sl: lane(), sc: lane() },
      tokens: c.burst, lastRefill: 0, leakQ: [], nextLeak: 0, fwIndex: 0, fwCount: 0, log: [], scIndex: 0, scPrev: 0, scCur: 0,
      local: new Array(NODES).fill(c.burst), localNext: 0, localAllowed: 0, offered: 0, lastRate: c.rate, lastBurst: c.burst, flood: false, warned: false, lastPattern: c.pattern,
    };
  },

  tick(s, ctx) {
    const c = ctx.config, a = s.t, b = ctx.t;
    s.lastRate = c.rate; s.lastBurst = c.burst; s.lastPattern = c.pattern;
    const times = scheduled(c, a, b);
    const rate = poissonRate(c, b) + (s.flood ? c.traffic * 10 : 0);
    if (rate <= 0) s.nextPoisson = Infinity;
    else if (!Number.isFinite(s.nextPoisson)) s.nextPoisson = b + ctx.rng.exponential(rate) * 1000;
    while (s.nextPoisson <= b) { times.push(s.nextPoisson); s.nextPoisson += ctx.rng.exponential(rate) * 1000; }
    times.sort((x, y) => x - y);
    for (const t of times) arrive(s, c, t);

    // Leak the queue at R/s; each leaked request reaches the backend.
    const gap = 1000 / c.rate;
    while (s.leakQ.length && s.nextLeak <= b) {
      const t = Math.max(s.nextLeak, s.leakQ[0]);
      if (t > b) break;
      s.leakQ.shift();
      record(s, c, "lb", t, true);
      s.nextLeak = t + gap;
    }
    if (!s.leakQ.length && s.nextLeak < b) s.nextLeak = b;

    for (let i = 0; i < NODES; i++) s.local[i] = Math.min(c.burst, s.local[i] + (ctx.dt / 1000) * c.rate);
    for (const l of Object.values(s.lanes)) while (l.marks.length && b - l.marks[0].t > HISTORY_MS) l.marks.shift();

    if (!s.warned && s.lanes.fw.maxInWindow >= 1.8 * Math.round(c.rate * c.window)) {
      s.warned = true;
      ctx.log("warn", `Fixed window let ${s.lanes.fw.maxInWindow} requests through in one ${c.window} s span (limit ${Math.round(c.rate * c.window)})`);
    }
    ctx.metrics.inc("offered", times.length);
    s.t = b;
    return s;
  },

  actions: {},

  faults: [
    {
      id: "flood",
      label: "Abusive client (×10 traffic)",
      description: "A scraper hammers the API. A good limiter keeps the backend's load flat no matter how hard it pushes.",
      apply: (s) => ({ ...s, flood: true }),
      revert: (s) => ({ ...s, flood: false }),
    },
  ],

  metrics(s, _reg, t) {
    const sec = Math.max(t, 1) / 1000;
    const m: Record<string, number> = { offered: s.offered / sec, local: s.localAllowed / sec };
    for (const { id } of ALGOS) {
      const l = s.lanes[id];
      m[`${id}Allowed`] = l.allowed / sec;
      m[`${id}Rejected`] = l.rejected / sec;
      m[`${id}MaxW`] = l.maxInWindow;
      m[`${id}Max1s`] = l.maxIn1s;
    }
    return m;
  },
};

/** Estimated bytes of limiter state per user. */
export function memoryBytes(s: RlState, a: Algo) {
  return { tb: 16, lb: 16 + 8 * s.leakQ.length, fw: 16, sl: 8 * Math.max(1, s.log.length), sc: 24 }[a];
}
