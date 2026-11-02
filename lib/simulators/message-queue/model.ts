import type { Rng, SimModel, TickContext } from "@/lib/sim/engine";

export type Mode = "log" | "queue";
export const MODES: { value: Mode; label: string }[] = [
  { value: "log", label: "Log (Kafka-style)" },
  { value: "queue", label: "Queue (RabbitMQ/SQS-style)" },
];

export interface MqConfig {
  mode: Mode;
  /** Producer messages per second (Poisson). */
  rate: number;
  keys: number;
  keyDist: "uniform" | "hot";
  partitions: number;
  consumers: number;
  /** Mean processing time per message, ms (uniform 0.5×–1.5×). */
  procMs: number;
  /** Chance a processing attempt fails transiently, %. */
  failPct: number;
  /** Log: commit offsets before or after processing. Queue: auto-ack on receive or ack after processing. */
  commit: "after" | "before";
  idempotent: boolean;
  /** Attempts before the message goes to the DLQ (log: retry topic/DLQ; queue: maxReceiveCount). 0 = retry forever. */
  maxAttempts: number;
  visibilityMs: number;
  /** Log mode: a second consumer group reading the same topic. */
  groups: boolean;
  /** Challenge hooks: messages already waiting at t = 0, crash consumer C1 at, produce a poison message at (0 = never). */
  backlog: number;
  crashAt: number;
  poisonAt: number;
}

export const MAX_PARTS = 8;
export const MAX_KEYS = 100;
export const BATCH = 10; // max.poll.records / SQS MaxNumberOfMessages
export const REBALANCE_MS = 1000;
export const COMMIT_MS = 1000;
const RETAIN = 500; // offsets kept below the slowest group's commit, for replay
const MAX_LOG = 30_000; // per partition; past this the producer is refused (keeps memory bounded)
const DLQ_KEEP = 20;
const BURST = 5;
const CRASH_WAIT_MS = 500;
export const CLEARED = 200;

export interface Msg {
  id: number; key: number; seq: number; at: number; poison: boolean;
  /** Bitmask of consumer groups that have processed it (stands in for an unbounded dedupe store). */
  done: number;
  recv: number;
  /** Queue mode: acked/deleted. */
  del: boolean;
}
export interface Work { p: number; off: number; batch: Msg[]; i: number; startAt: number; doneAt: number; tries: number }
export interface Consumer { alive: boolean; cur: Work | null; rr: number }
/** One group's view of one partition: committed offset, fetch position, and processed-up-to offset. */
export interface GPart { committed: number; pos: number; done: number; owner: number }
export interface Group {
  consumers: Consumer[];
  parts: GPart[];
  /** 0 = not rebalancing; otherwise when the paused group gets its new assignment. */
  rebalUntil: number;
  nextCommit: number;
  lastSeq: number[];
  processed: number; dups: number; deduped: number; ooo: number; lost: number;
}
export interface Part { base: number; msgs: Msg[] }
export interface DlqEntry { id: number; key: number; poison: boolean; tries: number }

export interface MqState {
  mode: Mode;
  commit: MqConfig["commit"];
  t: number;
  parts: Part[];
  /** Queue mode: FIFO with a head index (shift() on 10k messages is too slow), plus received-but-unacked messages. */
  ready: Msg[];
  rHead: number;
  inflight: { m: Msg; until: number }[];
  groups: Group[];
  dlq: DlqEntry[];
  dlqCount: number;
  produced: number; rejected: number;
  nextId: number; nextSend: number;
  keySeq: number[];
  burst: boolean; slow: number;
  poisonNext: boolean; crashReq: boolean; crashReqAt: number; recoverReq: boolean;
  autoCrashed: boolean; autoPoisoned: boolean;
  poisonedAt: number; poisonDlqAt: number; clearedAt: number;
  /** Challenge guards: the smallest consumer count, processing time and rate used. */
  minCons: number; minProc: number; minRate: number;
  shrinkWarned: boolean;
}

type Ctx = TickContext<MqConfig>;
const bit = (gi: number) => 1 << gi;
export const label = (gi: number) => (gi ? "B" : "A");

function newGroup(s: MqState, n: number, startAtBase: boolean): Group {
  return {
    consumers: Array.from({ length: n }, () => ({ alive: true, cur: null, rr: 0 })),
    parts: s.parts.map((p) => { const o = startAtBase ? p.base : 0; return { committed: o, pos: o, done: o, owner: -1 }; }),
    rebalUntil: 0, nextCommit: 0, lastSeq: Array(MAX_KEYS).fill(-1),
    processed: 0, dups: 0, deduped: 0, ooo: 0, lost: 0,
  };
}

function assign(s: MqState, g: Group, gi: number, ctx?: Ctx) {
  const alive = g.consumers.flatMap((c, k) => (c.alive ? [k] : []));
  s.parts.forEach((part, p) => {
    const gp = g.parts[p];
    // Committed but never processed: a commit-before-process consumer died holding them.
    for (let off = gp.done; off < gp.committed; off++) {
      const m = part.msgs[off - part.base];
      if (m && !(m.done & bit(gi))) { g.lost++; ctx?.metrics.inc("lost"); }
    }
    gp.owner = alive.length ? alive[p % alive.length] : -1;
    gp.pos = gp.done = Math.max(gp.committed, part.base);
  });
}

function rebalance(s: MqState, g: Group, gi: number, ctx: Ctx, why: string) {
  // A consumer that leaves cleanly commits exactly what it finished; a crashed one commits nothing.
  for (const gp of g.parts) if (g.consumers[gp.owner]?.alive) gp.committed = gp.done;
  for (const c of g.consumers) c.cur = null;
  g.rebalUntil = ctx.t + REBALANCE_MS;
  ctx.log("info", `Group ${label(gi)} rebalancing (${why}): consumption paused ${REBALANCE_MS / 1000} s`);
}

function produce(s: MqState, c: MqConfig, rng: Rng, t: number, ctx?: Ctx) {
  const key = c.keyDist === "hot" && rng.chance(0.5) ? 0 : rng.int(0, Math.min(MAX_KEYS, c.keys) - 1);
  const part = s.mode === "log" ? s.parts[key % s.parts.length] : undefined;
  if (part ? part.msgs.length >= MAX_LOG : s.ready.length - s.rHead >= MAX_LOG * 2) { s.rejected++; return; }
  const m: Msg = { id: s.nextId++, key, seq: s.keySeq[key]++, at: t, poison: s.poisonNext, done: 0, recv: 0, del: false };
  s.produced++;
  ctx?.metrics.inc("produced");
  if (m.poison) { s.poisonNext = false; s.poisonedAt = t; ctx?.log("warn", `Poison message #${m.id} (key ${key}) produced: it fails every time`); }
  if (part) part.msgs.push(m); else s.ready.push(m);
}

function fresh(c: MqConfig, rng: Rng, t: number): MqState {
  const s: MqState = {
    mode: c.mode, commit: c.commit, t,
    parts: c.mode === "log" ? Array.from({ length: c.partitions }, () => ({ base: 0, msgs: [] })) : [],
    ready: [], rHead: 0, inflight: [], groups: [], dlq: [], dlqCount: 0, produced: 0, rejected: 0,
    nextId: 0, nextSend: t + rng.exponential(c.rate) * 1000, keySeq: Array(MAX_KEYS).fill(0),
    burst: false, slow: 1, poisonNext: false, crashReq: false, crashReqAt: Infinity, recoverReq: false, autoCrashed: false, autoPoisoned: false,
    poisonedAt: Infinity, poisonDlqAt: Infinity, clearedAt: Infinity,
    minCons: c.consumers, minProc: c.procMs, minRate: c.rate, shrinkWarned: false,
  };
  s.groups.push(newGroup(s, c.consumers, false));
  if (s.mode === "log") assign(s, s.groups[0], 0);
  for (let i = 0; i < c.backlog; i++) produce(s, c, rng, t);
  return s;
}

const proc = (c: MqConfig, rng: Rng, slow: number) => c.procMs * slow * (0.5 + rng.next());
const backoff = (tries: number) => Math.min(1000, 20 * 2 ** (tries - 1));

function toDlq(s: MqState, m: Msg, tries: number, ctx: Ctx) {
  s.dlqCount++;
  s.dlq = [...s.dlq, { id: m.id, key: m.key, poison: m.poison, tries }].slice(-DLQ_KEEP);
  ctx.metrics.inc("dlq");
  if (m.poison && !Number.isFinite(s.poisonDlqAt)) s.poisonDlqAt = ctx.t;
  ctx.log(m.poison ? "warn" : "info", `#${m.id} (key ${m.key}) moved to the DLQ after ${tries} attempt${tries > 1 ? "s" : ""}`);
}

function record(g: Group, gi: number, m: Msg, idem: boolean, ctx: Ctx) {
  if (m.done & bit(gi)) {
    if (idem) { g.deduped++; ctx.metrics.inc(`deduped${gi}`); } else { g.dups++; ctx.metrics.inc(`dups${gi}`); }
    return;
  }
  m.done |= bit(gi);
  g.processed++;
  ctx.metrics.inc(`processed${gi}`);
  if (m.seq < g.lastSeq[m.key]) { g.ooo++; ctx.metrics.inc(`ooo${gi}`); } else g.lastSeq[m.key] = m.seq;
}

/** Moves the consumer to the next message of its batch that still needs work; idempotent consumers skip seen ids for free. */
function startNext(s: MqState, g: Group, gi: number, con: Consumer, k: number, when: number, ctx: Ctx) {
  const w = con.cur!;
  const c = ctx.config;
  while (w.i < w.batch.length) {
    const m = w.batch[w.i];
    if (!(c.idempotent && m.done & bit(gi))) {
      w.startAt = when; w.tries = 1;
      w.doneAt = when + proc(c, ctx.rng, gi === 0 && k === 0 ? s.slow : 1);
      return;
    }
    g.deduped++; ctx.metrics.inc(`deduped${gi}`);
    if (s.mode === "queue" && s.commit === "after") m.del = true;
    w.i++;
    if (s.mode === "log") g.parts[w.p].done = w.off + w.i;
  }
  con.cur = null;
}

function fetch(s: MqState, g: Group, gi: number, con: Consumer, k: number, when: number, ctx: Ctx): boolean {
  const c = ctx.config;
  const batch: Msg[] = [];
  let p = 0, off = 0;
  if (s.mode === "log") {
    const P = s.parts.length;
    for (let j = 0; j < P && !batch.length; j++) {
      p = (con.rr + j) % P;
      const gp = g.parts[p], part = s.parts[p];
      if (gp.owner !== k) continue;
      const end = part.base + part.msgs.length;
      if (gp.pos >= end) continue;
      off = gp.pos;
      batch.push(...part.msgs.slice(off - part.base, Math.min(end, off + BATCH) - part.base));
      gp.pos += batch.length;
      if (c.commit === "before") gp.committed = gp.pos;
      con.rr = p + 1;
    }
  } else {
    while (batch.length < BATCH && s.rHead < s.ready.length) {
      const m = s.ready[s.rHead++];
      if (m.del) continue;
      m.recv++;
      if (c.maxAttempts && m.recv > c.maxAttempts) { m.del = true; toDlq(s, m, m.recv - 1, ctx); continue; }
      if (c.commit === "before") m.del = true; else s.inflight.push({ m, until: when + c.visibilityMs });
      batch.push(m);
    }
    if (s.rHead > 1000 && s.rHead * 2 > s.ready.length) { s.ready = s.ready.slice(s.rHead); s.rHead = 0; }
  }
  if (!batch.length) return false;
  con.cur = { p, off, batch, i: 0, startAt: when, doneAt: when, tries: 1 };
  startNext(s, g, gi, con, k, when, ctx);
  return true;
}

function complete(s: MqState, g: Group, gi: number, con: Consumer, k: number, ctx: Ctx) {
  const c = ctx.config;
  const w = con.cur!;
  const m = w.batch[w.i];
  const when = w.doneAt;
  const failed = m.poison || ctx.rng.chance(c.failPct / 100);
  if (failed && s.mode === "log") {
    // Log mode retries in place: the partition can't move past this offset until it succeeds or is dead-lettered.
    if (!c.maxAttempts || w.tries < c.maxAttempts) {
      w.tries++;
      w.doneAt = when + backoff(w.tries) + proc(c, ctx.rng, gi === 0 && k === 0 ? s.slow : 1);
      if (w.tries === 6) ctx.log("error", `P${w.p} stuck on offset ${w.off + w.i} (#${m.id}): every retry fails, the partition is blocked`);
      return;
    }
    toDlq(s, m, w.tries, ctx);
  } else if (failed) {
    // Queue mode: no ack, so the broker redelivers after the visibility timeout. Auto-acked messages are just gone.
    if (c.commit === "before" && !(m.done & bit(gi))) { g.lost++; ctx.metrics.inc("lost"); }
  } else {
    record(g, gi, m, c.idempotent, ctx);
    if (s.mode === "queue" && c.commit === "after") m.del = true;
  }
  w.i++;
  if (s.mode === "log") g.parts[w.p].done = w.off + w.i;
  startNext(s, g, gi, con, k, when, ctx);
}

function runGroup(s: MqState, g: Group, gi: number, ctx: Ctx) {
  if (g.rebalUntil) {
    if (ctx.t < g.rebalUntil) return;
    g.rebalUntil = 0;
    assign(s, g, gi, ctx);
  }
  if (s.mode === "log" && ctx.config.commit === "after" && ctx.t >= g.nextCommit) {
    // Periodic commit of processed offsets (auto-commit): a crash replays everything since the last one.
    for (const gp of g.parts) if (g.consumers[gp.owner]?.alive) gp.committed = gp.done;
    g.nextCommit = ctx.t + COMMIT_MS;
  }
  g.consumers.forEach((con, k) => {
    if (!con.alive) return;
    let when = con.cur ? con.cur.doneAt : ctx.t - ctx.dt;
    for (let n = 0; n < 1000; n++) {
      if (!con.cur && !fetch(s, g, gi, con, k, when, ctx)) break;
      if (!con.cur) continue; // whole batch deduped
      if (s.crashReq && gi === 0 && k === 0) { crash(s, ctx); break; }
      if (con.cur.doneAt > ctx.t) break;
      when = con.cur.doneAt;
      complete(s, g, gi, con, k, ctx);
    }
  });
}

/** Queue mode: a graceful leaver hands back what it hasn't processed yet. */
function nack(s: MqState, w: Work) {
  const back = new Set(w.batch.slice(w.i));
  s.inflight = s.inflight.filter((x) => !back.has(x.m));
  for (const m of [...back].reverse()) { m.del = false; if (s.rHead) s.ready[--s.rHead] = m; else s.ready.unshift(m); }
}

function resize(s: MqState, g: Group, gi: number, n: number, ctx: Ctx) {
  if (g.consumers.length === n) return;
  if (s.mode === "log") rebalance(s, g, gi, ctx, n > g.consumers.length ? "consumer joined" : "consumer left");
  while (g.consumers.length > n) { const w = g.consumers.pop()!.cur; if (w) nack(s, w); }
  while (g.consumers.length < n) g.consumers.push({ alive: true, cur: null, rr: 0 });
}

function crash(s: MqState, ctx: Ctx) {
  const g = s.groups[0];
  const con = g.consumers[0];
  s.crashReq = false; s.crashReqAt = Infinity;
  if (!con?.alive) return;
  con.alive = false;
  ctx.log("error", `Consumer C1 crashed${con.cur ? ` mid-message (#${con.cur.batch[con.cur.i]?.id})` : ""}`);
  // Auto-acked messages it was holding are gone for good; unacked ones reappear after the visibility timeout.
  if (s.mode === "queue" && con.cur && s.commit === "before") {
    const n = con.cur.batch.slice(con.cur.i).filter((m) => !(m.done & 1)).length;
    g.lost += n; ctx.metrics.inc("lost", n);
  }
  con.cur = null;
  if (s.mode === "log") rebalance(s, g, 0, ctx, "C1 missed its heartbeat");
}

export const lagOf = (s: MqState, gi: number, p: number) => {
  const part = s.parts[p], gp = s.groups[gi]?.parts[p];
  return part && gp ? part.base + part.msgs.length - gp.committed : 0;
};
export function totalLag(s: MqState, gi = 0) {
  if (s.mode === "queue") return gi ? 0 : s.ready.length - s.rHead + s.inflight.length;
  let n = 0;
  for (let p = 0; p < s.parts.length; p++) n += lagOf(s, gi, p);
  return n;
}

export const mqModel: SimModel<MqConfig, MqState> = {
  init: (c, rng) => fresh(c, rng, 0),

  tick(s, ctx) {
    const c = ctx.config;
    if (c.mode !== s.mode) {
      const { burst, slow } = s;
      Object.assign(s, fresh(c, ctx.rng, ctx.t), { burst, slow });
      ctx.log("warn", `Switched to ${MODES.find((m) => m.value === c.mode)!.label}: new broker, counters reset`);
    }
    s.t = ctx.t;
    s.commit = c.commit;
    s.minCons = Math.min(s.minCons, c.consumers);
    s.minProc = Math.min(s.minProc, c.procMs);
    s.minRate = Math.min(s.minRate, c.rate);

    if (s.mode === "log") {
      if (c.partitions > s.parts.length) {
        while (s.parts.length < c.partitions) { s.parts.push({ base: 0, msgs: [] }); for (const g of s.groups) g.parts.push({ committed: 0, pos: 0, done: 0, owner: -1 }); }
        s.groups.forEach((g, gi) => rebalance(s, g, gi, ctx, "partitions added"));
        ctx.log("warn", "Partitions added: key → partition mapping changed, so per-key order breaks across the move");
      } else if (c.partitions < s.parts.length && !s.shrinkWarned) {
        s.shrinkWarned = true;
        ctx.log("warn", "Kafka can't remove partitions from a topic; keeping the current count");
      }
      if (c.groups && s.groups.length < 2) {
        s.groups.push(newGroup(s, c.consumers, true));
        assign(s, s.groups[1], 1, ctx);
        ctx.log("info", "Group B joined: reads the same log from the earliest retained offset, with its own offsets");
      } else if (!c.groups && s.groups.length > 1) s.groups.pop();
    }
    s.groups.forEach((g, gi) => resize(s, g, gi, c.consumers, ctx));

    if (c.crashAt && !s.autoCrashed && ctx.t >= c.crashAt) { s.autoCrashed = true; s.crashReq = true; }
    // "Mid-message": runGroup crashes C1 the moment it picks up work; an idle C1 crashes after CRASH_WAIT_MS.
    if (s.crashReq) {
      if (!Number.isFinite(s.crashReqAt)) s.crashReqAt = ctx.t;
      if (ctx.t - s.crashReqAt >= CRASH_WAIT_MS) crash(s, ctx);
    }
    if (s.recoverReq) {
      s.recoverReq = false;
      const con = s.groups[0].consumers[0];
      if (con && !con.alive) { con.alive = true; ctx.log("info", "Consumer C1 restarted"); if (s.mode === "log") rebalance(s, s.groups[0], 0, ctx, "C1 rejoined"); }
    }
    if (c.poisonAt && !s.autoPoisoned && ctx.t >= c.poisonAt) { s.autoPoisoned = true; s.poisonNext = true; }

    const rate = c.rate * (s.burst ? BURST : 1);
    while (s.nextSend <= ctx.t) { const t = s.nextSend; s.nextSend += ctx.rng.exponential(rate) * 1000; produce(s, c, ctx.rng, t, ctx); }

    if (s.mode === "queue" && s.inflight.length) {
      const back: Msg[] = [];
      s.inflight = s.inflight.filter((x) => { if (x.m.del) return false; if (x.until > ctx.t) return true; back.push(x.m); return false; });
      for (const m of back.reverse()) { if (s.rHead) s.ready[--s.rHead] = m; else s.ready.unshift(m); }
    }
    s.groups.forEach((g, gi) => runGroup(s, g, gi, ctx));

    // Retention: drop offsets every group has committed, keeping a tail for replay.
    s.parts.forEach((part, p) => {
      const keep = Math.min(...s.groups.map((g) => g.parts[p].committed)) - RETAIN;
      if (keep - part.base > 2000) { part.msgs.splice(0, keep - part.base); part.base = keep; }
    });
    if (c.backlog && !Number.isFinite(s.clearedAt) && totalLag(s) < CLEARED) {
      s.clearedAt = ctx.t;
      ctx.log("info", `Backlog cleared at ${(ctx.t / 1000).toFixed(1)} s`);
    }
    return s;
  },

  actions: {
    poison: (s) => { const n = structuredClone(s); n.poisonNext = true; return n; },
    /** Seek a group back to the earliest retained offset on every partition (log mode only). */
    replay(s, payload) {
      const gi = (payload as { group?: number } | undefined)?.group ?? 0;
      if (s.mode !== "log" || !s.groups[gi]) return s;
      const n = structuredClone(s);
      const g = n.groups[gi];
      n.parts.forEach((part, p) => { g.parts[p].committed = part.base; });
      for (const con of g.consumers) con.cur = null;
      g.rebalUntil = n.t + REBALANCE_MS;
      return n;
    },
  },

  faults: [
    { id: "crash", label: "Crash consumer C1 mid-message", description: "C1 of group A dies while holding a batch. Log mode: its partitions move to the others after a rebalance and resume from the last committed offset. Queue mode: unacked messages reappear after the visibility timeout. Clear it to restart C1.", apply: (s) => { s.crashReq = true; return s; }, revert: (s) => { s.recoverReq = true; return s; } },
    { id: "slow", label: "Slow consumer C1 (×5)", description: "A GC pause or a slow downstream call: C1 of group A takes 5× as long per message. Its partitions build lag while the rest stay current.", apply: (s) => { s.slow = 5; return s; }, revert: (s) => { s.slow = 1; return s; } },
    { id: "poison", label: "Poison message", description: "The next message produced fails every time it is processed. Without an attempt limit it retries forever: in log mode it blocks its whole partition.", apply: (s) => { s.poisonNext = true; return s; }, revert: (s) => s },
    { id: "burst", label: "Producer burst (×5)", description: "Producers send 5× the configured rate. The broker absorbs it; lag grows until consumers catch up.", apply: (s) => { s.burst = true; return s; }, revert: (s) => { s.burst = false; return s; } },
  ],

  metrics(s, reg, t) {
    const g = s.groups[0];
    const m: Record<string, number> = {
      throughput: reg.rate("processed0", t), produced: reg.rate("produced", t),
      lag: totalLag(s), lagB: s.groups[1] ? totalLag(s, 1) : 0,
      dups: g.dups + (s.groups[1]?.dups ?? 0), deduped: g.deduped + (s.groups[1]?.deduped ?? 0),
      lost: g.lost + (s.groups[1]?.lost ?? 0), ooo: g.ooo + (s.groups[1]?.ooo ?? 0),
      dlq: s.dlqCount, processed: g.processed, rejected: s.rejected,
      rebalancing: g.rebalUntil ? 1 : 0,
    };
    for (let p = 0; p < MAX_PARTS; p++) m[`lag${p}`] = s.mode === "queue" ? (p ? 0 : m.lag) : lagOf(s, 0, p);
    return m;
  },
};
