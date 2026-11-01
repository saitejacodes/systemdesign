import type { SimModel } from "@/lib/sim/engine";

export interface ChConfig { vnodes: number; keys: number }

export const MIN_NODES = 2;
export const MAX_NODES = 10;
const START_NODES = 4;

export interface Change { kind: "add" | "remove" | "vnodes"; from: number; to: number; movedC: number; movedM: number; t: number; moved: Uint8Array }

export interface ChState {
  /** Stable node ids in insertion order; modulo hashing indexes into this list. */
  ids: number[];
  nextId: number;
  v: number;
  k: number;
  /** Sorted ring positions and the node id owning each. */
  ring: { pos: number; id: number }[];
  keyPos: Uint32Array;
  ownerC: Int32Array;
  ownerM: Int32Array;
  last: Change | null;
  t: number;
}

/** FNV-1a then murmur3's finalizer: a fast, well-spread 32-bit hash. */
export function hash32(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

export function buildRing(ids: number[], v: number) {
  const ring = ids.flatMap((id) => Array.from({ length: v }, (_, j) => ({ pos: hash32(`node-${id}#${j}`), id })));
  return ring.sort((a, b) => a.pos - b.pos);
}

/** The first ring point clockwise from pos (wrapping past 2³²). */
export function lookup(ring: ChState["ring"], pos: number) {
  let lo = 0, hi = ring.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ring[mid].pos < pos) lo = mid + 1; else hi = mid; }
  return ring[lo === ring.length ? 0 : lo].id;
}

function assign(s: ChState) {
  s.ring = buildRing(s.ids, s.v);
  const n = s.ids.length;
  for (let i = 0; i < s.k; i++) { s.ownerC[i] = lookup(s.ring, s.keyPos[i]); s.ownerM[i] = s.ids[s.keyPos[i] % n]; }
}

/** Recomputes owners and records which keys moved, comparing by node id. */
function change(s: ChState, kind: Change["kind"], from: number, mutate: () => void) {
  const prevC = s.ownerC.slice(), prevM = s.ownerM.slice();
  mutate();
  assign(s);
  const moved = new Uint8Array(s.k);
  let c = 0, m = 0;
  for (let i = 0; i < s.k; i++) {
    if (prevC[i] !== s.ownerC[i]) { moved[i] = 1; c++; }
    if (prevM[i] !== s.ownerM[i]) m++;
  }
  s.last = { kind, from, to: kind === "vnodes" ? s.v : s.ids.length, movedC: c / s.k, movedM: m / s.k, t: s.t, moved };
  return s;
}

function rebuildKeys(s: ChState) {
  s.keyPos = Uint32Array.from({ length: s.k }, (_, i) => hash32(`key-${i}`));
  s.ownerC = new Int32Array(s.k);
  s.ownerM = new Int32Array(s.k);
  assign(s);
}

export function counts(s: ChState, owner: Int32Array) {
  const c = new Map(s.ids.map((id) => [id, 0]));
  for (let i = 0; i < s.k; i++) c.set(owner[i], (c.get(owner[i]) ?? 0) + 1);
  return s.ids.map((id) => c.get(id)!);
}

/** Standard deviation of keys per node as a fraction of the mean. */
export function spread(xs: number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
  return mean ? sd / mean : 0;
}

export const chModel: SimModel<ChConfig, ChState> = {
  init(c) {
    const s: ChState = { ids: Array.from({ length: START_NODES }, (_, i) => i), nextId: START_NODES, v: c.vnodes, k: c.keys, ring: [], keyPos: new Uint32Array(0), ownerC: new Int32Array(0), ownerM: new Int32Array(0), last: null, t: 0 };
    rebuildKeys(s);
    return s;
  },

  tick(s, ctx) {
    s.t = ctx.t;
    if (ctx.config.keys !== s.k) { s.k = ctx.config.keys; rebuildKeys(s); s.last = null; ctx.log("info", `Placed ${s.k} keys on the ring`); }
    if (ctx.config.vnodes !== s.v) {
      const from = s.v;
      change(s, "vnodes", from, () => { s.v = ctx.config.vnodes; });
      ctx.log("info", `Virtual nodes ${from} → ${s.v}: ${(s.last!.movedC * 100).toFixed(1)}% of keys moved`);
    }
    return s;
  },

  actions: {
    add(s) {
      if (s.ids.length >= MAX_NODES) return s;
      return change(s, "add", s.ids.length, () => { s.ids = [...s.ids, s.nextId++]; });
    },
    remove(s) {
      if (s.ids.length <= MIN_NODES) return s;
      return change(s, "remove", s.ids.length, () => { s.ids = s.ids.slice(0, -1); });
    },
  },

  faults: [
    {
      id: "node-crash",
      label: "Node crashes",
      description: "The newest node disappears. Its keys must find a new home: watch how many others move too.",
      apply: (s) => chModel.actions.remove(s),
      revert: (s) => chModel.actions.add(s),
    },
  ],

  metrics(s) {
    const c = counts(s, s.ownerC);
    const mean = s.k / s.ids.length;
    return {
      nodes: s.ids.length,
      spread: spread(c),
      spreadModulo: spread(counts(s, s.ownerM)),
      maxOverMean: mean ? Math.max(...c) / mean : 0,
      movedC: s.last?.movedC ?? 0,
      movedM: s.last?.movedM ?? 0,
    };
  },
};
