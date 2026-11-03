import type { SimModel, TickContext } from "@/lib/sim/engine";

// Raft as in Ongaro & Ousterhout 2014, Figure 2 ("In Search of an Understandable Consensus Algorithm").
export interface RaftConfig {
  /** Election timeouts are drawn uniformly from [timeoutMin, timeoutMax] ms (§5.2). */
  timeoutMin: number;
  timeoutMax: number;
  /** Leader sends AppendEntries (a heartbeat when empty) this often, ms. */
  heartbeat: number;
  /** One-way network delay, ms (±20% jitter). */
  delay: number;
  /** Client writes per second, sent to a node that believes it is leader. */
  writeRate: number;
}

export type Role = "follower" | "candidate" | "leader";
/** id 0 is the no-op a new leader appends (§8); other ids number client writes. */
export interface Entry { term: number; id: number }

export interface RNode {
  role: Role;
  /** Persistent state: survives a crash (§5, Figure 2). */
  term: number;
  votedFor: number | null;
  log: Entry[];
  /** Volatile: reset to 0 on restart. */
  commit: number;
  down: boolean;
  slow: boolean;
  group: 0 | 1;
  /** Election deadline; -1 means draw a fresh one on the next tick (actions have no rng). */
  deadline: number;
  timeoutLen: number;
  votes: number[];
  next: number[];
  match: number[];
  hbDue: number;
}

interface MsgBase { id: number; from: number; to: number; term: number; sent: number; at: number }
export type Msg = MsgBase & (
  | { kind: "RV"; lastIndex: number; lastTerm: number }
  | { kind: "RVR"; granted: boolean }
  | { kind: "AE"; prevIndex: number; prevTerm: number; entries: Entry[]; commit: number }
  | { kind: "AER"; success: boolean; match: number }
);

export interface Pending { node: number; index: number; id: number; at: number }

export interface RaftState {
  nodes: RNode[];
  msgs: Msg[];
  msgSeq: number;
  t: number;
  writeSeq: number;
  nextWrite: number;
  pending: Pending[];
  loss: number;
  notes: string[];
  /** term → the node that won it; a second winner would be split brain. */
  leaders: Record<number, number>;
  /** chosen[i]: term of the entry first committed at index i, by any node (State Machine Safety check). */
  chosen: number[];
  violations: number;
  splitBrain: number;
  elections: number;
  /** Elections started while a live leader of at least that term was reachable. */
  spurious: number;
  truncated: number;
  acked: number;
  failed: number;
  rejected: number;
  // Challenge trackers.
  crashAt: number | null;
  crashTerm: number;
  failovers: number[];
  partitionAt: number | null;
  minorityWrites: number;
  minorityIds: number[];
  minorityCommitted: number;
  partitionCommits: number;
  healAt: number | null;
  truncAtHeal: number;
  reconciles: { ms: number; repaired: number }[];
}

export const N = 5;
export const MAJORITY = 3;
export const MAX_LOG = 200;
const BATCH = 10;
const MAX_MSGS = 400;
const SLOW = 6;
const KEEP = 10;

export const partitioned = (s: RaftState) => s.nodes.some((n) => n.group !== s.nodes[0].group);
export const sideSize = (s: RaftState, i: number) => s.nodes.filter((n) => n.group === s.nodes[i].group).length;
const lastTerm = (n: RNode) => n.log.at(-1)?.term ?? 0;
/** The live leader with the highest term (a deposed one may still think it leads). */
export function leaderOf(s: RaftState) {
  let best = -1;
  s.nodes.forEach((n, i) => { if (!n.down && n.role === "leader" && (best < 0 || n.term > s.nodes[best].term)) best = i; });
  return best;
}

function send(s: RaftState, ctx: TickContext<RaftConfig>, m: Omit<MsgBase, "id" | "sent" | "at"> & Record<string, unknown>) {
  if (s.msgs.length >= MAX_MSGS || ctx.rng.chance(s.loss)) return;
  const slow = s.nodes[m.from].slow || s.nodes[m.to].slow ? SLOW : 1;
  const d = ctx.config.delay * slow * (0.8 + 0.4 * ctx.rng.next());
  s.msgs.push({ ...m, id: ++s.msgSeq, sent: s.t, at: s.t + d } as Msg);
}

function resetTimer(n: RNode, ctx: TickContext<RaftConfig>) {
  const lo = ctx.config.timeoutMin;
  n.timeoutLen = ctx.rng.uniform(lo, Math.max(lo, ctx.config.timeoutMax));
  n.deadline = ctx.t + n.timeoutLen;
}

function stepDown(s: RaftState, i: number, term: number, ctx?: TickContext<RaftConfig>) {
  const n = s.nodes[i];
  if (n.role === "leader") {
    // Clients waiting on this leader get an error: their write's fate is unknown, not lost.
    const mine = s.pending.filter((p) => p.node === i);
    s.failed += mine.length;
    s.pending = s.pending.filter((p) => p.node !== i);
    ctx?.log("warn", `N${i + 1} steps down: saw term ${term}`);
  }
  if (term > n.term) { n.term = term; n.votedFor = null; }
  n.role = "follower";
  n.votes = [];
}

function setCommit(s: RaftState, i: number, to: number, ctx: TickContext<RaftConfig>) {
  const n = s.nodes[i];
  for (let k = n.commit + 1; k <= to; k++) {
    const e = n.log[k - 1];
    if (s.chosen[k] === undefined) {
      s.chosen[k] = e.term;
      if (e.id > 0 && partitioned(s)) s.partitionCommits++;
      if (s.minorityIds.includes(e.id)) s.minorityCommitted++;
      if (e.id > 0) ctx.metrics.inc("committed");
    } else if (s.chosen[k] !== e.term) {
      s.violations++;
      ctx.log("error", `SAFETY VIOLATION: N${i + 1} committed term ${e.term} at #${k}, already committed with term ${s.chosen[k]}`);
    }
  }
  if (to > n.commit && n.role === "leader") {
    if (s.crashAt !== null && n.log[to - 1].term > s.crashTerm) {
      s.failovers = [...s.failovers, s.t - s.crashAt].slice(-KEEP);
      ctx.log("info", `Failover complete: N${i + 1} committed in term ${n.term}, ${Math.round(s.t - s.crashAt)} ms after the crash`);
      s.crashAt = null;
    }
    for (const p of s.pending.filter((x) => x.node === i && x.index <= to)) {
      if (n.log[p.index - 1]?.id === p.id) { s.acked++; ctx.metrics.observe("commitLatency", s.t - p.at); } else s.failed++;
    }
    s.pending = s.pending.filter((x) => !(x.node === i && x.index <= to));
  }
  n.commit = Math.max(n.commit, to);
}

/** §5.3/§5.4.2: commit the highest N with a majority of matchIndex ≥ N and log[N].term == currentTerm. */
export function advanceCommit(s: RaftState, i: number, ctx: TickContext<RaftConfig>) {
  const n = s.nodes[i];
  for (let k = n.log.length; k > n.commit; k--) {
    if (n.log[k - 1].term !== n.term) break; // older-term entries commit only underneath a current-term one
    const have = 1 + n.match.filter((m, j) => j !== i && m >= k).length;
    if (have >= MAJORITY) { setCommit(s, i, k, ctx); return; }
  }
}

function sendAE(s: RaftState, i: number, to: number, ctx: TickContext<RaftConfig>) {
  const n = s.nodes[i];
  const prevIndex = n.next[to] - 1;
  send(s, ctx, { kind: "AE", from: i, to, term: n.term, prevIndex, prevTerm: n.log[prevIndex - 1]?.term ?? 0, entries: n.log.slice(prevIndex, prevIndex + BATCH), commit: n.commit });
}

function startElection(s: RaftState, i: number, ctx: TickContext<RaftConfig>) {
  const n = s.nodes[i];
  const L = s.nodes.findIndex((x, j) => j !== i && !x.down && x.role === "leader" && x.group === n.group && x.term >= n.term);
  if (L >= 0) s.spurious++;
  n.term++;
  n.role = "candidate";
  n.votedFor = i;
  n.votes = [i];
  s.elections++;
  ctx.metrics.inc("elections");
  resetTimer(n, ctx);
  ctx.log("info", `N${i + 1} timed out after ${Math.round(n.timeoutLen)} ms: candidate for term ${n.term}`);
  for (let j = 0; j < N; j++) if (j !== i) send(s, ctx, { kind: "RV", from: i, to: j, term: n.term, lastIndex: n.log.length, lastTerm: lastTerm(n) });
}

function becomeLeader(s: RaftState, i: number, ctx: TickContext<RaftConfig>) {
  const n = s.nodes[i];
  n.role = "leader";
  n.next = Array(N).fill(n.log.length + 1);
  n.match = Array(N).fill(0);
  n.log.push({ term: n.term, id: 0 });
  n.hbDue = s.t;
  const prev = s.leaders[n.term];
  if (prev !== undefined && prev !== i) { s.splitBrain++; ctx.log("error", `SPLIT BRAIN: N${i + 1} and N${prev + 1} both lead term ${n.term}`); }
  s.leaders[n.term] = i;
  ctx.log("info", `N${i + 1} wins term ${n.term} with ${n.votes.length} of ${N} votes`);
}

function handle(s: RaftState, m: Msg, ctx: TickContext<RaftConfig>) {
  const i = m.to;
  const n = s.nodes[i];
  // All servers: a higher term in any RPC or reply means we are behind (Figure 2, "Rules for Servers").
  if (m.term > n.term) stepDown(s, i, m.term, ctx);
  switch (m.kind) {
    case "RV": {
      // §5.4.1 election restriction: candidate's log must be at least as up-to-date as ours.
      const upToDate = m.lastTerm > lastTerm(n) || (m.lastTerm === lastTerm(n) && m.lastIndex >= n.log.length);
      const granted = m.term === n.term && (n.votedFor === null || n.votedFor === m.from) && upToDate;
      if (granted) { n.votedFor = m.from; resetTimer(n, ctx); }
      send(s, ctx, { kind: "RVR", from: i, to: m.from, term: n.term, granted });
      return;
    }
    case "RVR":
      if (n.role === "candidate" && m.term === n.term && m.granted && !n.votes.includes(m.from)) {
        n.votes.push(m.from);
        if (n.votes.length >= MAJORITY) becomeLeader(s, i, ctx);
      }
      return;
    case "AE": {
      const reply = (success: boolean, match: number) => send(s, ctx, { kind: "AER", from: i, to: m.from, term: n.term, success, match });
      if (m.term < n.term) return reply(false, 0);
      if (n.role !== "follower") stepDown(s, i, m.term, ctx); // a candidate that hears the term's leader yields
      resetTimer(n, ctx);
      if (m.prevIndex > n.log.length || (m.prevIndex > 0 && n.log[m.prevIndex - 1].term !== m.prevTerm)) {
        // Hint (beyond Figure 2): where to retry, so the leader skips straight to our log end.
        return reply(false, Math.min(n.log.length, m.prevIndex - 1));
      }
      m.entries.forEach((e, k) => {
        const idx = m.prevIndex + 1 + k;
        if (idx <= n.log.length && n.log[idx - 1].term !== e.term) {
          // Conflict: same index, different term → delete it and everything after (Figure 2, step 3).
          const cut = n.log.length - idx + 1;
          s.truncated += cut;
          n.log.length = idx - 1;
          ctx.log("warn", `N${i + 1} drops ${cut} conflicting entr${cut > 1 ? "ies" : "y"} from #${idx} to match leader N${m.from + 1}`);
        }
        if (idx > n.log.length) n.log.push(e);
      });
      const last = m.prevIndex + m.entries.length;
      if (m.commit > n.commit) setCommit(s, i, Math.min(m.commit, last), ctx);
      return reply(true, last);
    }
    case "AER":
      if (n.role !== "leader" || m.term !== n.term) return;
      if (m.success) {
        n.match[m.from] = Math.max(n.match[m.from], m.match);
        n.next[m.from] = Math.max(n.next[m.from], m.match + 1);
        advanceCommit(s, i, ctx);
        if (n.next[m.from] <= n.log.length) sendAE(s, i, m.from, ctx);
      } else {
        n.next[m.from] = Math.max(1, Math.min(n.next[m.from] - 1, m.match + 1));
        sendAE(s, i, m.from, ctx);
      }
  }
}

function clientWrite(s: RaftState, i: number) {
  const n = s.nodes[i];
  if (n.log.length >= MAX_LOG) { s.rejected++; return; }
  const id = ++s.writeSeq;
  n.log.push({ term: n.term, id });
  s.pending.push({ node: i, index: n.log.length, id, at: s.t });
  if (partitioned(s) && sideSize(s, i) < MAJORITY) { s.minorityWrites++; s.minorityIds = [...s.minorityIds, id].slice(-50); }
  n.hbDue = Math.min(n.hbDue, s.t); // replicate now, not at the next heartbeat
}

// --- actions (no ctx: they record what they need and the next tick does the rest) ---
const copy = (s: RaftState) => structuredClone(s);

export function crash(s: RaftState, i: number) {
  const n = s.nodes[i];
  if (!n || n.down) return s;
  if (n.role === "leader") {
    s.crashAt = s.t; s.crashTerm = n.term;
    s.failed += s.pending.filter((p) => p.node === i).length;
    s.pending = s.pending.filter((p) => p.node !== i);
  }
  n.down = true;
  n.role = "follower";
  n.votes = [];
  s.notes.push(`N${i + 1} crashed (term ${n.term}, ${n.log.length} entries kept on disk)`);
  return s;
}

export function restart(s: RaftState, i: number) {
  const n = s.nodes[i];
  if (!n || !n.down) return s;
  Object.assign(n, { down: false, role: "follower", commit: 0, votes: [], deadline: -1 });
  s.notes.push(`N${i + 1} restarted as follower in term ${n.term}; commit index starts at 0`);
  return s;
}

export function move(s: RaftState, i: number, group: 0 | 1) {
  const was = partitioned(s);
  s.nodes[i].group = group;
  const now = partitioned(s);
  if (!was && now) { s.partitionAt = s.t; s.healAt = null; s.notes.push(`Partition: ${groups(s)}`); }
  else if (was && !now) { s.healAt = s.t; s.truncAtHeal = s.truncated; s.partitionAt = null; s.notes.push("Partition healed"); }
  else if (now) s.notes.push(`Partition: ${groups(s)}`);
  return s;
}

const groups = (s: RaftState) => [0, 1].map((g) => s.nodes.map((n, i) => (n.group === g ? `N${i + 1}` : "")).filter(Boolean).join(" ")).join(" | ");

export function heal(s: RaftState) {
  for (let i = 0; i < N; i++) if (s.nodes[i].group) move(s, i, 0);
  return s;
}

// --- challenge helpers ---
export const bestFailover = (s: RaftState) => (s.failovers.length ? Math.min(...s.failovers) : Infinity);
export const bestReconcile = (s: RaftState) => s.reconciles.filter((r) => r.repaired > 0).sort((a, b) => a.ms - b.ms)[0];

export const raftModel: SimModel<RaftConfig, RaftState> = {
  init(c, rng) {
    const nodes = Array.from({ length: N }, (): RNode => {
      const len = rng.uniform(c.timeoutMin, Math.max(c.timeoutMin, c.timeoutMax));
      return { role: "follower", term: 0, votedFor: null, log: [], commit: 0, down: false, slow: false, group: 0, deadline: len, timeoutLen: len, votes: [], next: [], match: [], hbDue: 0 };
    });
    return {
      nodes, msgs: [], msgSeq: 0, t: 0, writeSeq: 0, nextWrite: c.writeRate > 0 ? rng.exponential(c.writeRate) * 1000 : Infinity,
      pending: [], loss: 0, notes: [], leaders: {}, chosen: [], violations: 0, splitBrain: 0, elections: 0, spurious: 0, truncated: 0,
      acked: 0, failed: 0, rejected: 0, crashAt: null, crashTerm: 0, failovers: [], partitionAt: null, minorityWrites: 0, minorityIds: [],
      minorityCommitted: 0, partitionCommits: 0, healAt: null, truncAtHeal: 0, reconciles: [],
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    for (const note of s.notes) ctx.log("warn", note);
    s.notes = [];

    // Deliver due messages in arrival order; a crashed receiver or a partition drops them.
    if (s.msgs.some((m) => m.at <= s.t)) {
      const due = s.msgs.filter((m) => m.at <= s.t).sort((a, b) => a.at - b.at || a.id - b.id);
      s.msgs = s.msgs.filter((m) => m.at > s.t);
      for (const m of due) if (!s.nodes[m.to].down && s.nodes[m.to].group === s.nodes[m.from].group) handle(s, m, ctx);
    }

    for (let i = 0; i < N; i++) {
      const n = s.nodes[i];
      if (n.down) continue;
      if (n.deadline < 0) resetTimer(n, ctx);
      if (n.role === "leader") {
        if (s.t >= n.hbDue) {
          for (let j = 0; j < N; j++) if (j !== i) sendAE(s, i, j, ctx);
          n.hbDue = s.t + c.heartbeat;
        }
      } else if (s.t >= n.deadline) startElection(s, i, ctx);
    }

    while (s.nextWrite <= s.t) {
      s.nextWrite += c.writeRate > 0 ? ctx.rng.exponential(c.writeRate) * 1000 : Infinity;
      const ls = s.nodes.map((_, i) => i).filter((i) => !s.nodes[i].down && s.nodes[i].role === "leader");
      // Several clients: each knows some node it believes is leader, so a stale leader keeps getting writes too.
      if (ls.length) clientWrite(s, ctx.rng.pick(ls)); else { s.rejected++; ctx.metrics.inc("rejected"); }
    }

    // Log Matching: same length and same last term ⇒ identical logs, so this checks full agreement.
    if (s.healAt !== null) {
      const n0 = s.nodes[0];
      if (s.nodes.every((n) => !n.down && n.log.length === n0.log.length && lastTerm(n) === lastTerm(n0) && n.commit === n0.commit && n.commit === n.log.length)) {
        const r = { ms: s.t - s.healAt, repaired: s.truncated - s.truncAtHeal };
        s.reconciles = [...s.reconciles, r].slice(-KEEP);
        ctx.log("info", `Logs reconciled ${Math.round(r.ms)} ms after the heal: all ${N} nodes hold the same ${n0.log.length} entries${r.repaired ? `, ${r.repaired} conflicting entries overwritten` : ""}`);
        s.healAt = null;
      }
    }
    return s;
  },

  actions: {
    crash: (s, p) => crash(copy(s), (p as { node: number }).node),
    restart: (s, p) => restart(copy(s), (p as { node: number }).node),
    toggleCrash(s, p) { const i = (p as { node: number }).node; return s.nodes[i].down ? restart(copy(s), i) : crash(copy(s), i); },
    toggleSlow(s, p) { const x = copy(s); const n = x.nodes[(p as { node: number }).node]; n.slow = !n.slow; return x; },
    move(s, p) { const { node, group } = p as { node: number; group: 0 | 1 }; return move(copy(s), node, group); },
    heal: (s) => heal(copy(s)),
    write(s, p) {
      const x = copy(s);
      const i = (p as { node?: number } | undefined)?.node ?? leaderOf(x);
      if (i >= 0 && !x.nodes[i].down && x.nodes[i].role === "leader") clientWrite(x, i); else x.rejected++;
      return x;
    },
  },

  faults: [
    { id: "crash-leader", label: "Crash the leader", description: "The leader process dies. Followers stop hearing heartbeats and, after a randomized election timeout, one of them runs for the next term. Clear it to restart every crashed node.",
      apply: (s) => { const i = leaderOf(s); return i >= 0 ? crash(s, i) : s; },
      revert: (s) => { s.nodes.forEach((n, i) => n.down && restart(s, i)); return s; } },
    { id: "split", label: "Partition: leader in the minority", description: "Cuts the leader and one follower off from the other three. The old leader keeps accepting writes it can never commit; the majority elects a new leader. Clear it to heal and watch the logs reconcile.",
      apply: (s) => { const L = Math.max(0, leaderOf(s)); move(s, L, 1); move(s, (L + 1) % N, 1); return s; },
      revert: heal },
    { id: "loss", label: "Lossy network (20% dropped)", description: "Every message has a 20% chance of vanishing. Raft retries on the next heartbeat; safety holds, progress slows.",
      apply: (s) => { s.loss = 0.2; return s; }, revert: (s) => { s.loss = 0; return s; } },
  ],

  metrics(s, reg, t) {
    const L = leaderOf(s);
    const p = reg.histogram("commitLatency")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    const up = s.nodes.filter((n) => !n.down);
    return {
      term: Math.max(0, ...up.map((n) => n.term)), leader: L + 1, leaders: up.filter((n) => n.role === "leader").length,
      commit: Math.max(0, ...up.map((n) => n.commit)), uncommitted: L >= 0 ? s.nodes[L].log.length - s.nodes[L].commit : 0,
      acked: s.acked, failed: s.failed, rejected: s.rejected, elections: s.elections, violations: s.violations + s.splitBrain,
      inflight: s.msgs.length, p50: p.p50, p99: p.p99, commitRate: reg.rate("committed", t),
    };
  },
};
