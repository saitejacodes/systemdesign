import type { SimModel, TickContext } from "@/lib/sim/engine";

export type Mode = "orchestration" | "choreography" | "2pc";
export const MODES: { value: Mode; label: string }[] = [
  { value: "orchestration", label: "Saga · orchestration" },
  { value: "choreography", label: "Saga · choreography (events)" },
  { value: "2pc", label: "Two-phase commit (XA)" },
];

export interface SagaConfig {
  mode: Mode;
  orderRate: number;
  /** Chance (%) an order hits a business failure (declined card, no stock, no courier) at payment, inventory or shipping. */
  failPct: number;
  /** Chance (%) a message is lost: half before the receiver acts, half after (the reply or ack is lost). Sagas only. */
  lossPct: number;
  compensate: boolean;
  /** Orchestrator re-sends on timeout / the broker redelivers until acked, with exponential backoff. */
  retry: boolean;
  /** Every step and compensation dedupes on an idempotency key (saga id + step). */
  idempotent: boolean;
  /** One-way network delay. */
  hopMs: number;
  /** Stop placing orders after this many (0 = forever). */
  maxOrders: number;
}

export type Svc = "order" | "payment" | "inventory" | "shipping";
export type NodeId = Svc | "hub";
export const SVCS: Svc[] = ["order", "payment", "inventory", "shipping"];
/** T1..T5 and their compensations. T4/T5 sit after the pivot (payment, stock) and must just be retried. */
export const STEPS = [
  { svc: "order", fwd: "T1 create order PENDING", comp: "C1 cancel order" },
  { svc: "payment", fwd: "T2 capture payment", comp: "C2 refund payment" },
  { svc: "inventory", fwd: "T3 reserve stock", comp: "C3 release stock" },
  { svc: "shipping", fwd: "T4 schedule shipment", comp: "" },
  { svc: "order", fwd: "T5 confirm order", comp: "" },
] as const satisfies readonly { svc: Svc; fwd: string; comp: string }[];
export const FSYNC_MS = 2;
const FLIGHTS_KEEP = 80;
const TRACE_KEEP = 14;
const QUEUE_CAP = 2000;
const BACKOFF_CAP_MS = 1000;

export type Kind = "paidNoOrder" | "stockLeak" | "duplicate" | "overUndo";
/** Inconsistent = a settled order (nothing left in flight or scheduled) whose services disagree. */
export const KINDS: { k: Kind; label: string; rule: string }[] = [
  { k: "paidNoOrder", label: "Paid, no order", rule: "payment captured, order not CONFIRMED" },
  { k: "stockLeak", label: "Stock held for a dead order", rule: "stock reserved, order not CONFIRMED" },
  { k: "duplicate", label: "Applied twice", rule: "charged, reserved or shipped more than once" },
  { k: "overUndo", label: "Over-compensated", rule: "refunded or released more than was taken" },
];

interface Flow { id: number; start: number; inflight: number; settled: boolean; watched: boolean; failAt: number }
export interface Saga extends Flow {
  phase: "fwd" | "comp" | "done" | "cancelled" | "failed";
  step: number; seq: number; tries: number; end: number;
  order: "none" | "pending" | "confirmed" | "cancelled";
  charged: number; reserved: number; shipped: number;
  /** Idempotency keys already applied: bit step*2 (+1 for the compensation). */
  seen: number;
}
export interface Tx extends Flow {
  votes: number; no: boolean; decided: boolean; commit: boolean; inDoubt: boolean;
  /** When each participant took its locks (-1 = holds none). */
  lockAt: number[];
}
export interface Msg {
  kind: "cmd" | "reply" | "timeout" | "event" | "redeliver" | "prep" | "vote" | "decide" | "release";
  at: number; g?: Saga; x?: Tx; step: number; comp: boolean; ok: boolean; lostAck: boolean; seq: number; tries: number; from: NodeId;
}
export interface Flight { from: NodeId; to: NodeId; sent: number; at: number; lost: boolean; comp: boolean; via: boolean }
export interface TraceLine { t: number; text: string; tone: "ok" | "hot" | "over" | "info" }

export interface SagaState {
  t: number; mode: Mode;
  nextOrder: number; nextId: number; forceFail: number;
  msgs: Msg[]; flights: Flight[]; live: Saga[];
  trace: { id: number; two: boolean; open: boolean; lines: TraceLine[] } | null;
  /** Saga mode: the hot stock row is a local lock held for one fsync per reservation. */
  invBusy: number;
  /** 2PC: the hot stock row lock and the transactions queued on it. */
  hot: { owner: Tx | null; queue: Tx[] };
  doubt: Tx[]; crashArmed: boolean; paymentDown: boolean;
  locks: number; plocks: number[];
  placed: number; open: number; completed: number; compensated: number; failed: number; stuck: number; rejected: number;
  inconsistent: number; kinds: Record<Kind, number>;
  retries: number; deduped: number; dupApplied: number; lost: number;
  agg: { pending: number; confirmed: number; cancelled: number; charged: number; reserved: number; shipped: number };
  txs2pc: number; maxDoubt: number; blockedPeak: number; minRate: number;
}

const svcOf = (step: number): Svc => STEPS[step].svc;
const hop = (ctx: TickContext<SagaConfig>) => ctx.config.hopMs * (0.8 + 0.6 * ctx.rng.next());
const timeout = (c: SagaConfig, tries: number) => Math.min(BACKOFF_CAP_MS, (4 * c.hopMs + 3 * FSYNC_MS + 20) * 2 ** tries);
const label = (step: number, comp: boolean) => (comp ? STEPS[step].comp : STEPS[step].fwd);
export const doubtAge = (s: SagaState) => s.doubt.reduce((m, x) => Math.max(m, s.t - Math.min(...x.lockAt.filter((a) => a >= 0), s.t)), 0);

function fly(s: SagaState, f: Flight) {
  s.flights.push(f);
  if (s.flights.length > FLIGHTS_KEEP) s.flights.shift();
}
function note(s: SagaState, w: Flow, t: number, text: string, tone: TraceLine["tone"] = "info") {
  if (!w.watched || !s.trace) return;
  s.trace.lines.push({ t, text, tone });
  if (s.trace.lines.length > TRACE_KEEP) s.trace.lines.shift();
}
/** Follow one flow in the trace panel; a newer interesting flow replaces it only once it has settled. */
function watch(s: SagaState, w: Flow, two: boolean, force = false) {
  if (!force && s.trace?.open) return;
  w.watched = true;
  s.trace = { id: w.id, two, open: true, lines: [] };
}
function unwatch(s: SagaState, w: Flow) { if (w.watched && s.trace?.id === w.id) s.trace.open = false; }
function push(s: SagaState, w: Flow, m: Partial<Msg> & Pick<Msg, "kind" | "at">) {
  w.inflight++;
  s.msgs.push({ step: 0, comp: false, ok: true, lostAck: false, seq: 0, tries: 0, from: "hub", ...m, ...("votes" in w ? { x: w as Tx } : { g: w as Saga }) });
}
/** One roll per send: lost before the receiver acts, or acted on but the reply/ack lost. */
function roll(s: SagaState, ctx: TickContext<SagaConfig>, to: NodeId) {
  const r = ctx.rng.next(), p = ctx.config.lossPct / 100;
  const lostReq = (to === "payment" && s.paymentDown) || r < p / 2;
  if (lostReq || r < p) s.lost++;
  return { lostReq, lostAck: !lostReq && r < p };
}
/** Local transaction time; the hot stock row serialises reservations and releases. */
function proc(s: SagaState, ctx: TickContext<SagaConfig>, svc: Svc, t: number) {
  if (svc !== "inventory") return t + FSYNC_MS;
  const start = Math.max(t, s.invBusy);
  s.invBusy = start + FSYNC_MS;
  ctx.metrics.observe("lock", FSYNC_MS);
  return s.invBusy;
}

/** The service runs one step or compensation. Returns ok, and whether it was dropped as a duplicate. */
function apply(s: SagaState, ctx: TickContext<SagaConfig>, g: Saga, step: number, comp: boolean, t: number) {
  const bit = 1 << (step * 2 + (comp ? 1 : 0));
  const ok = comp || step !== g.failAt;
  const what = label(step, comp);
  if (g.seen & bit) {
    if (ctx.config.idempotent) { s.deduped++; note(s, g, t, `${what}: duplicate, ignored by idempotency key`, "ok"); return { ok, dropped: true }; }
    s.dupApplied++;
    note(s, g, t, `${what}: duplicate APPLIED AGAIN (no idempotency key)`, "over");
  }
  g.seen |= bit;
  if (!ok) { note(s, g, t, `${what}: FAILED (${step === 1 ? "card declined" : step === 2 ? "out of stock" : "no courier"})`, "hot"); return { ok, dropped: false }; }
  const a = s.agg, d = comp ? -1 : 1;
  if (step === 0 || step === 4) {
    const was = g.order;
    g.order = comp ? "cancelled" : step === 0 ? "pending" : "confirmed";
    if (was !== "none") a[was]--;
    a[g.order]++;
  } else if (step === 1) { g.charged += d; a.charged += d; } else if (step === 2) { g.reserved += d; a.reserved += d; } else { g.shipped++; a.shipped++; }
  note(s, g, t, `${what}: done`, comp ? "hot" : "ok");
  return { ok, dropped: false };
}

function anomalies(g: Saga): Kind[] {
  const out: Kind[] = [];
  const conf = g.order === "confirmed";
  if (g.charged > 0 && !conf) out.push("paidNoOrder");
  if (g.reserved > 0 && !conf) out.push("stockLeak");
  if (g.charged > 1 || g.reserved > 1 || g.shipped > 1) out.push("duplicate");
  if (g.charged < 0 || g.reserved < 0) out.push("overUndo");
  return out;
}

/** Called whenever a saga may have gone quiet: nothing in flight and no timer means its fate is final. */
function settle(s: SagaState, ctx: TickContext<SagaConfig>, g: Saga, t: number) {
  if (g.inflight > 0 || g.settled) return;
  g.settled = true;
  s.open--;
  const bad = anomalies(g);
  if (bad.length) {
    s.inconsistent++;
    ctx.metrics.inc("inconsistent");
    for (const k of bad) s.kinds[k]++;
    ctx.log("error", `Order #${g.id} settled INCONSISTENT: ${bad.map((k) => KINDS.find((x) => x.k === k)!.label.toLowerCase()).join(", ")} (order ${g.order}, charged ${g.charged}, reserved ${g.reserved}, shipped ${g.shipped})`);
  }
  if (g.phase === "done") s.completed++;
  else if (g.phase === "cancelled") s.compensated++;
  else if (g.phase === "failed") s.failed++;
  else { s.stuck++; ctx.log("warn", `Order #${g.id} is stuck at ${label(g.step, g.phase === "comp")}: a message was lost and nobody retries it`); }
  if (g.phase === "done" || g.phase === "cancelled") ctx.metrics.observe("latency", g.end - g.start);
  unwatch(s, g);
  note(s, g, t, bad.length ? `SETTLED INCONSISTENT · ${bad.join(", ")}` : g.phase === "done" ? "SETTLED · completed" : g.phase === "cancelled" ? "SETTLED · compensated, nothing left behind" : `SETTLED · ${g.phase === "failed" ? "failed" : "STUCK"}`, bad.length || (g.phase !== "done" && g.phase !== "cancelled") ? "over" : "ok");
}

function terminal(g: Saga, phase: Saga["phase"], t: number) { g.phase = phase; g.end = t; }

// ---- Orchestration: the orchestrator sends each command, waits for the reply, and owns the timer.
function sendCmd(s: SagaState, ctx: TickContext<SagaConfig>, g: Saga, t: number) {
  const comp = g.phase === "comp", to = svcOf(g.step);
  const { lostReq, lostAck } = roll(s, ctx, to);
  const at = t + hop(ctx);
  fly(s, { from: "hub", to, sent: t, at: lostReq ? (t + at) / 2 : at, lost: lostReq, comp, via: false });
  note(s, g, t, `${label(g.step, comp)} → ${to}${g.tries ? ` (retry #${g.tries})` : ""}${lostReq ? " · LOST in transit" : ""}`, lostReq ? "over" : "info");
  if (!lostReq) push(s, g, { kind: "cmd", at, step: g.step, comp, lostAck, seq: g.seq });
  if (ctx.config.retry) push(s, g, { kind: "timeout", at: t + timeout(ctx.config, g.tries), seq: g.seq });
}

function advanceOrch(s: SagaState, ctx: TickContext<SagaConfig>, g: Saga, ok: boolean, t: number) {
  g.seq++;
  g.tries = 0;
  if (g.phase === "comp") {
    if (g.step === 0) return terminal(g, "cancelled", t);
    g.step--;
    return sendCmd(s, ctx, g, t);
  }
  if (ok) {
    if (g.step === 4) return terminal(g, "done", t);
    g.step++;
    return sendCmd(s, ctx, g, t);
  }
  if (!ctx.config.compensate) { note(s, g, t, "No compensations: the orchestrator just reports the failure", "over"); return terminal(g, "failed", t); }
  // Garcia-Molina & Salem: T1..Tj then Cj..C1, so compensate the completed prefix in reverse.
  g.phase = "comp";
  g.step--;
  sendCmd(s, ctx, g, t);
}

// ---- Choreography: each service consumes an event, commits, and publishes the next one via the broker.
function emit(s: SagaState, ctx: TickContext<SagaConfig>, g: Saga, step: number, comp: boolean, from: NodeId, t: number, tries = 0) {
  const to = svcOf(step);
  const { lostReq, lostAck } = roll(s, ctx, to);
  const at = t + hop(ctx) + hop(ctx);
  fly(s, { from, to, sent: t, at: lostReq ? (t + at) / 2 : at, lost: lostReq, comp, via: true });
  note(s, g, t, `${from} publishes → ${label(step, comp)}${tries ? ` (redelivery #${tries})` : ""}${lostReq ? " · LOST before " + to + " read it" : ""}`, lostReq ? "over" : "info");
  if (!lostReq) push(s, g, { kind: "event", at, step, comp, lostAck });
  // The broker redelivers anything the consumer didn't ack (outbox + at-least-once).
  if (ctx.config.retry && (lostReq || lostAck)) push(s, g, { kind: "redeliver", at: t + timeout(ctx.config, tries), step, comp, from, tries: tries + 1 });
}

function onEvent(s: SagaState, ctx: TickContext<SagaConfig>, g: Saga, m: Msg, t: number) {
  const svc = svcOf(m.step);
  const r = apply(s, ctx, g, m.step, m.comp, t);
  if (m.lostAck) note(s, g, t, `${svc} committed but its ack was lost`, "hot");
  if (r.dropped) return;
  const done = proc(s, ctx, svc, t);
  g.step = m.step;
  if (m.comp) return m.step === 0 ? terminal(g, "cancelled", done) : emit(s, ctx, g, m.step - 1, true, svc, done);
  if (r.ok) return m.step === 4 ? terminal(g, "done", done) : emit(s, ctx, g, m.step + 1, false, svc, done);
  if (!ctx.config.compensate) { note(s, g, t, "No compensations: nobody reacts to the failure event", "over"); return terminal(g, "failed", done); }
  g.phase = "comp";
  emit(s, ctx, g, m.step - 1, true, svc, done);
}

// ---- 2PC: PREPARE → votes → coordinator logs the decision (the commit point) → COMMIT/ABORT → release.
function prepare(s: SagaState, ctx: TickContext<SagaConfig>, x: Tx, p: number, t: number) {
  if (p === x.failAt) { push(s, x, { kind: "vote", at: t + FSYNC_MS + hop(ctx), step: p, ok: false }); return; }
  x.lockAt[p] = t;
  s.locks++;
  s.plocks[p]++;
  push(s, x, { kind: "vote", at: t + FSYNC_MS + hop(ctx), step: p, ok: true });
}

function decide(s: SagaState, ctx: TickContext<SagaConfig>, x: Tx, commit: boolean, t: number) {
  x.decided = true;
  x.commit = commit;
  for (let p = 0; p < 4; p++) {
    const at = t + hop(ctx);
    fly(s, { from: "hub", to: SVCS[p], sent: t, at, lost: false, comp: !commit, via: false });
    push(s, x, { kind: "decide", at, step: p, ok: commit });
  }
}

function release(s: SagaState, ctx: TickContext<SagaConfig>, x: Tx, p: number, t: number) {
  if (x.lockAt[p] < 0) return;
  if (p === 2) ctx.metrics.observe("lock", t - x.lockAt[p]);
  x.lockAt[p] = -1;
  s.locks--;
  s.plocks[p]--;
  if (p !== 2) return;
  s.hot.owner = null;
  const next = s.hot.queue.shift();
  if (next) { s.hot.owner = next; prepare(s, ctx, next, 2, t); }
}

function on2pc(s: SagaState, ctx: TickContext<SagaConfig>, x: Tx, m: Msg, t: number) {
  if (m.kind === "prep") {
    if (m.step === 2 && x.failAt !== 2) {
      if (s.hot.owner) { s.hot.queue.push(x); s.blockedPeak = Math.max(s.blockedPeak, s.hot.queue.length); return; }
      s.hot.owner = x;
    }
    return prepare(s, ctx, x, m.step, t);
  }
  if (m.kind === "vote") {
    fly(s, { from: SVCS[m.step], to: "hub", sent: t - ctx.config.hopMs, at: t, lost: false, comp: !m.ok, via: false });
    x.votes++;
    if (!m.ok) x.no = true;
    note(s, x, t, `${SVCS[m.step]} votes ${m.ok ? "YES (prepared, locks held)" : "NO (aborts locally)"}`, m.ok ? "info" : "hot");
    if (x.votes < 4) return;
    if (s.crashArmed && !x.no) {
      s.crashArmed = false;
      x.inDoubt = true;
      s.doubt.push(x);
      watch(s, x, true, true);
      note(s, x, t, "Coordinator CRASHED before logging COMMIT or ABORT", "over");
      note(s, x, t, "Participants are IN DOUBT: may not commit, may not abort. Locks stay held.", "over");
      ctx.log("error", `Coordinator crashed after PREPARE of tx #${x.id}: all four participants voted YES and now hold their locks until it comes back`);
      return;
    }
    note(s, x, t + FSYNC_MS, `Coordinator logs ${x.no ? "ABORT" : "COMMIT"} (the commit point)`, x.no ? "hot" : "ok");
    return decide(s, ctx, x, !x.no, t + FSYNC_MS);
  }
  if (m.kind === "decide") { if (x.lockAt[m.step] >= 0) push(s, x, { kind: "release", at: t + FSYNC_MS, step: m.step }); return; }
  release(s, ctx, x, m.step, t);
}

function finishTx(s: SagaState, ctx: TickContext<SagaConfig>, x: Tx, t: number) {
  if (x.inflight > 0 || !x.decided || x.settled) return;
  x.settled = true;
  s.open--;
  if (x.commit) s.completed++; else s.compensated++;
  ctx.metrics.observe("latency", t - x.start);
  unwatch(s, x);
  note(s, x, t, x.commit ? "Committed everywhere, locks released" : "Aborted everywhere, locks released", x.commit ? "ok" : "hot");
}

function start(s: SagaState, ctx: TickContext<SagaConfig>, t: number) {
  const c = ctx.config;
  const id = ++s.nextId;
  s.placed++;
  const failAt = s.forceFail || (ctx.rng.chance(c.failPct / 100) ? ctx.rng.int(1, 3) : -1);
  const forced = !!s.forceFail;
  s.forceFail = 0;
  if (c.mode === "2pc") {
    if (s.hot.queue.length >= QUEUE_CAP) { s.rejected++; s.placed--; return; }
    const x: Tx = { id, start: t, inflight: 0, settled: false, watched: false, failAt, votes: 0, no: false, decided: false, commit: false, inDoubt: false, lockAt: [-1, -1, -1, -1] };
    s.open++;
    s.txs2pc++;
    if (failAt > 0 || forced || !s.trace) watch(s, x, true, forced);
    note(s, x, t, `Tx #${id}: coordinator sends PREPARE to 4 participants`);
    for (let p = 0; p < 4; p++) {
      const at = t + hop(ctx);
      fly(s, { from: "hub", to: SVCS[p], sent: t, at, lost: false, comp: false, via: false });
      push(s, x, { kind: "prep", at, step: p });
    }
    return;
  }
  const g: Saga = { id, start: t, inflight: 0, settled: false, watched: false, failAt, phase: "fwd", step: 0, seq: 0, tries: 0, end: 0, order: "none", charged: 0, reserved: 0, shipped: 0, seen: 0 };
  s.open++;
  s.live.push(g);
  if (failAt > 0 || forced || !s.trace) watch(s, g, false, forced);
  note(s, g, t, `Order #${id} starts (${c.mode})${failAt > 0 ? ` · will fail at ${STEPS[failAt].svc}` : ""}`);
  if (c.mode === "orchestration") sendCmd(s, ctx, g, t);
  else { apply(s, ctx, g, 0, false, t); g.step = 0; emit(s, ctx, g, 1, false, "order", t + FSYNC_MS); }
  settle(s, ctx, g, t);
}

function handle(s: SagaState, ctx: TickContext<SagaConfig>, m: Msg) {
  const t = m.at;
  if (m.x) { m.x.inflight--; on2pc(s, ctx, m.x, m, t); return finishTx(s, ctx, m.x, t); }
  const g = m.g!;
  g.inflight--;
  if (m.kind === "cmd") {
    const svc = svcOf(m.step);
    const r = apply(s, ctx, g, m.step, m.comp, t);
    const done = proc(s, ctx, svc, t);
    const at = done + hop(ctx);
    fly(s, { from: svc, to: "hub", sent: done, at: m.lostAck ? (done + at) / 2 : at, lost: m.lostAck, comp: m.comp, via: false });
    if (m.lostAck) note(s, g, done, `${svc}'s reply was LOST (the work is done)`, "over");
    else push(s, g, { kind: "reply", at, step: m.step, comp: m.comp, ok: r.ok, seq: m.seq });
  } else if (m.kind === "reply") {
    if (m.seq === g.seq) advanceOrch(s, ctx, g, m.ok, t);
  } else if (m.kind === "timeout") {
    if (m.seq === g.seq && g.phase !== "done" && g.phase !== "cancelled") {
      g.tries++;
      s.retries++;
      ctx.metrics.inc("retries");
      sendCmd(s, ctx, g, t);
    }
  } else if (m.kind === "event") onEvent(s, ctx, g, m, t);
  else if (m.kind === "redeliver") { s.retries++; ctx.metrics.inc("retries"); emit(s, ctx, g, m.step, m.comp, m.from, t, m.tries); }
  settle(s, ctx, g, t);
}

const failNext = (s: SagaState, p?: unknown) => {
  const step = Number((p as { step?: number } | undefined)?.step);
  const n = structuredClone(s);
  n.forceFail = step >= 1 && step <= 3 ? step : 0;
  return n;
};
const crash = (s: SagaState) => { s.crashArmed = true; return s; };
/** The coordinator restarts and reads its log: no decision record for an in-doubt tx means ABORT (presumed abort). */
function recover(s: SagaState) {
  s.crashArmed = false;
  for (const x of s.doubt) {
    x.inDoubt = false;
    x.decided = true;
    x.commit = false;
    for (let p = 0; p < 4; p++) if (x.lockAt[p] >= 0) push(s, x, { kind: "release", at: s.t + FSYNC_MS, step: p });
    note(s, x, s.t, "Coordinator back: no COMMIT in its log, so ABORT. Locks released.", "hot");
  }
  s.doubt = [];
  return s;
}

export const sagaModel: SimModel<SagaConfig, SagaState> = {
  init(c, rng) {
    return {
      t: 0, mode: c.mode, nextOrder: rng.exponential(c.orderRate) * 1000, nextId: 0, forceFail: 0,
      msgs: [], flights: [], live: [], trace: null, invBusy: 0, hot: { owner: null, queue: [] }, doubt: [], crashArmed: false, paymentDown: false,
      locks: 0, plocks: [0, 0, 0, 0],
      placed: 0, open: 0, completed: 0, compensated: 0, failed: 0, stuck: 0, rejected: 0,
      inconsistent: 0, kinds: { paidNoOrder: 0, stockLeak: 0, duplicate: 0, overUndo: 0 },
      retries: 0, deduped: 0, dupApplied: 0, lost: 0,
      agg: { pending: 0, confirmed: 0, cancelled: 0, charged: 0, reserved: 0, shipped: 0 },
      txs2pc: 0, maxDoubt: 0, blockedPeak: 0, minRate: c.orderRate,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    const t = (s.t = ctx.t);
    s.mode = c.mode;
    s.minRate = Math.min(s.minRate, c.orderRate);
    const capped = () => c.maxOrders > 0 && s.placed >= c.maxOrders;
    if (capped()) s.nextOrder = Math.max(s.nextOrder, t);
    while (s.nextOrder <= t && !capped()) { const t0 = s.nextOrder; s.nextOrder += ctx.rng.exponential(c.orderRate) * 1000; start(s, ctx, t0); }

    // Deliver due messages in time order; handlers may schedule more inside this tick.
    for (;;) {
      let k = -1;
      for (let i = 0; i < s.msgs.length; i++) if (s.msgs[i].at <= t && (k < 0 || s.msgs[i].at < s.msgs[k].at)) k = i;
      if (k < 0) break;
      const m = s.msgs[k];
      s.msgs[k] = s.msgs[s.msgs.length - 1];
      s.msgs.pop();
      handle(s, ctx, m);
    }
    if (s.live.some((g) => g.settled)) s.live = s.live.filter((g) => !g.settled);
    if (s.doubt.length) s.maxDoubt = Math.max(s.maxDoubt, doubtAge(s));
    if (s.flights.length && s.flights[0].at < t - 400) s.flights = s.flights.filter((f) => f.at >= t - 400);
    return s;
  },

  actions: {
    failNext,
    crashCoordinator: (s) => crash(structuredClone(s)),
    recoverCoordinator: (s) => recover(structuredClone(s)),
  },

  faults: [
    { id: "coordinator-crash", label: "Crash the 2PC coordinator after PREPARE", description: "2PC mode: the coordinator dies right after the next transaction's participants all vote YES, before it logs a decision. They hold their locks, in doubt, until you clear this fault (the coordinator restarts and aborts).", apply: crash, revert: recover },
    { id: "payment-down", label: "Payment service outage", description: "Every message to the payment service is lost. Without retries those sagas are stuck forever; with retries they back off and resume when it returns.", apply: (s) => { s.paymentDown = true; return s; }, revert: (s) => { s.paymentDown = false; return s; } },
  ],

  metrics(s, reg) {
    const lat = reg.histogram("latency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const lock = reg.histogram("lock")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    return {
      completed: s.completed, compensated: s.compensated, stuck: s.stuck + s.doubt.length, inconsistent: s.inconsistent, failed: s.failed,
      inFlight: s.open, retries: s.retries, deduped: s.deduped, dupApplied: s.dupApplied,
      p50: lat.p50, p99: lat.p99, lockP99: lock.p99, locksHeld: s.locks, blocked: s.hot.queue.length, doubtMs: doubtAge(s),
    };
  },
};
