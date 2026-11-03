import type { SimModel, TickContext } from "@/lib/sim/engine";

export type BState = "closed" | "open" | "half";
export type WindowType = "count" | "time";
export type BFault = "hang" | "errors" | "slow" | "none";
export const B_FAULTS: { value: BFault; label: string }[] = [
  { value: "hang", label: "B hangs (crash, restarts cold)" },
  { value: "errors", label: "B returns 500s" },
  { value: "slow", label: "B slows down ×10" },
  { value: "none", label: "No scheduled fault" },
];
export const WINDOWS: { value: WindowType; label: string }[] = [
  { value: "count", label: "Count-based (last N calls)" },
  { value: "time", label: "Time-based (last N seconds)" },
];

export interface CbConfig {
  /** Requests per second reaching service A; each one needs a call to B. */
  rate: number;
  timeoutMs: number;
  /** Serve a cached response when the call fails or is rejected. */
  fallback: boolean;
  breaker: boolean;
  /** Failure-rate threshold, %. */
  threshold: number;
  windowType: WindowType;
  /** Calls (count-based) or seconds (time-based). */
  windowSize: number;
  minCalls: number;
  waitMs: number;
  /** Calls permitted in half-open. */
  probes: number;
  bCapacity: number;
  /** Background error rate of a healthy B, %. */
  noisePct: number;
  bFault: BFault;
  faultAt: number;
  faultFor: number;
}

const A_WORK = 2;
const FALLBACK_MS = 1;
/** A cold B starts at 20% of its capacity and warms linearly (caches, JIT, connection pools). */
export const COLD = 0.2;
export const WARM_MS = 20_000;
/** A cold B whose queue passes this falls over again. */
export const CRASH_WAIT = 1000;
export const RESTART_MS = 3000;
const ERR_MS = 5;
const SHOW = 100;
const OPENS_KEEP = 40;

export interface Call { at: number; due: number; ok: boolean; gen: number; probe: boolean }

export interface CbState {
  t: number;
  st: BState; since: number; gen: number;
  /** Count-based ring of outcomes (true = failure). */
  ring: boolean[]; ringN: number; ringPos: number; ringFails: number;
  /** Time-based: one bucket per second. */
  buckets: { sec: number; n: number; f: number }[];
  halfLeft: number; halfDone: number; halfFail: number;
  calls: Call[];
  /** B: down until (Infinity = hung by a fault), cold-start time (-1 = warm), FIFO busy-until. */
  bDownUntil: number; bUpAt: number; bBusy: number;
  manual: BFault; schedOn: boolean; schedKind: BFault;
  faultStart: number; healAt: number;
  /** Recent recorded outcomes for the view, newest last. */
  recent: boolean[];
  opens: number[]; openCount: number; rejected: number; toB: number; fallbacks: number; errors: number; okCalls: number;
  /** B falling over again on its own after a fault ended: the breaker let too much through. */
  reCrashes: number;
  breakerUsed: boolean; breakerOff: boolean;
  rate: number;
  /** From the last tick, for metrics and the view (which don't get the config). */
  bCapEff: number; failPct: number;
}

export const bWarm = (s: CbState) => (s.bUpAt < 0 ? 1 : Math.min(1, COLD + ((1 - COLD) * (s.t - s.bUpAt)) / WARM_MS));
export const bDown = (s: CbState) => s.t < s.bDownUntil;
export const fault = (s: CbState): BFault => (s.manual !== "none" ? s.manual : s.schedOn ? s.schedKind : "none");

export function failureRate(s: CbState, c: CbConfig) {
  if (c.windowType === "count") return { n: s.ringN, f: s.ringFails };
  let n = 0, f = 0;
  const now = Math.floor(s.t / 1000);
  for (const b of s.buckets) if (now - b.sec < c.windowSize) { n += b.n; f += b.f; }
  return { n, f };
}

function resetWindow(s: CbState, c: CbConfig) {
  s.ring = Array(c.windowType === "count" ? c.windowSize : 0).fill(false);
  s.ringN = 0; s.ringPos = 0; s.ringFails = 0;
  s.buckets = [];
}

function go(s: CbState, ctx: TickContext<CbConfig>, to: BState) {
  const c = ctx.config;
  s.st = to; s.since = ctx.t; s.gen++;
  if (to === "open") {
    s.openCount++;
    s.opens = [...s.opens, ctx.t].slice(-OPENS_KEEP);
    ctx.log("warn", `Breaker OPEN: calls to B fail fast for ${c.waitMs / 1000} s`);
  } else if (to === "half") {
    s.halfLeft = c.probes; s.halfDone = 0; s.halfFail = 0;
    ctx.log("info", `Breaker HALF-OPEN: ${c.probes} trial calls`);
  } else {
    resetWindow(s, c);
    ctx.log("info", "Breaker CLOSED: traffic flows to B again");
  }
}

/** Resilience4j: once the window holds minimumNumberOfCalls, open when failure rate ≥ threshold. */
function record(s: CbState, ctx: TickContext<CbConfig>, call: Call, failed: boolean) {
  const c = ctx.config;
  if (!c.breaker || call.gen !== s.gen) return; // results from an earlier state don't count
  s.recent.push(failed);
  if (s.recent.length > SHOW) s.recent.shift();
  if (s.st === "half") {
    s.halfDone++;
    if (failed) s.halfFail++;
    if (s.halfDone >= c.probes) go(s, ctx, (s.halfFail / s.halfDone) * 100 >= c.threshold ? "open" : "closed");
    return;
  }
  if (c.windowType === "count") {
    if (s.ring.length !== c.windowSize) resetWindow(s, c);
    if (s.ringN === c.windowSize && s.ring[s.ringPos]) s.ringFails--;
    s.ring[s.ringPos] = failed;
    if (failed) s.ringFails++;
    s.ringPos = (s.ringPos + 1) % c.windowSize;
    s.ringN = Math.min(c.windowSize, s.ringN + 1);
  } else {
    const sec = Math.floor(ctx.t / 1000);
    let b = s.buckets.at(-1);
    if (!b || b.sec !== sec) { s.buckets.push((b = { sec, n: 0, f: 0 })); if (s.buckets.length > 60) s.buckets.shift(); }
    b.n++;
    if (failed) b.f++;
  }
  const { n, f } = failureRate(s, c);
  // Count-based windows cap the minimum at the window size, as Resilience4j does.
  const min = c.windowType === "count" ? Math.min(c.minCalls, c.windowSize) : c.minCalls;
  if (n >= min && (f / n) * 100 >= c.threshold) go(s, ctx, "open");
}

function crashB(s: CbState, until: number) {
  s.bDownUntil = until;
  for (const k of s.calls) if (k.due > s.t) k.due = Infinity; // in-flight calls never get an answer
}

/** One call from A to B. Returns when B will answer (Infinity: never) and whether it succeeds. */
function callB(s: CbState, ctx: TickContext<CbConfig>, probe: boolean) {
  const c = ctx.config;
  const f = fault(s);
  s.toB++;
  ctx.metrics.inc("toB");
  let due = Infinity, ok = false;
  if (!bDown(s)) {
    if (f === "errors") due = ctx.t + ERR_MS;
    else {
      // B is a FIFO server at its (warming) capacity; latency = queue wait + a 15 ms base with an exponential tail.
      const cap = c.bCapacity * bWarm(s);
      s.bBusy = Math.max(ctx.t, s.bBusy) + 1000 / cap;
      const wait = s.bBusy - ctx.t;
      if (s.bUpAt >= 0 && bWarm(s) < 1 && wait > CRASH_WAIT) {
        s.reCrashes++;
        ctx.log("error", `B fell over again: cold at ${Math.round(bWarm(s) * 100)}% capacity with a ${(wait / 1000).toFixed(1)} s queue. Restarting.`);
        crashB(s, ctx.t + RESTART_MS);
        s.bUpAt = ctx.t + RESTART_MS;
      } else {
        due = ctx.t + wait + (15 + ctx.rng.exponential(1 / 8)) * (f === "slow" ? 10 : 1);
        ok = !ctx.rng.chance(c.noisePct / 100);
      }
    }
  }
  s.calls.push({ at: ctx.t, due, ok, gen: s.gen, probe });
}

function respond(s: CbState, ctx: TickContext<CbConfig>, latency: number, kind: "ok" | "fail") {
  const c = ctx.config;
  if (kind === "ok") { s.okCalls++; ctx.metrics.inc("ok"); ctx.metrics.observe("latency", latency + A_WORK); return; }
  if (c.fallback) { s.fallbacks++; ctx.metrics.inc("fallback"); ctx.metrics.observe("latency", latency + A_WORK + FALLBACK_MS); return; }
  s.errors++;
  ctx.metrics.inc("error");
  ctx.metrics.observe("latency", latency + A_WORK);
}

function setFault(s: CbState, t: number, f: BFault, on: boolean) {
  if (on) { s.faultStart = t; if (f === "hang") crashB(s, Infinity); return; }
  s.healAt = t;
  if (s.bDownUntil === Infinity) { s.bDownUntil = t; s.bUpAt = t; s.bBusy = t; } // restarted: back, but cold
}

export const cbModel: SimModel<CbConfig, CbState> = {
  init(c) {
    return {
      t: 0, st: "closed", since: 0, gen: 0,
      ring: Array(c.windowType === "count" ? c.windowSize : 0).fill(false), ringN: 0, ringPos: 0, ringFails: 0, buckets: [],
      halfLeft: 0, halfDone: 0, halfFail: 0, calls: [],
      bDownUntil: 0, bUpAt: -1, bBusy: 0, manual: "none", schedOn: false, schedKind: "none", faultStart: -1, healAt: -1,
      recent: [], opens: [], openCount: 0, rejected: 0, toB: 0, fallbacks: 0, errors: 0, okCalls: 0, reCrashes: 0,
      breakerUsed: c.breaker, breakerOff: !c.breaker, rate: c.rate, bCapEff: c.bCapacity, failPct: 0,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    s.rate = c.rate;
    if (c.breaker) s.breakerUsed = true; else s.breakerOff = true;
    if (!c.breaker && s.st !== "closed") { s.st = "closed"; s.gen++; resetWindow(s, c); }
    if (s.bUpAt >= 0 && bWarm(s) >= 1 && !bDown(s)) s.bUpAt = -1;

    const on = c.bFault !== "none" && ctx.t >= c.faultAt * 1000 && ctx.t < (c.faultAt + c.faultFor) * 1000;
    if (on !== s.schedOn) {
      if (on) s.schedKind = c.bFault;
      ctx.log(on ? "error" : "info", on ? `B fault: ${B_FAULTS.find((f) => f.value === c.bFault)!.label}` : `B fixed${s.schedKind === "hang" ? ", restarting cold" : ""}`);
      setFault(s, ctx.t, s.schedKind, on);
      s.schedOn = on;
    }

    // Answers and timeouts, in completion order.
    const done: { k: Call; end: number; ok: boolean }[] = [];
    s.calls = s.calls.filter((k) => {
      const end = Math.min(k.due, k.at + c.timeoutMs);
      if (end > ctx.t) return true;
      done.push({ k, end, ok: k.ok && k.due <= k.at + c.timeoutMs });
      return false;
    });
    done.sort((a, b) => a.end - b.end);
    for (const d of done) { record(s, ctx, d.k, !d.ok); respond(s, ctx, d.end - d.k.at, d.ok ? "ok" : "fail"); }

    if (c.breaker && s.st === "open" && ctx.t - s.since >= c.waitMs) go(s, ctx, "half");

    for (let n = ctx.rng.poisson((c.rate * ctx.dt) / 1000); n > 0; n--) {
      if (!c.breaker || s.st === "closed") { callB(s, ctx, false); continue; }
      if (s.st === "half" && s.halfLeft > 0) { s.halfLeft--; callB(s, ctx, true); continue; }
      // CallNotPermittedException: rejected in microseconds, never reaches B.
      s.rejected++;
      ctx.metrics.inc("rejected");
      respond(s, ctx, 0, "fail");
    }
    s.bCapEff = bDown(s) ? 0 : c.bCapacity * bWarm(s);
    const { n, f } = failureRate(s, c);
    s.failPct = n ? (f / n) * 100 : 0;
    return s;
  },

  actions: {},

  faults: [
    { id: "hang", label: "B hangs", description: "B stops answering: calls wait for A's timeout. Clearing it restarts B cold, at 20% capacity, warming over 20 s.", apply: (s) => { s.manual = "hang"; setFault(s, s.t, "hang", true); return s; }, revert: (s) => { s.manual = "none"; setFault(s, s.t, "hang", false); return s; } },
    { id: "errors", label: "B returns 500s", description: "Every call to B fails fast with a server error.", apply: (s) => { s.manual = "errors"; setFault(s, s.t, "errors", true); return s; }, revert: (s) => { s.manual = "none"; setFault(s, s.t, "errors", false); return s; } },
    { id: "slow", label: "B slows down ×10", description: "B still answers, ten times slower: past a short timeout every call fails.", apply: (s) => { s.manual = "slow"; setFault(s, s.t, "slow", true); return s; }, revert: (s) => { s.manual = "none"; setFault(s, s.t, "slow", false); return s; } },
  ],

  metrics(s, reg, t) {
    const p = reg.histogram("latency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const all = reg.rate("ok", t) + reg.rate("fallback", t) + reg.rate("error", t);
    const share = (k: string) => (all ? (reg.rate(k, t) / all) * 100 : 0);
    return {
      p50: p.p50, p99: p.p99, toB: reg.rate("toB", t), bCap: s.bCapEff, failPct: s.failPct, bWait: Math.max(0, s.bBusy - t), okPct: share("ok"), fallbackPct: share("fallback"), errorPct: share("error"),
      state: s.st === "closed" ? 0 : s.st === "half" ? 1 : 2, opens: s.openCount, reCrashes: s.reCrashes, rejected: reg.rate("rejected", t),
    };
  },
};
