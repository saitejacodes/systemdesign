import type { SimModel } from "@/lib/sim/engine";

/*
 * Snowflake-style 64-bit IDs: 1 sign bit | timestamp | datacenter | worker | sequence.
 * Sequence bits are whatever is left of the 63, so every layout is a valid 64-bit ID.
 * Each generator runs Twitter's loop once per millisecond of its own clock: same ms →
 * sequence + 1, sequence full → wait for the next ms, new ms → sequence 0.
 * Demand is aggregated per millisecond (Poisson), so millions of IDs a second cost one loop step.
 */

export type Policy = "trust" | "refuse" | "wait" | "borrow";
export const POLICIES: { value: Policy; label: string }[] = [
  { value: "trust", label: "Trust the clock (naive)" },
  { value: "refuse", label: "Refuse until caught up (Twitter)" },
  { value: "wait", label: "Wait if ≤ 10 ms, else refuse" },
  { value: "borrow", label: "Never go back: max(now, last)" },
];
export const WAIT_LIMIT_MS = 10;
export const STEP_EVERY_MS = 3000;
export const VM_PAUSE_MS = 200;
const MS_PER_YEAR = 365.25 * 86_400_000;
const RECENT = 14;
const KEEP_MS = 1000;

export interface SnowConfig { tsBits: number; dcBits: number; workerBits: number; machines: number; rateK: number; policy: Policy; stepBackMs: number }

export interface Layout { ts: number; dc: number; worker: number; seq: number }
export const layoutOf = (c: Pick<SnowConfig, "tsBits" | "dcBits" | "workerBits">): Layout => ({ ts: c.tsBits, dc: c.dcBits, worker: c.workerBits, seq: Math.max(0, 63 - c.tsBits - c.dcBits - c.workerBits) });
export const lifetimeYears = (l: Layout) => 2 ** l.ts / MS_PER_YEAR;
export const maxMachines = (l: Layout) => 2 ** (l.dc + l.worker);
export const perMs = (l: Layout) => 2 ** l.seq;

/** Machine i gets ID i mod 2^(dc+worker): with too few machine bits, two generators share one. */
export const machineIdOf = (l: Layout, i: number) => i % maxMachines(l);
export function compose(l: Layout, ts: number, mid: number, seq: number) {
  return (BigInt(ts) << BigInt(l.dc + l.worker + l.seq)) | (BigInt(mid) << BigInt(l.seq)) | BigInt(seq);
}

export interface Gen {
  /** Clock offset from true time, ms. */
  off: number;
  /** Last timestamp used and the next sequence number in it. */
  last: number;
  seq: number;
  backlog: number;
  /** Largest ID issued, as [ts, seq]; machine bits are constant per generator. */
  top: [number, number];
  outOfOrder: number;
  aheadMs: number;
  state: "ok" | "waiting" | "refusing";
}
export interface Batch { m: number; mid: number; ts: number; from: number; to: number; tru: number; dup: number }

export interface SnowState {
  t: number;
  layout: Layout;
  gens: Gen[];
  /** Per machine ID: ts → how many sequence numbers have been handed out in that ms. */
  issued: Map<number, number>[];
  recent: Batch[];
  demanded: number;
  served: number;
  dups: number;
  rejected: number;
  waitMs: number;
  waitedIds: number;
  maxBacklog: number;
  steps: number;
}

function gen(off: number): Gen { return { off, last: -1, seq: 0, backlog: 0, top: [-1, -1], outOfOrder: 0, aheadMs: 0, state: "ok" }; }

function fresh(c: SnowConfig, offs: number[]): SnowState {
  const layout = layoutOf(c);
  return { t: 0, layout, gens: offs.map(gen), issued: [], recent: [], demanded: 0, served: 0, dups: 0, rejected: 0, waitMs: 0, waitedIds: 0, maxBacklog: 0, steps: 0 };
}

/** Hands out n sequence numbers [from, from + n) at ts; returns how many were already used (duplicates). */
function issue(s: SnowState, m: number, ts: number, from: number, n: number, tru: number) {
  if (n <= 0) return;
  const g = s.gens[m];
  const mid = machineIdOf(s.layout, m);
  const map = (s.issued[mid] ??= new Map());
  const had = map.get(ts) ?? 0;
  const dup = Math.max(0, Math.min(from + n, had) - from);
  map.set(ts, Math.max(had, from + n));
  s.dups += dup;
  s.served += n;
  const [tt, ts2] = g.top;
  if (ts < tt || (ts === tt && from <= ts2)) g.outOfOrder += 1;
  if (ts > tt || (ts === tt && from + n - 1 > ts2)) g.top = [ts, from + n - 1];
  s.recent.push({ m, mid, ts, from, to: from + n - 1, tru, dup });
  if (s.recent.length > RECENT) s.recent.shift();
}

/** One millisecond of true time on generator m: the Snowflake loop, aggregated. */
export function genMs(s: SnowState, m: number, tru: number, demand: number, policy: Policy) {
  const g = s.gens[m];
  const cap = perMs(s.layout);
  const now = Math.max(0, tru + g.off);
  s.demanded += demand;
  g.aheadMs = Math.max(0, g.last - now);
  if (now < g.last && policy !== "trust" && policy !== "borrow") {
    // The clock went backwards. Twitter's original refuses (throws) until it catches up.
    if (policy === "wait" && g.last - now <= WAIT_LIMIT_MS) { g.backlog += demand; g.state = "waiting"; }
    else { s.rejected += demand; g.state = "refusing"; }
    s.waitMs += g.backlog;
    if (g.backlog) s.waitedIds += demand;
    s.maxBacklog = Math.max(s.maxBacklog, g.backlog);
    return;
  }
  let want = g.backlog + demand;
  const ts0 = policy === "borrow" ? Math.max(now, g.last) : now;
  if (ts0 !== g.last) { g.last = ts0; g.seq = 0; }
  let n = Math.max(0, Math.min(want, cap - g.seq));
  issue(s, m, g.last, g.seq, n, tru);
  g.seq += n; want -= n;
  // Never go back also never waits: on overflow it borrows the next millisecond.
  while (policy === "borrow" && want > 0) {
    g.last += 1; g.seq = 0;
    n = Math.min(want, cap);
    issue(s, m, g.last, 0, n, tru);
    g.seq = n; want -= n;
  }
  if (want > 0 && demand > 0) s.waitedIds += Math.min(want, demand);
  g.backlog = want;
  s.waitMs += want; // each queued ID waits one more millisecond for the clock to tick
  s.maxBacklog = Math.max(s.maxBacklog, want);
  g.state = want > 0 ? "waiting" : "ok";
  g.aheadMs = Math.max(0, g.last - now);
}

export function stepBack(s: SnowState, m: number, ms: number) {
  s.gens[m].off -= ms;
  s.steps += 1;
}

export const avgWait = (s: SnowState) => (s.served ? s.waitMs / s.served : 0);

/** Old timestamps can't be revisited by steps smaller than KEEP_MS; drop them to cap memory. */
function prune(s: SnowState) {
  for (const map of s.issued) {
    if (!map || map.size < 2 * KEEP_MS) continue;
    const top = Math.max(...map.keys());
    for (const k of map.keys()) if (k < top - KEEP_MS) map.delete(k);
  }
}

export const snowModel: SimModel<SnowConfig, SnowState> = {
  // Machines start a couple of ms apart, as NTP leaves them: IDs are k-sortable, not strictly sorted.
  init: (c, rng) => fresh(c, Array.from({ length: 8 }, () => rng.int(-2, 2))),
  tick(s, ctx) {
    const c = ctx.config;
    s.layout = layoutOf(c);
    const from = s.t, served = s.served;
    s.t = ctx.t;
    for (let tru = from + 1; tru <= ctx.t; tru++) {
      if (c.stepBackMs > 0 && tru % STEP_EVERY_MS === 0) {
        stepBack(s, 0, c.stepBackMs);
        ctx.log("warn", `NTP steps M1's clock back ${c.stepBackMs} ms (it had drifted ahead).`);
      }
      for (let m = 0; m < c.machines; m++) {
        const before = s.dups, rej = s.rejected;
        genMs(s, m, tru, ctx.rng.poisson(c.rateK), c.policy);
        if (s.dups > before) ctx.log("error", `M${m + 1} re-issued ${s.dups - before} IDs it had already issued (timestamp ${s.gens[m].last}).`);
        else if (s.rejected > rej && s.gens[m].state === "refusing" && tru % 5 === 0) ctx.log("warn", `M${m + 1} refuses: clock is ${s.gens[m].last - (tru + s.gens[m].off)} ms behind its last timestamp.`);
      }
    }
    if (ctx.t % 1000 < ctx.dt) prune(s);
    ctx.metrics.inc("ids", s.served - served);
    return s;
  },
  actions: {},
  faults: [
    {
      id: "vm-pause",
      label: `M2 resumes from a VM pause, clock ${VM_PAUSE_MS} ms behind`,
      description: "A live-migrated VM wakes up with a stale clock, then NTP is slow to fix it. Its clock reads earlier than timestamps it already used.",
      apply: (s) => { const x = structuredClone(s); stepBack(x, 1, VM_PAUSE_MS); return x; },
      revert: (s) => s,
    },
  ],
  metrics(s, reg, t) {
    const l = s.layout;
    return {
      rate: reg.rate("ids", t) / 1000,
      served: s.served,
      dups: s.dups,
      rejected: s.rejected,
      rejectedPct: s.demanded ? (100 * s.rejected) / s.demanded : 0,
      avgWait: avgWait(s),
      backlog: s.gens.reduce((a, g) => a + g.backlog, 0),
      outOfOrder: s.gens.reduce((a, g) => a + g.outOfOrder, 0),
      ahead: Math.max(...s.gens.map((g) => g.aheadMs)),
      lifetime: lifetimeYears(l),
      machinesMax: maxMachines(l),
      perMs: perMs(l),
    };
  },
};
