import type { Rng, SimModel, TickContext } from "@/lib/sim/engine";

export type Strategy = "rolling" | "bluegreen" | "canary";
export type Build = "mystery" | "good" | "bad";
export type Mode = "release" | "migration";

export const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "rolling", label: "Rolling update" },
  { value: "bluegreen", label: "Blue-green" },
  { value: "canary", label: "Canary" },
];
export const CANARY_PRESETS = ["1,5,25,50,100", "10,25,50,100", "25,50,100", "50,100"].map((v) => ({ value: v, label: v.split(",").join(" → ") + "%" }));

export interface DeployConfig {
  mode: Mode;
  strategy: Strategy;
  /** The v2 build. "mystery" is good or bad by seed; the view hides which until errors show. */
  build: Build;
  rps: number;
  /** Kubernetes RollingUpdate: pods allowed above / below the desired count during a rollout. */
  maxSurge: number;
  maxUnavailable: number;
  canarySteps: string;
  /** Canary pause per step; blue-green keeps blue this long after the switch. */
  stepMs: number;
  analysis: boolean;
  analysisMs: number;
  /** Analysis fails a window whose v2 error rate is above this, %. */
  errorThreshold: number;
  badErrorPct: number;
  /** Image pull + boot + readiness probe passing. */
  startMs: number;
}

export const N = 10;
export const USERS = 5000;
export const POD_RPS = 25;
/** Fewer v2 requests than this in a window is inconclusive: 1 error in 3 requests is noise, not a 33% error rate. */
export const MIN_SAMPLES = 20;
const TRAIL = 30;

export interface Pod { id: number; ver: 1 | 2; readyAt: number; warmAt: number }
export interface Analysis { at: number; req: number; err: number; verdict: "pass" | "fail" | "inconclusive" }
export interface Deploy {
  strategy: Strategy;
  from: number;
  /** Canary step index. */
  step: number;
  /** When traffic moved for this step (bake start); -1 while pods are still starting. */
  stepAt: number;
  /** Share of traffic the router sends to v2 (blue-green, canary). */
  weight: number;
  rollback?: { at: number; manual: boolean };
  end?: number;
  outcome?: "promoted" | "rolledBack";
  winAt: number; winReq: number; winErr: number;
  passes: number;
  last?: Analysis;
}
export interface Trail { pod: number; ver: 1 | 2; at: number; err: boolean }

export type ColName = "name" | "full";
export interface Code { id: string; label: string; writes: ColName[]; reads: ColName }
export const CODES: Record<string, Code> = {
  v1: { id: "v1", label: "app v1 · writes name, reads name", writes: ["name"], reads: "name" },
  dual: { id: "dual", label: "app v2 · writes both, reads name", writes: ["name", "full"], reads: "name" },
  readNew: { id: "readNew", label: "app v3 · writes both, reads full_name", writes: ["name", "full"], reads: "full" },
  newOnly: { id: "newOnly", label: "app v4 · writes and reads full_name", writes: ["full"], reads: "full" },
};
export interface MigStep { id: string; label: string; kind: "ddl" | "deploy" | "backfill"; code?: string; ms: number }
export const MIG_STEPS: MigStep[] = [
  { id: "add", label: "ALTER TABLE users ADD COLUMN full_name (nullable)", kind: "ddl", ms: 1000 },
  { id: "dual", label: "Deploy app v2: write both columns, read name", kind: "deploy", code: "dual", ms: 4000 },
  { id: "backfill", label: "Backfill: UPDATE users SET full_name = name", kind: "backfill", ms: 3000 },
  { id: "readNew", label: "Deploy app v3: write both, read full_name", kind: "deploy", code: "readNew", ms: 4000 },
  { id: "newOnly", label: "Deploy app v4: stop writing name", kind: "deploy", code: "newOnly", ms: 4000 },
  { id: "drop", label: "ALTER TABLE users DROP COLUMN name", kind: "ddl", ms: 1000 },
];
export const MIG_START = ["add", "readNew", "dual", "backfill", "drop", "newOnly"];
export const ROWS = 200;
const MIG_RPS = 40;
const BIT: Record<ColName, number> = { name: 1, full: 2 };

export interface Mig {
  order: string[];
  running: boolean;
  idx: number;
  stepAt: number;
  cols: Record<ColName, boolean>;
  /** Per row: bit 1 = name holds the current value, bit 2 = full_name does. */
  rows: Uint8Array;
  code: string;
  prev: string;
  backfilled: number;
  failed: number;
  bad: number;
  perStep: { failed: number; bad: number }[];
  reasons: string[];
  runs: number;
  cleanRuns: number;
}

export interface DeployState {
  t: number;
  pods: Pod[];
  nextId: number;
  mysteryBad: boolean;
  /** Ground truth for this tick (from config + seed); the view must not show it until v2 errors appear. */
  bad: boolean;
  live: 1 | 2;
  deploy: Deploy | null;
  hit: Uint8Array;
  affected: number;
  requests: number; errors: number; bugErrors: number; overloadErrors: number; coldErrors: number;
  v2Requests: number;
  peakExtra: number;
  /** Fault flags. */
  noReadiness: boolean;
  spike: number;
  load: number;
  trail: Trail[];
  deploys: number;
  mig: Mig;
}

export const isReady = (p: Pod, t: number) => t >= p.readyAt;
export const canarySteps = (str: string) => { const s = str.split(",").map(Number).filter((x) => x > 0 && x <= 100); return s.at(-1) === 100 ? s : [...s, 100]; };
const active = (s: DeployState) => (s.deploy && s.deploy.end === undefined ? s.deploy : null);

function newMig(order = MIG_START): Mig {
  return { order: [...order], running: false, idx: 0, stepAt: 0, cols: { name: true, full: false }, rows: new Uint8Array(ROWS).fill(BIT.name), code: "v1", prev: "v1", backfilled: 0, failed: 0, bad: 0, perStep: MIG_STEPS.map(() => ({ failed: 0, bad: 0 })), reasons: [], runs: 0, cleanRuns: 0 };
}

function create(s: DeployState, ver: 1 | 2, n: number, c: DeployConfig, rng: Rng) {
  for (let i = 0; i < n; i++) {
    const warmAt = s.t + c.startMs * (0.9 + 0.2 * rng.next());
    // Without a readiness probe the pod takes traffic the moment its process starts.
    s.pods.push({ id: s.nextId++, ver, readyAt: s.noReadiness ? s.t : warmAt, warmAt });
  }
}

/** Removes up to n pods of a version, not-ready ones first (they serve nothing). */
function kill(s: DeployState, ver: 1 | 2, n: number) {
  if (n <= 0) return;
  const mine = s.pods.filter((p) => p.ver === ver).sort((a, b) => Number(isReady(a, s.t)) - Number(isReady(b, s.t)));
  const gone = new Set(mine.slice(0, n).map((p) => p.id));
  s.pods = s.pods.filter((p) => !gone.has(p.id));
}

const count = (s: DeployState, ver: 1 | 2, ready = false) => s.pods.filter((p) => p.ver === ver && (!ready || isReady(p, s.t))).length;

/**
 * One reconcile of the Kubernetes Deployment controller: total pods ≤ N + maxSurge and
 * available pods ≥ N − maxUnavailable. Returns true once all N pods run `ver` and are ready.
 */
function rollTo(s: DeployState, ver: 1 | 2, c: DeployConfig, rng: Rng) {
  const surge = c.maxSurge || (c.maxUnavailable ? 0 : 1); // k8s rejects both = 0
  const other = ver === 1 ? 2 : 1;
  create(s, ver, Math.min(N - count(s, ver), N + surge - s.pods.length), c, rng);
  kill(s, other, count(s, other) - count(s, other, true)); // unhealthy old pods count for nothing
  kill(s, other, s.pods.filter((p) => isReady(p, s.t)).length - (N - c.maxUnavailable));
  return count(s, ver, true) === N && count(s, other) === 0;
}

function finish(s: DeployState, d: Deploy, outcome: "promoted" | "rolledBack", ctx: TickContext<DeployConfig>) {
  d.end = s.t;
  d.outcome = outcome;
  s.live = outcome === "promoted" ? 2 : 1;
  ctx.log(outcome === "promoted" ? "info" : "warn", outcome === "promoted"
    ? `v2 promoted: all ${N} pods on v2 after ${((d.end - d.from) / 1000).toFixed(1)} s`
    : `Rollback complete: back on v1 ${((d.end - d.rollback!.at) / 1000).toFixed(1)} s after the decision`);
}

function startRollback(s: DeployState, d: Deploy, manual: boolean) {
  if (d.rollback || d.end !== undefined) return;
  d.rollback = { at: s.t, manual };
}

/** Argo Rollouts-style analysis: every interval, fail if v2's error rate is over the threshold with enough samples. */
function analyze(s: DeployState, d: Deploy, ctx: TickContext<DeployConfig>) {
  const c = ctx.config;
  if (!c.analysis || s.t - d.winAt < c.analysisMs) return;
  d.winAt = s.t;
  if (d.winReq < MIN_SAMPLES) { d.last = { at: s.t, req: d.winReq, err: d.winErr, verdict: "inconclusive" }; return; }
  const fail = (d.winErr / d.winReq) * 100 > c.errorThreshold;
  d.last = { at: s.t, req: d.winReq, err: d.winErr, verdict: fail ? "fail" : "pass" };
  if (fail) {
    ctx.log("error", `Analysis failed: v2 error rate ${((d.winErr / d.winReq) * 100).toFixed(1)}% > ${c.errorThreshold}% over ${d.winReq} requests. Rolling back.`);
    startRollback(s, d, false);
  } else d.passes++;
  d.winReq = 0; d.winErr = 0;
}

const shift = (d: Deploy, t: number, w: number) => { d.weight = w; d.stepAt = t; d.winAt = t; d.winReq = 0; d.winErr = 0; d.passes = 0; };

function control(s: DeployState, d: Deploy, ctx: TickContext<DeployConfig>) {
  const c = ctx.config;
  if (d.rollback) {
    if (d.strategy === "rolling") { if (rollTo(s, 1, c, ctx.rng)) finish(s, d, "rolledBack", ctx); return; }
    // Bring stable back to full size first; routing sends it all the traffic it can carry meanwhile.
    create(s, 1, N - count(s, 1), c, ctx.rng);
    if (count(s, 1, true) >= N) { kill(s, 2, count(s, 2)); finish(s, d, "rolledBack", ctx); }
    return;
  }
  if (d.strategy === "rolling") { if (rollTo(s, 2, c, ctx.rng)) finish(s, d, "promoted", ctx); return; }
  if (d.strategy === "bluegreen") {
    if (d.stepAt < 0) {
      create(s, 2, N - count(s, 2), c, ctx.rng);
      if (count(s, 2, true) >= N) { shift(d, s.t, 1); ctx.log("info", "Router switched: 100% of traffic to green (v2). Blue (v1) kept warm for rollback."); }
      return;
    }
    analyze(s, d, ctx);
    if (!d.rollback && s.t - d.stepAt >= c.stepMs && (!c.analysis || d.passes > 0)) { kill(s, 1, count(s, 1)); finish(s, d, "promoted", ctx); }
    return;
  }
  const steps = canarySteps(c.canarySteps);
  const w = steps[Math.min(d.step, steps.length - 1)];
  if (d.stepAt < 0) {
    const target = w >= 100 ? N : Math.ceil((w * N) / 100);
    create(s, 2, target - count(s, 2), c, ctx.rng);
    if (count(s, 2, true) < target) return;
    shift(d, s.t, w / 100);
    // Dynamic stable scale: stable keeps just enough pods for its remaining share.
    kill(s, 1, count(s, 1) - (w >= 100 ? 0 : Math.ceil(((100 - w) * N) / 100)));
    if (w >= 100) { finish(s, d, "promoted", ctx); return; }
    ctx.log("info", `Canary at ${w}% of traffic on ${target} pod${target > 1 ? "s" : ""}`);
    return;
  }
  analyze(s, d, ctx);
  if (!d.rollback && s.t - d.stepAt >= c.stepMs && (!c.analysis || d.passes > 0)) { d.step++; d.stepAt = -1; }
}

/** Share of traffic each version gets. Rolling: the Service spreads requests over every ready pod. */
export function shares(s: DeployState): [number, number] {
  const r1 = count(s, 1, true), r2 = count(s, 2, true);
  const d = active(s);
  if (d && d.strategy !== "rolling") {
    if (d.rollback) { const s1 = r2 === 0 ? 1 : r1 ? Math.min(1, (r1 * POD_RPS) / Math.max(1, s.load)) : 0; return [s1, 1 - s1]; }
    return [1 - d.weight, d.weight];
  }
  return r1 + r2 ? [r1 / (r1 + r2), r2 / (r1 + r2)] : [1, 0];
}

function serve(s: DeployState, ctx: TickContext<DeployConfig>) {
  const c = ctx.config;
  s.load = c.rps * s.spike;
  const sh = shares(s);
  const ready: Pod[][] = [[], s.pods.filter((p) => p.ver === 1 && isReady(p, s.t)), s.pods.filter((p) => p.ver === 2 && isReady(p, s.t))];
  // Requests beyond a group's capacity get 503s.
  const over = [0, 1, 2].map((g) => { const gl = s.load * (sh[g - 1] ?? 0); const cap = ready[g].length * POD_RPS; return g && gl > cap ? 1 - cap / gl : 0; });
  const d = active(s);
  const n = ctx.rng.poisson((s.load * ctx.dt) / 1000);
  for (let i = 0; i < n; i++) {
    const user = ctx.rng.int(0, USERS - 1);
    const g = ctx.rng.next() < sh[1] ? 2 : 1;
    const pod = ready[g].length ? ctx.rng.pick(ready[g]) : undefined;
    let err = true;
    if (!pod || ctx.rng.next() < over[g]) s.overloadErrors++;
    else if (s.t < pod.warmAt) s.coldErrors++;
    else if (pod.ver === 2 && s.bad && ctx.rng.next() < c.badErrorPct / 100) s.bugErrors++;
    else err = false;
    s.requests++;
    ctx.metrics.inc("req");
    if (g === 2) { s.v2Requests++; if (d) { d.winReq++; if (err) d.winErr++; } }
    if (err) {
      s.errors++;
      ctx.metrics.inc("err");
      if (!s.hit[user]) { s.hit[user] = 1; s.affected++; }
    }
    if (pod && (err || i % 3 === 0)) { s.trail.push({ pod: pod.id, ver: pod.ver, at: s.t, err }); if (s.trail.length > TRAIL) s.trail.shift(); }
  }
}

function migTick(m: Mig, ctx: TickContext<DeployConfig>) {
  const t = ctx.t;
  const st = MIG_STEPS.find((x) => x.id === m.order[m.idx])!;
  const p = Math.min(1, (t - m.stepAt) / st.ms);
  const tally = m.perStep[m.idx];
  const fail = (why: string, kind: "failed" | "bad") => {
    m[kind]++; tally[kind]++;
    if (!m.reasons.includes(why)) { m.reasons.push(why); if (m.reasons.length > 6) m.reasons.shift(); ctx.log("error", why); }
  };
  if (st.kind === "backfill" && m.cols.full) {
    for (const end = Math.floor(p * ROWS); m.backfilled < end; m.backfilled++) if (m.cols.name && m.rows[m.backfilled] & BIT.name) m.rows[m.backfilled] |= BIT.full;
  }
  const n = ctx.rng.poisson((MIG_RPS * ctx.dt) / 1000);
  for (let i = 0; i < n; i++) {
    const code = CODES[st.kind === "deploy" && ctx.rng.next() >= p ? m.prev : m.code];
    const r = ctx.rng.int(0, ROWS - 1);
    if (ctx.rng.next() < 0.7) {
      const col = code.reads;
      if (!m.cols[col]) fail(`${code.label.split(" ·")[0]}: SELECT ${col === "full" ? "full_name" : "name"} → ERROR column does not exist`, "failed");
      else if (!(m.rows[r] & BIT[col])) fail(`${code.label.split(" ·")[0]}: read ${col === "full" ? "full_name" : "name"} → NULL or stale value shown to the user`, "bad");
      continue;
    }
    const missing = code.writes.find((w) => !m.cols[w]);
    if (missing) { fail(`${code.label.split(" ·")[0]}: write ${missing === "full" ? "full_name" : "name"} → ERROR column does not exist`, "failed"); continue; }
    // A column this code doesn't write goes stale on update.
    let v = 0;
    for (const w of code.writes) v |= BIT[w];
    m.rows[r] = v;
  }
  if (t - m.stepAt < st.ms) return;
  m.prev = m.code;
  m.idx++;
  m.stepAt = t;
  if (m.idx >= m.order.length) {
    m.running = false;
    m.runs++;
    if (!m.failed && !m.bad) m.cleanRuns++;
    ctx.log(m.failed || m.bad ? "error" : "info", m.failed || m.bad ? `Migration finished with ${m.failed} failed requests and ${m.bad} wrong reads` : "Migration finished: column renamed with zero errors");
    return;
  }
  beginStep(m, ctx);
}

function beginStep(m: Mig, ctx: TickContext<DeployConfig>) {
  const st = MIG_STEPS.find((x) => x.id === m.order[m.idx])!;
  ctx.log("info", `Step ${m.idx + 1}: ${st.label}`);
  if (st.id === "add") { m.cols.full = true; for (let i = 0; i < ROWS; i++) m.rows[i] &= ~BIT.full; }
  if (st.id === "drop") { m.cols.name = false; for (let i = 0; i < ROWS; i++) m.rows[i] &= ~BIT.name; }
  if (st.kind === "deploy") m.code = st.code!;
  if (st.kind === "backfill") {
    m.backfilled = 0;
    if (!m.cols.full) { m.failed++; m.perStep[m.idx].failed++; m.reasons.push("Backfill → ERROR column full_name does not exist"); ctx.log("error", "Backfill failed: column full_name does not exist yet"); }
  }
}

export const deployModel: SimModel<DeployConfig, DeployState> = {
  init(c, rng) {
    const s: DeployState = {
      t: 0, pods: [], nextId: 1, mysteryBad: rng.chance(0.5), bad: c.build === "bad", live: 1, deploy: null,
      hit: new Uint8Array(USERS), affected: 0, requests: 0, errors: 0, bugErrors: 0, overloadErrors: 0, coldErrors: 0, v2Requests: 0,
      peakExtra: 0, noReadiness: false, spike: 1, load: c.rps, trail: [], deploys: 0, mig: newMig(),
    };
    for (let i = 0; i < N; i++) s.pods.push({ id: s.nextId++, ver: 1, readyAt: 0, warmAt: 0 });
    return s;
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    s.bad = c.build === "bad" || (c.build === "mystery" && s.mysteryBad);
    if (c.mode === "migration") {
      if (s.mig.running) { if (s.mig.stepAt < 0) { s.mig.stepAt = s.t; beginStep(s.mig, ctx); } migTick(s.mig, ctx); }
      return s;
    }
    const d = active(s);
    if (d) control(s, d, ctx);
    else create(s, s.live, N - count(s, s.live), c, ctx.rng); // the ReplicaSet replaces crashed pods
    s.peakExtra = Math.max(s.peakExtra, s.pods.length - N);
    serve(s, ctx);
    return s;
  },

  actions: {
    /** payload: { strategy }. Actions don't see the config, so the view passes it. */
    deploy(s, payload) {
      if (active(s) || s.live === 2) return s;
      const n = structuredClone(s);
      const strategy = (payload as { strategy?: Strategy } | undefined)?.strategy ?? "rolling";
      n.deploy = { strategy, from: n.t, step: 0, stepAt: -1, weight: 0, winAt: n.t, winReq: 0, winErr: 0, passes: 0 };
      n.deploys++;
      n.peakExtra = 0;
      return n;
    },
    rollback(s) {
      const d = active(s);
      if (!d || d.rollback) return s;
      const n = structuredClone(s);
      startRollback(n, n.deploy!, true);
      return n;
    },
    migMove(s, payload) {
      const { id, dir } = payload as { id: string; dir: -1 | 1 };
      if (s.mig.running) return s;
      const n = structuredClone(s);
      const o = n.mig.order, i = o.indexOf(id), j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return s;
      [o[i], o[j]] = [o[j], o[i]];
      return n;
    },
    migOrder(s, payload) {
      const order = payload as string[];
      if (s.mig.running || order.length !== MIG_STEPS.length || !MIG_STEPS.every((x) => order.includes(x.id))) return s;
      const n = structuredClone(s);
      n.mig.order = [...order];
      return n;
    },
    migRun(s) {
      if (s.mig.running) return s;
      const n = structuredClone(s);
      n.mig = { ...newMig(n.mig.order), runs: n.mig.runs, cleanRuns: n.mig.cleanRuns, running: true, stepAt: -1 };
      return n;
    },
  },

  faults: [
    { id: "no-readiness", label: "Remove the readiness probe", description: "New pods count as ready the moment they start, so the rollout races ahead and users hit pods that are still booting.", apply: (s) => { s.noReadiness = true; return s; }, revert: (s) => { s.noReadiness = false; return s; } },
    { id: "spike", label: "Traffic peak (+20%)", description: "240 req/s on a fleet sized for 250: one missing pod now means 503s. Watch what maxUnavailable does.", apply: (s) => { s.spike = 1.2; return s; }, revert: (s) => { s.spike = 1; return s; } },
    { id: "crash", label: "Crash a pod", description: "One serving pod dies. The controller starts a replacement, which needs the full start time.", apply: (s) => { const p = s.pods.find((x) => isReady(x, s.t)); if (p) s.pods = s.pods.filter((x) => x !== p); return s; }, revert: (s) => s },
  ],

  metrics(s, reg, t) {
    const d = s.deploy;
    const req = reg.rate("req", t);
    const sh = shares(s);
    return {
      affected: s.affected,
      affectedPct: (s.affected / USERS) * 100,
      errPct: req ? Math.min(100, (reg.rate("err", t) / req) * 100) : 0,
      rps: req,
      v2Pct: sh[1] * 100,
      deployS: d ? ((d.end ?? s.t) - d.from) / 1000 : 0,
      rollbackS: d?.rollback ? ((d.end ?? s.t) - d.rollback.at) / 1000 : 0,
      extraPct: (s.peakExtra / N) * 100,
      pods: s.pods.length,
      v1Ready: count(s, 1, true),
      v2Ready: count(s, 2, true),
      errors: s.errors,
      migFailed: s.mig.failed,
      migBad: s.mig.bad,
    };
  },
};
