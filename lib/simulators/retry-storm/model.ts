import type { Rng, SimModel, TickContext } from "@/lib/sim/engine";

export type Policy = "none" | "immediate" | "backoff" | "jitter";
export const POLICIES: { value: Policy; label: string }[] = [
  { value: "none", label: "No retry" },
  { value: "immediate", label: "Retry immediately" },
  { value: "backoff", label: "Exponential backoff" },
  { value: "jitter", label: "Backoff + full jitter" },
];
export type FaultKind = "errors" | "brownout" | "none";
export const FAULT_KINDS: { value: FaultKind; label: string }[] = [
  { value: "errors", label: "Bad deploy: 50% of requests fail" },
  { value: "brownout", label: "Brownout: capacity halves" },
  { value: "none", label: "No scheduled fault" },
];

export interface RetryConfig {
  clients: number;
  /** New requests per second from all clients together (first attempts only). */
  rate: number;
  /** Requests per second the service can process. */
  capacity: number;
  policy: Policy;
  /** Retries per request after the first attempt. */
  maxRetries: number;
  baseMs: number;
  capMs: number;
  /** Per-client token bucket: each success earns 0.1 token, each retry spends 1. */
  budget: boolean;
  timeoutMs: number;
  /** Server queue bound; arrivals beyond it get a cheap 503. 0 = unbounded. */
  queueLimit: number;
  /** Server skips requests whose client already timed out instead of doing the work. */
  dropExpired: boolean;
  fault: FaultKind;
  /** Scheduled fault window, seconds. */
  faultAt: number;
  faultFor: number;
}

export const ERROR_RATE = 0.5;
export const BROWNOUT = 0.5;
export const TOKEN_EARN = 0.1;
export const BUCKET_MAX = 1;
/** Rejecting or skipping a request costs a small fraction of serving one. */
const CHEAP = 0.02;
/** "Unbounded" still runs out of memory somewhere; this keeps a long storm from growing the tab forever. */
const HARD_LIMIT = 50_000;
const SLOT = 10;
const WHEEL = 1100; // 11 s of retry timers, above the 10 s max cap
export const BIN_MS = 50;
export const BINS = 80;
const WIN = 4; // recovery window: 4 × 250 ms
export const RECOVERED = 0.95;

/** One attempt on the wire. st: 0 waiting, 1 answered, 2 the client gave up (timed out). */
export interface Attempt { c: number; a: number; born: number; sent: number; st: 0 | 1 | 2 }
interface Retry { c: number; a: number; born: number }

export interface RetryState {
  t: number;
  tokens: number[];
  queue: Attempt[]; qHead: number;
  inflight: Attempt[]; iHead: number;
  wheel: Retry[][]; slot: number;
  credit: number;
  manualErrors: boolean; manualBrownout: boolean;
  /** Set by the restart fault; the next tick resets every queued request at once. */
  restart: boolean;
  schedOn: boolean;
  /** When the most recent fault ended (-1: none yet) and when users got ≥95% success again (-1: not yet). */
  healAt: number; recoveredAt: number;
  winOk: number[]; winFail: number[]; winIdx: number;
  /** Attempts and first attempts sent per 50 ms bin, the last 4 s: shows retry waves. */
  sent: number[]; firstSent: number[]; binIdx: number;
  first: number; attempts: number; retries: number; ok: number; errored: number; timeouts: number; rejected: number;
  wasted: number; shed: number; denied: number; userOk: number; userFail: number;
  /** Attempts and first attempts from the first fault on: the challenge's amplification. */
  faultFirst: number; faultAttempts: number; faultSeen: boolean;
  /** Challenge guards: the smallest retry count and whether any policy other than this one ran. */
  minRetries: number; policies: Policy[]; budgetUsed: boolean;
  capEff: number;
  timeoutMs: number;
}

export const queueLen = (s: RetryState) => s.queue.length - s.qHead;
/** Queued requests whose client has already timed out. The queue is in send order, so they are all at the head. */
export function abandoned(s: RetryState) {
  let lo = s.qHead, hi = s.queue.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s.queue[m].sent + s.timeoutMs <= s.t) lo = m + 1; else hi = m; }
  return lo - s.qHead;
}
export const errorRate = (s: RetryState, c: RetryConfig) => (s.manualErrors || (s.schedOn && c.fault === "errors") ? ERROR_RATE : 0);
export const capFactor = (s: RetryState, c: RetryConfig) => (s.manualBrownout || (s.schedOn && c.fault === "brownout") ? BROWNOUT : 1);
export const faulty = (s: RetryState, c: RetryConfig) => errorRate(s, c) > 0 || capFactor(s, c) < 1;

/** Sleep before retry number `a` (0 = first retry), Brooker's "Exponential Backoff And Jitter". */
export function backoff(c: Pick<RetryConfig, "policy" | "baseMs" | "capMs">, a: number, rng: Rng) {
  if (c.policy === "immediate") return 0;
  const w = Math.min(c.capMs, c.baseMs * 2 ** a);
  return c.policy === "jitter" ? rng.uniform(0, w) : w; // full jitter: random_between(0, min(cap, base·2^attempt))
}

export function userRate(s: RetryState) {
  let ok = 0, fail = 0;
  for (let i = 0; i < WIN; i++) { ok += s.winOk[i]; fail += s.winFail[i]; }
  return ok + fail ? ok / (ok + fail) : 1;
}

export const recoverMs = (s: RetryState) => (s.healAt < 0 ? 0 : s.recoveredAt >= 0 ? s.recoveredAt - s.healAt : s.t - s.healAt);

function bump(s: RetryState, ok: boolean) { if (ok) { s.userOk++; s.winOk[s.winIdx]++; } else { s.userFail++; s.winFail[s.winIdx]++; } }

function send(s: RetryState, ctx: TickContext<RetryConfig>, r: Retry) {
  const c = ctx.config;
  s.attempts++;
  s.sent[s.binIdx]++;
  ctx.metrics.inc("attempts");
  if (r.a === 0) { s.first++; s.firstSent[s.binIdx]++; ctx.metrics.inc("first"); } else { s.retries++; ctx.metrics.inc("retries"); }
  if (s.faultSeen) { s.faultAttempts++; if (r.a === 0) s.faultFirst++; }
  if (queueLen(s) >= (c.queueLimit || HARD_LIMIT)) {
    s.rejected++;
    ctx.metrics.inc("rejected");
    s.credit -= CHEAP;
    fail(s, ctx, r);
    return;
  }
  const at: Attempt = { ...r, sent: ctx.t, st: 0 };
  s.queue.push(at);
  s.inflight.push(at);
}

function fail(s: RetryState, ctx: TickContext<RetryConfig>, r: Retry) {
  const c = ctx.config;
  if (c.policy === "none" || r.a >= c.maxRetries) { bump(s, false); return; }
  if (c.budget) {
    if (s.tokens[r.c] < 1) { s.denied++; ctx.metrics.inc("denied"); bump(s, false); return; }
    s.tokens[r.c] -= 1;
  }
  const at = ctx.t + backoff(c, r.a, ctx.rng);
  // Immediate retries go out on the next tick: the client needs the failure before it can resend.
  const slot = Math.max(s.slot + 1, Math.ceil(at / SLOT));
  s.wheel[slot % WHEEL].push({ c: r.c, a: r.a + 1, born: r.born });
}

function compact(s: RetryState) {
  if (s.qHead > 4096) { s.queue = s.queue.slice(s.qHead); s.qHead = 0; }
  if (s.iHead > 4096) { s.inflight = s.inflight.slice(s.iHead); s.iHead = 0; }
}

export const retryModel: SimModel<RetryConfig, RetryState> = {
  init(c) {
    return {
      t: 0, tokens: Array(c.clients).fill(BUCKET_MAX), queue: [], qHead: 0, inflight: [], iHead: 0,
      wheel: Array.from({ length: WHEEL }, () => []), slot: 0, credit: 0,
      manualErrors: false, manualBrownout: false, restart: false, schedOn: false, healAt: -1, recoveredAt: -1,
      winOk: Array(WIN).fill(0), winFail: Array(WIN).fill(0), winIdx: 0,
      sent: Array(BINS).fill(0), firstSent: Array(BINS).fill(0), binIdx: 0,
      first: 0, attempts: 0, retries: 0, ok: 0, errored: 0, timeouts: 0, rejected: 0, wasted: 0, shed: 0, denied: 0, userOk: 0, userFail: 0,
      faultFirst: 0, faultAttempts: 0, faultSeen: false, minRetries: c.maxRetries, policies: [c.policy], budgetUsed: c.budget, capEff: c.capacity, timeoutMs: c.timeoutMs,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    s.timeoutMs = c.timeoutMs;
    s.minRetries = Math.min(s.minRetries, c.maxRetries);
    if (!s.policies.includes(c.policy)) s.policies.push(c.policy);
    s.budgetUsed ||= c.budget;
    if (s.tokens.length !== c.clients) s.tokens = Array.from({ length: c.clients }, (_, i) => s.tokens[i] ?? BUCKET_MAX);

    const on = c.fault !== "none" && ctx.t >= c.faultAt * 1000 && ctx.t < (c.faultAt + c.faultFor) * 1000;
    if (on && !s.schedOn) ctx.log("error", `Fault: ${FAULT_KINDS.find((f) => f.value === c.fault)!.label.toLowerCase()} for ${c.faultFor} s`);
    if (!on && s.schedOn) { s.healAt = ctx.t; s.recoveredAt = -1; ctx.log("info", "The service is healthy again. Does traffic recover?"); }
    s.schedOn = on;
    if (faulty(s, c)) s.faultSeen = true;

    const w = Math.floor(ctx.t / 250) % WIN;
    if (w !== s.winIdx) { s.winIdx = w; s.winOk[w] = 0; s.winFail[w] = 0; }
    const b = Math.floor(ctx.t / BIN_MS) % BINS;
    if (b !== s.binIdx) { s.binIdx = b; s.sent[b] = 0; s.firstSent[b] = 0; }

    // New requests: open-loop, users keep arriving whatever the service is doing.
    for (let n = ctx.rng.poisson((c.rate * ctx.dt) / 1000); n > 0; n--) send(s, ctx, { c: ctx.rng.int(0, c.clients - 1), a: 0, born: ctx.t });
    // Retries whose sleep is over.
    const now = Math.floor(ctx.t / SLOT);
    for (; s.slot < now; ) {
      s.slot++;
      const due = s.wheel[s.slot % WHEEL];
      if (!due.length) continue;
      s.wheel[s.slot % WHEEL] = [];
      for (const r of due) send(s, ctx, r);
    }

    // Client timeouts: the client stops waiting, but the request stays in the server's queue.
    while (s.iHead < s.inflight.length) {
      const a = s.inflight[s.iHead];
      if (a.st === 0 && a.sent + c.timeoutMs > ctx.t) break;
      s.iHead++;
      if (a.st !== 0) continue;
      a.st = 2;
      s.timeouts++;
      ctx.metrics.inc("timeouts");
      fail(s, ctx, a);
    }

    if (s.restart) {
      // Every open connection is reset in the same instant: the failures, and so the retries, are synchronised.
      s.restart = false;
      let n = 0;
      for (let i = s.qHead; i < s.queue.length; i++) { const a = s.queue[i]; if (a.st === 0) { a.st = 1; n++; fail(s, ctx, a); } }
      s.queue = []; s.qHead = 0; s.credit = 0;
      ctx.log("warn", `Restart: ${n} waiting requests reset at once`);
    }

    // The server works FIFO at a fixed rate; it can't tell a live request from an abandoned one unless told to check.
    s.capEff = c.capacity * capFactor(s, c);
    s.credit += (s.capEff * ctx.dt) / 1000;
    const err = errorRate(s, c);
    while (s.qHead < s.queue.length) {
      const a = s.queue[s.qHead];
      const cost = c.dropExpired && a.st === 2 ? CHEAP : 1;
      if (s.credit < cost) break;
      s.credit -= cost;
      s.qHead++;
      if (a.st === 2) {
        if (cost < 1) { s.shed++; ctx.metrics.inc("shed"); } else { s.wasted++; ctx.metrics.inc("wasted"); }
        continue;
      }
      a.st = 1;
      if (err && ctx.rng.chance(err)) { s.errored++; ctx.metrics.inc("errors"); fail(s, ctx, a); continue; }
      s.ok++;
      ctx.metrics.inc("ok");
      if (c.budget) s.tokens[a.c] = Math.min(BUCKET_MAX, s.tokens[a.c] + TOKEN_EARN);
      ctx.metrics.observe("latency", ctx.t - a.born);
      bump(s, true);
    }
    if (s.qHead === s.queue.length) s.credit = Math.min(s.credit, 1); // an idle server can't bank capacity
    compact(s);

    if (s.healAt >= 0 && s.recoveredAt < 0 && !faulty(s, c) && userRate(s) >= RECOVERED && ctx.t - s.healAt >= 250) {
      s.recoveredAt = ctx.t;
      ctx.log("info", `Recovered ${((ctx.t - s.healAt) / 1000).toFixed(1)} s after the fix: ${Math.round(RECOVERED * 100)}% of requests succeed again`);
    }
    return s;
  },

  actions: {},

  faults: [
    { id: "errors", label: "Bad deploy (50% errors)", description: "Half of all requests fail after the server has done the work. Clear it to roll back, then watch whether the retries let the service recover.", apply: (s) => { s.manualErrors = true; return s; }, revert: (s) => { s.manualErrors = false; s.healAt = s.t; s.recoveredAt = -1; return s; } },
    { id: "brownout", label: "Brownout (capacity halves)", description: "A noisy neighbour or a slow disk: the service processes half as many requests a second. The queue grows past the client timeout.", apply: (s) => { s.manualBrownout = true; return s; }, revert: (s) => { s.manualBrownout = false; s.healAt = s.t; s.recoveredAt = -1; return s; } },
    { id: "restart", label: "Restart the service", description: "The operator restarts it to clear the backlog. Every queued request fails in the same instant, so every client retries on the same schedule: watch the retry waves with and without jitter.", apply: (s) => { s.restart = true; return s; }, revert: (s) => s },
  ],

  metrics(s, reg, t) {
    const first = reg.rate("first", t);
    const att = reg.rate("attempts", t);
    const p = reg.histogram("latency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    return {
      offered: att, newReqs: first, capacity: s.capEff, goodput: reg.rate("ok", t),
      wastedRate: reg.rate("wasted", t), retryRate: reg.rate("retries", t),
      amp: first ? att / first : 1, ampRun: s.faultFirst ? s.faultAttempts / s.faultFirst : 1,
      success: userRate(s) * 100, queue: queueLen(s), wait: (queueLen(s) / Math.max(1, s.capEff)) * 1000,
      p50: p.p50, p99: p.p99, recoverS: recoverMs(s) / 1000, denied: s.denied, wasted: s.wasted,
    };
  },
};
