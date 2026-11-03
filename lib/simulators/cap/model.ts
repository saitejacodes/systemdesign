import type { Rng, SimModel, TickContext } from "@/lib/sim/engine";

export type Mode = "cp" | "ap";
export type Resolve = "lww" | "siblings";
export const MODES: { value: Mode; label: string }[] = [
  { value: "cp", label: "CP · majority quorum or refuse" },
  { value: "ap", label: "AP · every node answers locally" },
];
export const RESOLVES: { value: Resolve; label: string }[] = [
  { value: "lww", label: "Last write wins (timestamp)" },
  { value: "siblings", label: "Keep siblings, merge on next write" },
];

export interface CapConfig {
  nodes: number;
  mode: Mode;
  /** How an AP replica settles two concurrent versions of one key. */
  resolve: Resolve;
  /** One-way delay on every link, ms. */
  delay: number;
  /** Requests per second from each node's client. */
  rate: number;
  readPct: number;
}

export const MAX_NODES = 5;
/** Three shopping carts, as in Dynamo: a write adds one item, siblings merge by union. */
export const KEYS = ["ana", "bo", "cy"];
const LOCAL_MS = 1;
const ITEMS_KEEP = 64;
const LOST_KEEP = 12;

/** An immutable value of one key; replicas share references. vc is a version vector (one counter per node). */
export interface Version { id: number; node: number; ts: number; vc: number[]; items: number[] }
/** A message on a link. With `v` it carries a version (replication, anti-entropy); without, it is a quorum request/ack drawn on the canvas. */
export interface Msg { from: number; to: number; key: number; v?: Version; sent: number; at: number }
/** A CP request waiting for its majority. */
export interface Op { node: number; key: number; read: boolean; start: number; doneAt: number; quorum: number[]; others: { j: number; rtt: number }[] }
export interface Note { text: string; tone: "ok" | "hot" | "over"; at: number }
/** An acknowledged write that every later read must reflect (the linearizability check). */
export interface Acked { id: number; node: number; vc: number[]; at: number }

export interface CapState {
  /** Last tick's config: actions, faults and metrics don't receive it. */
  n: number; mode: Mode; delay: number; t: number;
  stores: Version[][][]; // [node][key] → siblings (one version unless concurrent writes met)
  cut: boolean[][];
  msgs: Msg[];
  ops: Op[];
  /** Per key, the maximal acknowledged versions: a read that misses one of these is stale. */
  frontier: Acked[][];
  notes: (Note | null)[];
  nextOp: number[];
  clock: number[];
  nextId: number;
  logq: { level: "info" | "warn" | "error"; text: string }[];
  reads: number; writes: number; acked: number; rejected: number;
  stale: number; stalePart: number; conflicts: number; lost: number; resolved: number;
  /** CP writes committed while some link was cut: the majority side kept working. */
  cutCommits: number;
  everCut: boolean;
  /** PACELC "else": write latency and stale reads measured while every link is up. */
  calm: Record<Mode, { n: number; sum: number }>;
  calmStale: number;
  pairs: Set<string>;
  lostIds: Set<number>;
  lostList: { id: number; key: number; winner: number }[];
}

const geq = (a: number[], b: number[]) => a.every((x, k) => x >= b[k]);
const linkMs = (c: CapConfig, rng: Rng) => c.delay * (0.8 + 0.4 * rng.next());
export const majority = (n: number) => Math.floor(n / 2) + 1;
export const key2 = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function peers(s: CapState, i: number) {
  const out: number[] = [];
  for (let j = 0; j < s.n; j++) if (j !== i && !s.cut[i][j]) out.push(j);
  return out;
}
export const hasQuorum = (s: CapState, i: number) => peers(s, i).length + 1 >= majority(s.n);
export function cutCount(s: CapState) {
  let k = 0;
  for (let i = 0; i < s.n; i++) for (let j = i + 1; j < s.n; j++) if (s.cut[i][j]) k++;
  return k;
}

/** Versions no other version in the list dominates (duplicates by id collapse). */
export function maximal(vs: Version[]) {
  const seen = new Map(vs.map((v) => [v.id, v]));
  const u = [...seen.values()];
  return u.filter((v) => !u.some((o) => o.id !== v.id && geq(o.vc, v.vc)));
}

/** Keys whose replicas currently hold different versions. */
export function divergent(s: CapState) {
  let k = 0;
  for (let key = 0; key < KEYS.length; key++) {
    const sig = (i: number) => s.stores[i][key].map((v) => v.id).sort().join();
    for (let i = 1; i < s.n; i++) if (sig(i) !== sig(0)) { k++; break; }
  }
  return k;
}

function newVersion(s: CapState, node: number, base: Version[], ts: number): Version {
  const vc = Array(MAX_NODES).fill(0) as number[];
  const set = new Set<number>();
  for (const b of base) { b.vc.forEach((x, k) => { vc[k] = Math.max(vc[k], x); }); for (const it of b.items) set.add(it); }
  vc[node] = s.clock[node] = Math.max(vc[node], s.clock[node]) + 1;
  const id = ++s.nextId;
  set.add(id);
  if (base.length > 1) s.resolved++; // the client read siblings and wrote their union back: the conflict is resolved
  return { id, node, ts, vc, items: [...set].sort((a, b) => a - b).slice(-ITEMS_KEEP) };
}

function ack(s: CapState, key: number, v: Version, at: number, ctx: TickContext<CapConfig>) {
  const f = s.frontier[key];
  if (!f.some((x) => geq(x.vc, v.vc))) s.frontier[key] = [...f.filter((x) => !geq(v.vc, x.vc)), { id: v.id, node: v.node, vc: v.vc, at }];
  s.acked++;
  ctx.metrics.inc("acked");
}

/** Replica j learns version v (replication, anti-entropy or a CP commit). */
function receive(s: CapState, j: number, key: number, v: Version, ctx: TickContext<CapConfig>) {
  const cur = s.stores[j][key];
  if (cur.some((x) => geq(x.vc, v.vc))) return; // already has it or something newer
  const keep = cur.filter((x) => !geq(v.vc, x.vc));
  if (!keep.length) { s.stores[j][key] = [v]; return; }
  // Neither vector dominates: the writes happened on different sides without seeing each other.
  for (const x of keep) {
    const p = key2(x.id, v.id);
    if (!s.pairs.has(p)) { s.pairs.add(p); s.conflicts++; ctx.metrics.inc("conflicts"); }
  }
  if (ctx.config.resolve === "siblings") { s.stores[j][key] = [...keep, v]; return; }
  // Last write wins: the higher timestamp survives, the other acknowledged write silently disappears (Cassandra-style LWW).
  const all = [...keep, v];
  const win = all.reduce((a, b) => (b.ts > a.ts || (b.ts === a.ts && b.node > a.node) ? b : a));
  for (const l of all) {
    if (l === win || s.lostIds.has(l.id)) continue;
    s.lostIds.add(l.id);
    s.lost++;
    ctx.metrics.inc("lost");
    s.frontier[key] = s.frontier[key].filter((f) => f.id !== l.id);
    s.lostList = [...s.lostList, { id: l.id, key, winner: win.id }].slice(-LOST_KEEP);
    ctx.log("error", `LWW on N${j + 1}: cart ${KEYS[key]} kept #${win.id}, dropped acknowledged write #${l.id}`);
  }
  s.stores[j][key] = [win];
}

/** A read returned `got`; it is stale if it misses a write acknowledged before the read began. */
function checkRead(s: CapState, i: number, key: number, start: number, got: Version[], ctx: TickContext<CapConfig>) {
  const miss = s.frontier[key].find((f) => f.at <= start && !got.some((g) => geq(g.vc, f.vc)));
  if (!miss) return false;
  s.stale++;
  ctx.metrics.inc("stale");
  if (s.cut[i][miss.node]) { s.stalePart++; ctx.metrics.inc("stalePart"); }
  else if (!cutCount(s)) s.calmStale++;
  return true;
}

function reject(s: CapState, i: number, t: number, why: string, ctx: TickContext<CapConfig>) {
  s.rejected++;
  ctx.metrics.inc("rejected");
  s.notes[i] = { text: `REJECTED · ${why}`, tone: "over", at: t };
}

function calmWrite(s: CapState, mode: Mode, ms: number) {
  if (cutCount(s)) return;
  s.calm[mode].n++;
  s.calm[mode].sum += ms;
}

function issue(s: CapState, ctx: TickContext<CapConfig>, i: number, t: number) {
  const c = ctx.config;
  const key = ctx.rng.int(0, KEYS.length - 1);
  const read = ctx.rng.chance(c.readPct / 100);
  if (read) s.reads++; else s.writes++;
  if (c.mode === "ap") {
    const local = s.stores[i][key];
    if (read) {
      const stale = checkRead(s, i, key, t, local, ctx);
      ctx.metrics.observe("readLat", LOCAL_MS);
      s.notes[i] = { text: `READ ${KEYS[key]} · ${local.length > 1 ? `${local.length} SIBLINGS` : stale ? "STALE" : "OK"} · ${LOCAL_MS} ms`, tone: stale ? "hot" : "ok", at: t };
      return;
    }
    const v = newVersion(s, i, local, t);
    s.stores[i][key] = [v];
    ack(s, key, v, t + LOCAL_MS, ctx);
    ctx.metrics.observe("writeLat", LOCAL_MS);
    calmWrite(s, "ap", LOCAL_MS);
    s.notes[i] = { text: `WRITE ${KEYS[key]} #${v.id} · OK · ${LOCAL_MS} ms`, tone: "ok", at: t };
    // Async replication to every reachable peer; a cut link drops it and anti-entropy repairs on heal.
    for (const j of peers(s, i)) s.msgs.push({ from: i, to: j, key, v, sent: t, at: t + linkMs(c, ctx.rng) });
    return;
  }
  const need = majority(s.n) - 1;
  const reach = peers(s, i);
  if (reach.length < need) return reject(s, i, t, `no majority (${reach.length + 1}/${s.n})`, ctx);
  const rtts = reach.map((j) => ({ j, rtt: linkMs(c, ctx.rng) + linkMs(c, ctx.rng) })).sort((a, b) => a.rtt - b.rtt);
  // Wait for the fastest majority (the coordinator counts as one vote).
  const doneAt = t + (need ? rtts[need - 1].rtt : LOCAL_MS);
  s.ops.push({ node: i, key, read, start: t, doneAt, quorum: rtts.slice(0, need).map((x) => x.j), others: rtts.slice(need) });
  for (const { j, rtt } of rtts) {
    s.msgs.push({ from: i, to: j, key, sent: t, at: t + rtt / 2 });
    s.msgs.push({ from: j, to: i, key, sent: t + rtt / 2, at: t + rtt });
  }
}

/** A CP request has its majority. Values are taken at commit so concurrent CP writes are totally ordered (the majority quorums intersect). */
function complete(s: CapState, op: Op, ctx: TickContext<CapConfig>) {
  const { node: i, key } = op;
  if (op.quorum.some((j) => s.cut[i][j] || j >= s.n)) return reject(s, i, op.doneAt, "timed out waiting for a majority", ctx);
  const group = [i, ...op.quorum];
  const base = maximal(group.flatMap((g) => s.stores[g][key]));
  const ms = op.doneAt - op.start;
  if (op.read) {
    const stale = checkRead(s, i, key, op.start, base, ctx);
    ctx.metrics.observe("readLat", ms);
    s.notes[i] = { text: `READ ${KEYS[key]} · ${stale ? "STALE" : "OK"} · ${Math.round(ms)} ms`, tone: stale ? "hot" : "ok", at: op.doneAt };
    return;
  }
  const v = newVersion(s, i, base, op.doneAt);
  for (const g of group) receive(s, g, key, v, ctx);
  for (const { j, rtt } of op.others) if (!s.cut[i][j]) s.msgs.push({ from: i, to: j, key, v, sent: op.doneAt, at: Math.max(op.doneAt, op.start + rtt) });
  ack(s, key, v, op.doneAt, ctx);
  ctx.metrics.observe("writeLat", ms);
  calmWrite(s, "cp", ms);
  if (cutCount(s)) s.cutCommits++;
  s.notes[i] = { text: `WRITE ${KEYS[key]} #${v.id} · OK · ${Math.round(ms)} ms`, tone: "ok", at: op.doneAt };
}

/** Restore a link: both sides exchange everything they hold (anti-entropy), which is when conflicts surface. */
function heal(s: CapState, a: number, b: number) {
  if (!s.cut[a][b]) return;
  s.cut[a][b] = s.cut[b][a] = false;
  for (let key = 0; key < KEYS.length; key++) {
    for (const v of s.stores[a][key]) s.msgs.push({ from: a, to: b, key, v, sent: s.t, at: s.t + s.delay });
    for (const v of s.stores[b][key]) s.msgs.push({ from: b, to: a, key, v, sent: s.t, at: s.t + s.delay });
  }
}

function cutLink(s: CapState, a: number, b: number) {
  if (s.cut[a][b]) return;
  s.cut[a][b] = s.cut[b][a] = true;
  s.everCut = true;
  // Everything in flight on this link is lost.
  s.msgs = s.msgs.filter((m) => !((m.from === a && m.to === b) || (m.from === b && m.to === a)));
}

/** The first ⌈n/2⌉ nodes on one side, the rest (a minority) on the other. */
function split(s: CapState) {
  const k = majority(s.n);
  for (let a = 0; a < k; a++) for (let b = k; b < s.n; b++) cutLink(s, a, b);
  s.logq.push({ level: "warn", text: `Partition: {${Array.from({ length: k }, (_, i) => `N${i + 1}`).join(", ")}} | {${Array.from({ length: s.n - k }, (_, i) => `N${k + i + 1}`).join(", ")}}` });
  return s;
}
function healAll(s: CapState) {
  for (let a = 0; a < MAX_NODES; a++) for (let b = a + 1; b < MAX_NODES; b++) heal(s, a, b);
  s.logq.push({ level: "info", text: "Every link restored; replicas exchange their versions" });
  return s;
}

export const capModel: SimModel<CapConfig, CapState> = {
  init(c, rng) {
    return {
      n: c.nodes, mode: c.mode, delay: c.delay, t: 0,
      stores: Array.from({ length: MAX_NODES }, () => KEYS.map(() => [])),
      cut: Array.from({ length: MAX_NODES }, () => Array(MAX_NODES).fill(false) as boolean[]),
      msgs: [], ops: [], frontier: KEYS.map(() => []), notes: Array(MAX_NODES).fill(null) as null[],
      nextOp: Array.from({ length: MAX_NODES }, () => rng.exponential(c.rate) * 1000),
      clock: Array(MAX_NODES).fill(0) as number[], nextId: 0, logq: [],
      reads: 0, writes: 0, acked: 0, rejected: 0, stale: 0, stalePart: 0, conflicts: 0, lost: 0, resolved: 0,
      cutCommits: 0, everCut: false, calm: { cp: { n: 0, sum: 0 }, ap: { n: 0, sum: 0 } }, calmStale: 0,
      pairs: new Set(), lostIds: new Set(), lostList: [],
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t; s.n = c.nodes; s.mode = c.mode; s.delay = c.delay;
    for (const l of s.logq) ctx.log(l.level, l.text);
    s.logq.length = 0;

    if (s.msgs.some((m) => m.at <= ctx.t)) {
      const due = s.msgs.filter((m) => m.at <= ctx.t).sort((a, b) => a.at - b.at);
      s.msgs = s.msgs.filter((m) => m.at > ctx.t);
      for (const m of due) if (m.v) receive(s, m.to, m.key, m.v, ctx);
    }
    if (s.ops.some((o) => o.doneAt <= ctx.t)) {
      const due = s.ops.filter((o) => o.doneAt <= ctx.t).sort((a, b) => a.doneAt - b.doneAt);
      s.ops = s.ops.filter((o) => o.doneAt > ctx.t);
      for (const o of due) complete(s, o, ctx);
    }
    for (let i = 0; i < MAX_NODES; i++) {
      while (s.nextOp[i] <= ctx.t) {
        const at = s.nextOp[i];
        s.nextOp[i] += ctx.rng.exponential(c.rate) * 1000;
        if (i < c.nodes) issue(s, ctx, i, at);
      }
    }
    return s;
  },

  actions: {
    toggleLink(s, payload) {
      const { a, b } = payload as { a: number; b: number };
      if (a === b || a < 0 || b < 0 || a >= MAX_NODES || b >= MAX_NODES) return s;
      const n = structuredClone(s);
      if (n.cut[a][b]) { heal(n, a, b); n.logq.push({ level: "info", text: `Link N${a + 1}–N${b + 1} restored` }); }
      else { cutLink(n, a, b); n.logq.push({ level: "warn", text: `Link N${a + 1}–N${b + 1} cut` }); }
      return n;
    },
    /** Cut every link of one node, or restore them all if it is already isolated. */
    isolate(s, payload) {
      const { node } = payload as { node: number };
      const n = structuredClone(s);
      const others = Array.from({ length: n.n }, (_, j) => j).filter((j) => j !== node);
      const isolated = others.every((j) => n.cut[node][j]);
      for (const j of others) if (isolated) heal(n, node, j); else cutLink(n, node, j);
      n.logq.push({ level: isolated ? "info" : "warn", text: isolated ? `N${node + 1} rejoined` : `N${node + 1} isolated` });
      return n;
    },
    split: (s) => split(structuredClone(s)),
    healAll: (s) => healAll(structuredClone(s)),
  },

  faults: [
    { id: "split", label: "Partition: majority | minority", description: "Cuts every link between the first ⌈n/2⌉ nodes and the rest. CP: the minority refuses. AP: both sides keep writing and diverge. Clear it to heal and run anti-entropy.", apply: split, revert: healAll },
  ],

  metrics(s, reg, t) {
    const w = reg.histogram("writeLat")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const r = reg.histogram("readLat")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    let sib = 1;
    for (let i = 0; i < s.n; i++) for (const v of s.stores[i]) sib = Math.max(sib, v.length);
    return {
      wP50: w.p50, wP99: w.p99, rP99: r.p99,
      okQps: reg.rate("acked", t), rejectedQps: reg.rate("rejected", t), staleQps: reg.rate("stale", t),
      rejected: s.rejected, stale: s.stale, stalePart: s.stalePart, conflicts: s.conflicts, lost: s.lost,
      siblings: sib, divergent: divergent(s), cuts: cutCount(s),
    };
  },
};
