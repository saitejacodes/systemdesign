import { EventQueue, type Rng, type SimModel, type TickContext } from "@/lib/sim/engine";

/*
 * Leaderless (Dynamo-style) replication of a few keys on N replicas. The client sends each request
 * to a random live replica, which coordinates it: a write goes to all N replicas and is acknowledged
 * after W replies; a read goes to all N and returns the highest version among the first R replies.
 * No read repair, hinted handoff or anti-entropy, so a replica that missed a write stays behind.
 */

export type Preset = "custom" | "3-2-2" | "3-1-3" | "3-3-1" | "5-3-3";
export const PRESETS: { value: Preset; label: string }[] = [
  { value: "custom", label: "Custom (use the sliders)" },
  { value: "3-2-2", label: "N=3 R=2 W=2 · balanced" },
  { value: "3-1-3", label: "N=3 R=1 W=3 · fast reads" },
  { value: "3-3-1", label: "N=3 R=3 W=1 · fast writes" },
  { value: "5-3-3", label: "N=5 R=3 W=3 · two failures" },
];

export interface QuorumConfig {
  preset: Preset;
  n: number; r: number; w: number;
  /** Client requests per second, all keys. */
  opsRate: number;
  readPct: number;
  /** Multiplies every link delay. */
  latency: number;
  /** Challenge hook: crash N1 at this sim time (0 = never). */
  crashAt: number;
}

export const MAX_NODES = 7;
export const KEYS = 8;
/** One-way delay from each replica to the network core, ms; a link i→j takes DIST[i] + DIST[j]. N3 sits in a busy rack. */
export const DIST = [1, 2, 10, 3, 6, 1.5, 8];
const LOCAL_MS = 0.1;
export const TIMEOUT_MS = 500;
const OPEN_MS = TIMEOUT_MS + 50;

export interface Node { down: boolean; slow: number; data: number[] }
export interface Reply { node: number; at: number; ver: number }
export interface Op {
  id: number; kind: "read" | "write"; key: number; coord: number; start: number; need: number;
  /** Write: the version written. Read: the version returned. */
  ver: number;
  /** Read: highest version acknowledged for the key when the read started; stale if ver is below it. */
  floor: number;
  replies: Reply[]; doneAt: number; status: "pending" | "ok" | "stale" | "timeout" | "unavailable";
}
type Ev = { k: "arrive"; op: Op; node: number } | { k: "reply"; op: Op; node: number; ver: number } | { k: "close"; op: Op };

export interface QuorumState {
  nodes: Node[];
  events: EventQueue<Ev>;
  /** Highest acknowledged version per key: the value any later read must not go below. */
  acked: number[];
  nextOp: number; nextVer: number; nextId: number;
  lastRead: Op | null; lastWrite: Op | null;
  /** Effective N/R/W on the last tick, for metrics and the view. */
  eff: { n: number; r: number; w: number };
  /** Counters since the settings last changed. */
  reads: number; stale: number; readFails: number; writes: number; writeFails: number;
  /** Counters for the whole run (challenges). */
  totalStale: number; totalReadFails: number; totalWriteFails: number; totalReads: number;
  crashed: boolean;
  /** Sim ms spent with R + W ≤ N: a run with no stale reads by luck doesn't prove anything. */
  weakMs: number;
  t: number;
}

export function effective(c: Pick<QuorumConfig, "preset" | "n" | "r" | "w">) {
  if (c.preset !== "custom") { const [n, r, w] = c.preset.split("-").map(Number); return { n, r, w }; }
  const n = Math.max(1, Math.min(MAX_NODES, c.n));
  return { n, r: Math.max(1, Math.min(n, c.r)), w: Math.max(1, Math.min(n, c.w)) };
}

export const ord = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? "st" : k % 10 === 2 && k !== 12 ? "nd" : k % 10 === 3 && k !== 13 ? "rd" : "th"}`;

export const liveCount = (s: QuorumState) => s.nodes.slice(0, s.eff.n).filter((x) => !x.down).length;

/** One-way delay between two replicas: the core distances plus a heavy-ish tail (mean ×1). */
function delay(s: QuorumState, c: QuorumConfig, rng: Rng, a: number, b: number) {
  if (a === b) return LOCAL_MS;
  return (DIST[a] * s.nodes[a].slow + DIST[b] * s.nodes[b].slow) * c.latency * (0.6 + rng.exponential(2.5));
}

function finish(s: QuorumState, op: Op, status: Op["status"], at: number, ctx: TickContext<QuorumConfig>) {
  op.status = status;
  op.doneAt = at;
  const ok = status === "ok" || status === "stale";
  if (op.kind === "write") {
    s.writes++;
    if (ok) { s.acked[op.key] = Math.max(s.acked[op.key], op.ver); ctx.metrics.inc("writesOk"); ctx.metrics.observe("writeLatency", at - op.start); }
    else { s.writeFails++; s.totalWriteFails++; ctx.metrics.inc("writeFail"); }
    ctx.metrics.inc("writeTry");
    s.lastWrite = op;
  } else {
    s.reads++; s.totalReads++;
    if (ok) { ctx.metrics.inc("readsOk"); ctx.metrics.observe("readLatency", at - op.start); }
    else { s.readFails++; s.totalReadFails++; ctx.metrics.inc("readFail"); }
    if (status === "stale") { s.stale++; s.totalStale++; ctx.metrics.inc("stale"); }
    ctx.metrics.inc("readTry");
    s.lastRead = op;
  }
}

function issue(s: QuorumState, t: number, ctx: TickContext<QuorumConfig>) {
  const { rng, config: c } = ctx;
  const { n, r, w } = s.eff;
  const kind = rng.chance(c.readPct / 100) ? "read" : "write";
  const key = rng.int(0, KEYS - 1);
  const live = s.nodes.slice(0, n).map((x, i) => (x.down ? -1 : i)).filter((i) => i >= 0);
  const need = kind === "read" ? r : w;
  const op: Op = { id: s.nextId++, kind, key, coord: live.length ? rng.pick(live) : -1, start: t, need, ver: kind === "write" ? ++s.nextVer : 0, floor: s.acked[key], replies: [], doneAt: 0, status: "pending" };
  // The coordinator's failure detector already knows too few replicas are up: fail fast (Cassandra's UnavailableException).
  if (live.length < need) { finish(s, op, "unavailable", t, ctx); return; }
  for (let i = 0; i < n; i++) s.events.push(t + delay(s, c, rng, op.coord, i), { k: "arrive", op, node: i });
  s.events.push(t + TIMEOUT_MS, { k: "close", op });
}

function handle(s: QuorumState, at: number, e: Ev, ctx: TickContext<QuorumConfig>) {
  const op = e.op;
  if (e.k === "arrive") {
    const nd = s.nodes[e.node];
    if (nd.down) return; // lost: a crashed replica neither applies nor answers
    if (op.kind === "write") nd.data[op.key] = Math.max(nd.data[op.key], op.ver); // highest version wins (last-write-wins)
    s.events.push(at + delay(s, ctx.config, ctx.rng, e.node, op.coord), { k: "reply", op, node: e.node, ver: nd.data[op.key] });
  } else if (e.k === "reply") {
    // Late replies are still recorded so the view can show what the quorum didn't wait for.
    if (at > op.start + OPEN_MS) return;
    op.replies.push({ node: e.node, at: at - op.start, ver: e.ver });
    if (op.status !== "pending" || op.replies.length < op.need) return;
    if (op.kind === "read") {
      op.ver = Math.max(...op.replies.map((x) => x.ver));
      finish(s, op, op.ver < op.floor ? "stale" : "ok", at, ctx);
    } else finish(s, op, "ok", at, ctx);
  } else if (op.status === "pending") finish(s, op, "timeout", at, ctx);
}

const zeroCounts = (s: QuorumState) => { s.reads = s.stale = s.readFails = s.writes = s.writeFails = 0; };

export const quorumModel: SimModel<QuorumConfig, QuorumState> = {
  init(c, rng) {
    return {
      nodes: Array.from({ length: MAX_NODES }, (): Node => ({ down: false, slow: 1, data: Array(KEYS).fill(0) })),
      events: new EventQueue<Ev>(), acked: Array(KEYS).fill(0),
      nextOp: rng.exponential(c.opsRate) * 1000, nextVer: 0, nextId: 0, lastRead: null, lastWrite: null,
      eff: effective(c), reads: 0, stale: 0, readFails: 0, writes: 0, writeFails: 0,
      totalStale: 0, totalReadFails: 0, totalWriteFails: 0, totalReads: 0, crashed: false, weakMs: 0, t: 0,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    const e = effective(c);
    if (e.n !== s.eff.n || e.r !== s.eff.r || e.w !== s.eff.w) {
      // A joining replica streams the existing data before serving (bootstrap), as Cassandra does.
      for (let i = s.eff.n; i < e.n; i++) s.nodes[i].data = s.acked.map((v, k) => Math.max(v, ...s.nodes.slice(0, s.eff.n).map((x) => x.data[k])));
      ctx.log("info", `Now N=${e.n} R=${e.r} W=${e.w}: R + W ${e.r + e.w > e.n ? ">" : "≤"} N`);
      s.eff = e;
      zeroCounts(s);
    }
    if (e.r + e.w <= e.n) s.weakMs += ctx.dt;
    if (c.crashAt && !s.crashed && ctx.t >= c.crashAt) { s.crashed = true; s.nodes[0].down = true; ctx.log("error", "N1 crashed"); }

    for (;;) {
      const qt = s.events.peekTime() ?? Infinity;
      if (Math.min(qt, s.nextOp) > ctx.t) break;
      // Replies due at the same instant land before a new request starts, so its stale floor is exact.
      if (qt <= s.nextOp) { const x = s.events.pop()!; handle(s, x.t, x.e, ctx); }
      else { const t = s.nextOp; s.nextOp += ctx.rng.exponential(c.opsRate) * 1000; issue(s, t, ctx); }
    }
    return s;
  },

  actions: {
    /** payload: node index. Crash or restart one replica; it keeps its data while down and misses every write. */
    toggle(s, p) {
      const i = Number(p);
      if (!(i >= 0 && i < MAX_NODES)) return s;
      return { ...s, nodes: s.nodes.map((x, j) => (j === i ? { ...x, down: !x.down } : x)) };
    },
  },

  faults: [
    { id: "slow", label: "Slow replica (N2 ×20)", description: "N2's links get 20× slower: a GC pause or a saturated disk. Quorums that must wait for it slow down; quorums that can skip it don't.", apply: (s) => { s.nodes[1].slow = 20; return { ...s }; }, revert: (s) => { s.nodes[1].slow = 1; return { ...s }; } },
    { id: "two-down", label: "Crash N1 and N2 together", description: "A rack loses power: two replicas fail at once. Count how many failures your R and W tolerate (N − R and N − W).", apply: (s) => ({ ...s, nodes: s.nodes.map((x, i) => (i < 2 ? { ...x, down: true } : x)) }), revert: (s) => ({ ...s, nodes: s.nodes.map((x, i) => (i < 2 ? { ...x, down: false } : x)) }) },
  ],

  metrics(s, reg, t) {
    const rp = reg.histogram("readLatency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const wp = reg.histogram("writeLatency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const share = (a: string, b: string) => { const d = reg.rate(b, t); return d ? Math.min(1, reg.rate(a, t) / d) : 0; };
    const live = liveCount(s);
    return {
      readP50: rp.p50, readP99: rp.p99, writeP50: wp.p50, writeP99: wp.p99,
      stalePct: share("stale", "readsOk") * 100,
      staleProb: s.reads - s.readFails ? (s.stale / (s.reads - s.readFails)) * 100 : 0,
      readAvail: reg.rate("readTry", t) ? (1 - share("readFail", "readTry")) * 100 : 100,
      writeAvail: reg.rate("writeTry", t) ? (1 - share("writeFail", "writeTry")) * 100 : 100,
      overlap: s.eff.r + s.eff.w > s.eff.n ? 1 : 0, live, readUp: live >= s.eff.r ? 1 : 0, writeUp: live >= s.eff.w ? 1 : 0,
      stale: s.stale, failed: s.readFails + s.writeFails,
    };
  },
};
