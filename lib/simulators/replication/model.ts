import type { Rng, SimModel, TickContext } from "@/lib/sim/engine";

export type Mode = "async" | "semisync" | "sync";
export const MODES: { value: Mode; label: string }[] = [
  { value: "async", label: "Async (ack on leader write)" },
  { value: "semisync", label: "Semi-sync (ack after 1 follower)" },
  { value: "sync", label: "Sync (ack after every follower)" },
];

export interface ReplConfig {
  followers: number;
  mode: Mode;
  /** One-way leader ↔ follower delay, ms. */
  delay: number;
  /** Delay multiplier on the last follower's link (a cross-region replica). */
  slowFollower: number;
  writeRate: number;
  readRate: number;
  readFrom: "leader" | "follower";
  /** Read-your-writes: a user's reads go to the leader for rywMs after their write is acked. */
  ryw: boolean;
  rywMs: number;
  /** Monotonic reads: each user sticks to one follower. */
  monotonic: boolean;
  failoverMs: number;
  /** Challenge hook: crash the leader at this sim time (0 = never). */
  crashAt: number;
}

export const MAX_NODES = 5;
export const USERS = 100;
const LOCAL_MS = 2;
const LOG_KEEP = 600;
const LOST_KEEP = 40;

/** A replication message ("you may apply up to seq") or its ack, on one link. */
export interface Msg { seq: number; sent: number; at: number }

export interface Node {
  applied: number;
  down: boolean;
  /** Lag spike multiplier on this node's link. */
  spike: number;
  /** Leader → node messages and node → leader acks in flight, FIFO per link. */
  inbox: Msg[];
  acks: Msg[];
  /** Highest seq the leader has heard this node ack. */
  acked: number;
  /** After losing leadership: entries above this diverged and are discarded on recovery. */
  truncTo: number;
}

export interface Entry { seq: number; user: number; at: number; acked: boolean }
export interface User { lastAcked: number; lastAckAt: number; lastSeen: number }

export interface ReplState {
  nodes: Node[];
  leader: number;
  /** The current leader's log tail (older entries are trimmed once every follower has them). */
  log: Entry[];
  pending: { seq: number; user: number; at: number }[];
  users: User[];
  partitioned: boolean;
  healAt: number;
  /** -1: crash seen, timer starts next tick (faults don't know the config); Infinity: no failover pending. */
  failoverAt: number;
  autoCrashed: boolean;
  lost: { seq: number; user: number }[];
  nextWrite: number;
  nextRead: number;
  t: number;
  writes: number; acked: number; failedWrites: number; lostCount: number;
  reads: number; followerReads: number; staleReads: number; ownStale: number; backwards: number;
  /** Challenge guards: ms spent outside async, and the smallest slow-follower factor used. */
  nonAsyncMs: number;
  slowMin: number;
  /** config.followers on the last tick, for metrics (which don't get the config). */
  fol: number;
}

/** The first `followers` nodes that aren't the leader; a crashed old leader stays in the set as DOWN. */
export function followerIds(s: ReplState, c: Pick<ReplConfig, "followers">) {
  const out: number[] = [];
  for (let i = 0; i < MAX_NODES && out.length < c.followers; i++) if (i !== s.leader) out.push(i);
  return out;
}

export const headOf = (s: ReplState) => s.nodes[s.leader].applied;

/** How long node i has been missing the oldest entry it lacks, ms. */
export function lagMs(s: ReplState, i: number) {
  const n = s.nodes[i];
  if (i === s.leader || n.down || n.applied >= headOf(s) || !s.log.length) return 0;
  const e = s.log[n.applied + 1 - s.log[0].seq] ?? s.log[0];
  return Math.max(0, s.t - e.at);
}

const linkDelay = (c: ReplConfig, rng: Rng, s: ReplState, i: number) =>
  c.delay * s.nodes[i].spike * (i === c.followers ? c.slowFollower : 1) * (0.9 + 0.3 * rng.next());

function send(q: Msg[], seq: number, sent: number, d: number) {
  // Links are FIFO (TCP): a message never overtakes the one before it.
  q.push({ seq, sent, at: Math.max(sent + d, q.at(-1)?.at ?? 0) });
}

function ack(s: ReplState, p: { seq: number; user: number; at: number }, when: number, ctx: TickContext<ReplConfig>) {
  const e = s.log[p.seq - (s.log[0]?.seq ?? p.seq)];
  if (e && e.seq === p.seq) e.acked = true;
  const u = s.users[p.user];
  u.lastAcked = Math.max(u.lastAcked, p.seq);
  u.lastAckAt = when;
  s.acked++;
  ctx.metrics.inc("acked");
  ctx.metrics.observe("writeLatency", when - p.at);
}

/** Acks every pending write that now has enough follower acks, in log order. */
function settle(s: ReplState, ctx: TickContext<ReplConfig>, when: number) {
  const live = followerIds(s, ctx.config).filter((i) => !s.nodes[i].down);
  const need = ctx.config.mode === "sync" ? live.length : Math.min(1, live.length);
  while (s.pending.length) {
    const p = s.pending[0];
    if (live.filter((i) => s.nodes[i].acked >= p.seq).length < need) break;
    s.pending.shift();
    ack(s, p, when, ctx);
  }
}

export function crash(s: ReplState) {
  if (s.nodes[s.leader].down) return s;
  s.nodes[s.leader].down = true;
  // The leader ships its log after commit; whatever it hadn't shipped yet dies with it.
  for (const n of s.nodes) n.inbox = [];
  // Clients waiting on an ack get an error: these writes failed, they weren't lost.
  s.failedWrites += s.pending.length;
  s.pending = [];
  s.failoverAt = -1;
  return s;
}

function failover(s: ReplState, ctx: TickContext<ReplConfig>) {
  const cands = followerIds(s, ctx.config).filter((i) => !s.nodes[i].down);
  if (!cands.length) return;
  const next = cands.reduce((b, i) => (s.nodes[i].applied > s.nodes[b].applied ? i : b));
  const head = s.nodes[next].applied;
  const old = s.leader;
  const gone = s.log.filter((e) => e.seq > head && e.acked);
  s.lostCount += gone.length;
  s.lost = [...s.lost, ...gone.map((e) => ({ seq: e.seq, user: e.user }))].slice(-LOST_KEEP);
  ctx.metrics.inc("lost", gone.length);
  s.log = s.log.filter((e) => e.seq <= head);
  s.nodes[old].truncTo = head;
  s.leader = next;
  for (const n of s.nodes) { n.inbox = []; n.acks = []; n.acked = Math.min(n.applied, head); }
  // Seq numbers restart above the new head, so clamp what users remember to the new timeline.
  for (const u of s.users) { u.lastAcked = Math.min(u.lastAcked, head); u.lastSeen = Math.min(u.lastSeen, head); }
  s.failoverAt = Infinity;
  ctx.log("warn", `Failover: N${next + 1} promoted at #${head}`);
  if (gone.length) ctx.log("error", `${gone.length} acknowledged write${gone.length > 1 ? "s" : ""} lost (never reached N${next + 1})`);
}

function write(s: ReplState, ctx: TickContext<ReplConfig>, t: number) {
  const user = ctx.rng.int(0, USERS - 1);
  s.writes++;
  ctx.metrics.inc("writes");
  const L = s.nodes[s.leader];
  if (L.down) { s.failedWrites++; ctx.metrics.inc("failed"); return; }
  const seq = ++L.applied;
  s.log.push({ seq, user, at: t, acked: false });
  for (const i of followerIds(s, ctx.config)) if (!s.nodes[i].down) send(s.nodes[i].inbox, seq, t, linkDelay(ctx.config, ctx.rng, s, i));
  const p = { seq, user, at: t };
  if (ctx.config.mode === "async") ack(s, p, t + LOCAL_MS * (0.5 + ctx.rng.next()), ctx);
  else s.pending.push(p);
}

function read(s: ReplState, ctx: TickContext<ReplConfig>, t: number) {
  const c = ctx.config;
  const id = ctx.rng.int(0, USERS - 1);
  const u = s.users[id];
  const live = followerIds(s, c).filter((i) => !s.nodes[i].down);
  const toLeader = c.readFrom === "leader" || (c.ryw && t - u.lastAckAt < c.rywMs);
  let i = toLeader && !s.nodes[s.leader].down ? s.leader : -1;
  if (i < 0 && live.length) i = c.monotonic ? live[id % live.length] : ctx.rng.pick(live);
  s.reads++;
  ctx.metrics.inc("reads");
  if (i < 0) return;
  const applied = s.nodes[i].applied;
  if (i !== s.leader) s.followerReads++;
  if (applied < headOf(s)) { s.staleReads++; ctx.metrics.inc("stale"); }
  if (applied < u.lastAcked) { s.ownStale++; ctx.metrics.inc("ownStale"); }
  if (applied < u.lastSeen) { s.backwards++; ctx.metrics.inc("backwards"); }
  u.lastSeen = Math.max(u.lastSeen, applied);
}

export const replModel: SimModel<ReplConfig, ReplState> = {
  init(c, rng) {
    return {
      nodes: Array.from({ length: MAX_NODES }, (): Node => ({ applied: 0, down: false, spike: 1, inbox: [], acks: [], acked: 0, truncTo: 0 })),
      leader: 0, log: [], pending: [],
      users: Array.from({ length: USERS }, () => ({ lastAcked: 0, lastAckAt: -Infinity, lastSeen: 0 })),
      partitioned: false, healAt: 0, failoverAt: Infinity, autoCrashed: false, lost: [],
      nextWrite: rng.exponential(c.writeRate) * 1000, nextRead: rng.exponential(c.readRate) * 1000, t: 0,
      writes: 0, acked: 0, failedWrites: 0, lostCount: 0, reads: 0, followerReads: 0, staleReads: 0, ownStale: 0, backwards: 0,
      nonAsyncMs: 0, slowMin: c.slowFollower, fol: c.followers,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    s.fol = c.followers;
    if (c.mode !== "async") s.nonAsyncMs += ctx.dt;
    s.slowMin = Math.min(s.slowMin, c.slowFollower);
    if (c.crashAt && !s.autoCrashed && ctx.t >= c.crashAt) { s.autoCrashed = true; crash(s); }
    if (s.failoverAt === -1) { s.failoverAt = ctx.t + c.failoverMs; ctx.log("error", `Leader N${s.leader + 1} crashed; failover in ${c.failoverMs} ms`); }
    if (ctx.t >= s.failoverAt) failover(s, ctx);

    // Deliveries: a partition holds both directions; held messages land when it heals.
    if (!s.partitioned) {
      const due: { i: number; m: Msg }[] = [];
      for (const i of followerIds(s, c)) {
        const n = s.nodes[i];
        if (n.down) continue;
        while (n.inbox.length && n.inbox[0].at <= ctx.t) {
          const m = n.inbox.shift()!;
          const when = Math.max(m.at, s.healAt);
          n.applied = Math.max(n.applied, m.seq);
          send(n.acks, m.seq, when, linkDelay(c, ctx.rng, s, i));
        }
        while (n.acks.length && n.acks[0].at <= ctx.t) due.push({ i, m: n.acks.shift()! });
      }
      due.sort((a, b) => a.m.at - b.m.at);
      for (const { i, m } of due) { s.nodes[i].acked = Math.max(s.nodes[i].acked, m.seq); settle(s, ctx, Math.max(m.at, s.healAt)); }
    }
    settle(s, ctx, ctx.t); // a mode switch or a follower dropping out can release waiting writes

    while (s.nextWrite <= ctx.t) { const t = s.nextWrite; s.nextWrite += ctx.rng.exponential(c.writeRate) * 1000; write(s, ctx, t); }
    while (s.nextRead <= ctx.t) { const t = s.nextRead; s.nextRead += ctx.rng.exponential(c.readRate) * 1000; read(s, ctx, t); }

    // Trim entries every live node already has; keep the tail for lag and lost-write lookups.
    const min = Math.min(...[s.leader, ...followerIds(s, c)].filter((i) => !s.nodes[i].down).map((i) => s.nodes[i].applied));
    while (s.log.length > LOG_KEEP && s.log[0].seq <= min) s.log.shift();
    return s;
  },

  actions: {},

  faults: [
    { id: "crash", label: "Crash the leader", description: "The leader process dies. After the failover timeout the most up-to-date follower is promoted; acknowledged writes it never received are lost. Clear it to bring the old leader back as a follower.", apply: crash,
      revert(s) {
        const n = s.nodes.find((x, i) => x.down && i !== s.leader);
        if (n) { n.down = false; n.applied = Math.min(n.applied, n.truncTo); n.inbox = []; n.acks = []; }
        else if (s.nodes[s.leader].down) { s.nodes[s.leader].down = false; s.failoverAt = Infinity; }
        return s;
      } },
    { id: "partition", label: "Partition leader from followers", description: "The network between the leader and every follower stops delivering. Async writes keep succeeding while followers fall behind; sync writes stall.", apply: (s) => { s.partitioned = true; return s; }, revert: (s) => { s.partitioned = false; s.healAt = s.t; return s; } },
    { id: "lag", label: "Lag spike on one follower (×10)", description: "A long-running query or a GC pause: one follower applies the stream 10× slower.", apply: (s) => { const i = s.leader === 0 ? 1 : 0; s.nodes[i].spike = 10; return s; }, revert: (s) => { for (const n of s.nodes) n.spike = 1; return s; } },
  ],

  metrics(s, reg, t) {
    const p = reg.histogram("writeLatency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const reads = reg.rate("reads", t);
    const share = (k: string) => (reads ? Math.min(1, reg.rate(k, t) / reads) : 0);
    const m: Record<string, number> = {
      p50: p.p50, p99: p.p99, writeQps: reg.rate("acked", t), readQps: reads,
      staleRate: share("stale"), ownStaleRate: share("ownStale"),
      stalePct: share("stale") * 100, ownStalePct: share("ownStale") * 100,
      ownStale: s.ownStale, backwards: s.backwards, lost: s.lostCount, stalled: s.pending.length, failed: s.failedWrites,
    };
    let max = 0;
    for (let i = 0; i < MAX_NODES; i++) m[`lag${i}`] = 0;
    for (const i of followerIds(s, { followers: s.fol })) { m[`lag${i}`] = lagMs(s, i); max = Math.max(max, m[`lag${i}`]); }
    m.maxLag = max;
    return m;
  },
};
