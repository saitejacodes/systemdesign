import type { SimModel } from "@/lib/sim/engine";

/*
 * Three processes on a space-time diagram.
 * Lamport (1978): before a local event or send, L = L + 1; on receive, L = max(L, msg.L) + 1.
 * Vector clocks (Fidge, Mattern 1988): before a local event or send, V[i]++; on receive,
 * V = max(V, msg.V) element-wise, then V[i]++. a → b iff V(a) ≤ V(b) and V(a) ≠ V(b).
 * Every event also gets a wall-clock reading: true time + that process's skew.
 */

export const N = 3;
export const NAMES = ["P1", "P2", "P3"] as const;
const LETTERS = ["a", "b", "c"];
export const MAX_EVENTS = 36;
/** Steps beyond this are the "Break it" NTP step. */
export const NTP_STEP_MS = 300;

export type Kind = "local" | "send" | "recv";
export interface Ev { id: number; p: number; kind: Kind; name: string; tru: number; wall: number; L: number; V: number[]; msg?: number }
export interface Msg { id: number; from: number; to: number; send: number; recv?: number; L: number; V: number[]; sentTru: number; at: number }

export interface ClocksConfig { auto: boolean; rate: number; delay: number; skew1: number; skew2: number; skew3: number }
export interface ClocksState {
  now: number;
  lastTru: number;
  events: Ev[];
  msgs: Msg[];
  L: number[];
  V: number[][];
  counts: number[];
  /** Extra offset from the NTP-step fault, per process. */
  stepped: number[];
  /** Up to two picked event ids, oldest first. */
  picked: number[];
  acc: number;
}

export type Rel = "before" | "after" | "concurrent" | "same";

export const leq = (a: number[], b: number[]) => a.every((x, i) => x <= b[i]);
/** Happens-before read off the vectors alone. */
export function relation(a: Ev, b: Ev): Rel {
  if (a.id === b.id) return "same";
  const ab = leq(a.V, b.V), ba = leq(b.V, a.V);
  return ab && !ba ? "before" : ba && !ab ? "after" : "concurrent";
}
export const hb = (a: Ev, b: Ev) => relation(a, b) === "before";

export const skewsOf = (c: ClocksConfig) => [c.skew1, c.skew2, c.skew3];
export const inFlight = (s: ClocksState) => s.msgs.filter((m) => m.recv === undefined);
export const evById = (s: ClocksState, id: number) => s.events.find((e) => e.id === id);

function fresh(): ClocksState {
  return { now: 0, lastTru: 0, events: [], msgs: [], L: [0, 0, 0], V: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], counts: [0, 0, 0], stepped: [0, 0, 0], picked: [], acc: 0 };
}

// True time strictly increases event by event, so the diagram's x order is real-time order.
function push(s: ClocksState, p: number, kind: Kind, tru: number, skews: number[], msg?: number): Ev {
  const name = `${LETTERS[p]}${++s.counts[p]}`;
  const e: Ev = { id: s.events.length, p, kind, name, tru, wall: tru + skews[p] + s.stepped[p], L: s.L[p], V: [...s.V[p]], msg };
  s.lastTru = tru;
  s.events.push(e);
  return e;
}

export const full = (s: ClocksState) => s.events.length >= MAX_EVENTS;

export function local(s: ClocksState, p: number, skews: number[]) {
  if (full(s)) return undefined;
  s.L[p] += 1;
  s.V[p][p] += 1;
  return push(s, p, "local", Math.max(s.now, s.lastTru + 1), skews);
}

export function send(s: ClocksState, p: number, to: number, skews: number[], delay: number) {
  if (full(s) || to === p) return undefined;
  s.L[p] += 1;
  s.V[p][p] += 1;
  const tru = Math.max(s.now, s.lastTru + 1);
  const m: Msg = { id: s.msgs.length, from: p, to, send: s.events.length, L: s.L[p], V: [...s.V[p]], sentTru: tru, at: tru + delay };
  s.msgs.push(m);
  return push(s, p, "send", tru, skews, m.id);
}

/** Delivers message `id` (or the oldest one in flight to p). Never before sentTru + delay. */
export function receive(s: ClocksState, p: number, skews: number[], id?: number) {
  const m = id !== undefined ? s.msgs[id] : inFlight(s).find((x) => x.to === p);
  if (!m || m.recv !== undefined || m.to !== p || full(s)) return undefined;
  s.L[p] = Math.max(s.L[p], m.L) + 1;
  s.V[p] = s.V[p].map((x, i) => Math.max(x, m.V[i]));
  s.V[p][p] += 1;
  const e = push(s, p, "recv", Math.max(s.now, s.lastTru + 1, m.at), skews, m.id);
  m.recv = e.id;
  return e;
}

export function pick(s: ClocksState, id: number) {
  if (s.picked.includes(id)) s.picked = s.picked.filter((x) => x !== id);
  else s.picked = [...s.picked, id].slice(-2);
}

export const pickedPair = (s: ClocksState) => (s.picked.length === 2 ? s.picked.map((id) => evById(s, id)!) as [Ev, Ev] : undefined);

/** Pair statistics over every unordered pair of events (≤ 630 pairs). */
export function pairStats(s: ClocksState) {
  let concurrent = 0, misleading = 0, wallInverted = 0;
  const E = s.events;
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const r = relation(E[i], E[j]);
    if (r === "concurrent") { concurrent++; if (E[i].L !== E[j].L) misleading++; }
    else {
      const [a, b] = r === "before" ? [E[i], E[j]] : [E[j], E[i]];
      if (b.wall <= a.wall) wallInverted++;
    }
  }
  return { concurrent, misleading, wallInverted };
}

/** The picked pair is concurrent, yet Lamport timestamps put one first. */
export const lamportMisleads = (s: ClocksState) => { const p = pickedPair(s); return !!p && relation(...p) === "concurrent" && p[0].L !== p[1].L; };
/** The picked pair is causally ordered, yet the effect's wall clock reads no later than the cause's. */
export const wallContradicts = (s: ClocksState) => {
  const p = pickedPair(s);
  if (!p) return false;
  const r = relation(...p);
  if (r === "concurrent") return false;
  const [a, b] = r === "before" ? p : [p[1], p[0]];
  return b.wall <= a.wall;
};
/** An event that every other event happened before, with all three processes involved. */
export const seenEverything = (s: ClocksState) =>
  s.events.length >= 6 && s.counts.every((c) => c > 0) && s.events.find((e) => s.events.every((o) => o.id === e.id || hb(o, e)));

interface Payload { p?: number; to?: number; id?: number; skews?: number[]; delay?: number }
const DEF_SKEWS = [0, 0, 0];

export const clocksModel: SimModel<ClocksConfig, ClocksState> = {
  init: () => fresh(),
  tick(s, ctx) {
    s.now = ctx.t;
    const sk = skewsOf(ctx.config);
    if (!ctx.config.auto) return s;
    // The network delivers due messages; one per tick keeps true times distinct.
    const due = s.msgs.find((m) => m.recv === undefined && m.at <= s.now);
    if (due) {
      const e = receive(s, due.to, sk, due.id);
      if (e) ctx.log("info", `${NAMES[e.p]} receives from ${NAMES[due.from]}: ${e.name} · L=${e.L} · V=[${e.V}]`);
      return s;
    }
    if (full(s) || !ctx.rng.chance((ctx.config.rate * ctx.dt) / 1000)) return s;
    const p = ctx.rng.int(0, N - 1);
    if (ctx.rng.chance(0.4)) {
      const e = local(s, p, sk);
      if (e) ctx.log("info", `${NAMES[p]} local event ${e.name} · L=${e.L} · V=[${e.V}]`);
    } else {
      const to = (p + ctx.rng.int(1, N - 1)) % N;
      const e = send(s, p, to, sk, ctx.config.delay);
      if (e) ctx.log("info", `${NAMES[p]} sends to ${NAMES[to]}: ${e.name} · L=${e.L} · V=[${e.V}]`);
    }
    if (full(s)) ctx.log("warn", `Diagram full (${MAX_EVENTS} events). Clear it to keep going.`);
    return s;
  },
  // Actions return a copy so a paused view re-renders. Skews and delay come in the payload (actions don't see config).
  actions: {
    local: (st, q) => { const s = structuredClone(st); const x = (q ?? {}) as Payload; local(s, x.p ?? 0, x.skews ?? DEF_SKEWS); return s; },
    send: (st, q) => { const s = structuredClone(st); const x = (q ?? {}) as Payload; send(s, x.p ?? 0, x.to ?? 1, x.skews ?? DEF_SKEWS, x.delay ?? 50); return s; },
    receive: (st, q) => { const s = structuredClone(st); const x = (q ?? {}) as Payload; receive(s, x.p ?? 0, x.skews ?? DEF_SKEWS, x.id); return s; },
    pick: (st, q) => { const s = structuredClone(st); pick(s, (q as Payload)?.id ?? -1); return s; },
    clear: (st) => ({ ...fresh(), now: st.now, stepped: [...st.stepped] }),
  },
  faults: [
    {
      id: "ntp-step",
      label: "NTP steps P2's clock back",
      description: `P2's clock had drifted ahead; NTP steps it back ${NTP_STEP_MS} ms. Its next events can read earlier wall times than events they caused.`,
      apply: (s) => ({ ...s, stepped: s.stepped.map((x, i) => (i === 1 ? x - NTP_STEP_MS : x)) }),
      revert: (s) => ({ ...s, stepped: s.stepped.map((x, i) => (i === 1 ? x + NTP_STEP_MS : x)) }),
    },
  ],
  metrics(s) {
    const st = pairStats(s);
    return { events: s.events.length, inflight: inFlight(s).length, concurrent: st.concurrent, misleading: st.misleading, wallInverted: st.wallInverted, maxL: Math.max(...s.L) };
  },
};
