import { createRng, type Rng, type SimModel } from "@/lib/sim/engine";

/*
 * The same key stream goes into a B-tree and an LSM tree.
 * B-tree: in-place pages. Every batch writes each page it dirtied, whole.
 * LSM: a memtable in RAM; when full it is flushed as a sorted file (SSTable) to L0; when L0 has too
 * many files they are merged into L1, and an overfull L1 pushes a file down into L2.
 * Costs use real-world sizes (4 KB pages, 100-byte entries) even though nodes are drawn small.
 */

export const PAGE_BYTES = 4096;
export const ENTRY_BYTES = 100;
export const KEY_SPACE = 10_000;
export const L0_MAX = 4;
export const L1_MAX_FILES = 8;
const READ_WINDOW = 200;
const READS_PER_BATCH = 20;

export interface IvConfig { order: number; pattern: "random" | "sequential"; batch: number; bloom: boolean }

// ── B-tree ──────────────────────────────────────────────────────────────────

export interface BNode { id: number; keys: number[]; kids?: BNode[] }
export interface BTree { root: BNode; order: number; nextId: number }
export const newTree = (order: number): BTree => ({ root: { id: 0, keys: [] }, order, nextId: 1 });
const maxKeys = (t: BTree) => t.order - 1;
const minKeys = (t: BTree) => Math.ceil(t.order / 2) - 1;
const firstGe = (keys: number[], k: number) => { let i = 0; while (i < keys.length && keys[i] < k) i++; return i; };

/** Visits root → leaf; returns the path of node ids and whether the key exists. */
export function btSearch(t: BTree, key: number) {
  const path: number[] = [];
  let n: BNode | undefined = t.root;
  while (n) {
    path.push(n.id);
    const i = firstGe(n.keys, key);
    if (n.keys[i] === key) return { found: true, path };
    n = n.kids?.[i];
  }
  return { found: false, path };
}

/** Inserts and splits upward. Returns the ids it wrote (dirty pages) and the ids that split. */
export function btInsert(t: BTree, key: number) {
  const dirty = new Set<number>(), split: number[] = [], path: number[] = [];
  const ins = (n: BNode): { up: number; right: BNode } | undefined => {
    path.push(n.id);
    const i = firstGe(n.keys, key);
    if (n.keys[i] === key) return; // already there: an update in place
    if (!n.kids) n.keys.splice(i, 0, key);
    else {
      const r = ins(n.kids[i]);
      if (!r) return;
      n.keys.splice(i, 0, r.up);
      n.kids.splice(i + 1, 0, r.right);
    }
    dirty.add(n.id);
    if (n.keys.length <= maxKeys(t)) return;
    const mid = Math.floor(n.keys.length / 2);
    const right: BNode = { id: t.nextId++, keys: n.keys.slice(mid + 1), kids: n.kids?.slice(mid + 1) };
    const up = n.keys[mid];
    n.keys = n.keys.slice(0, mid);
    if (n.kids) n.kids = n.kids.slice(0, mid + 1);
    split.push(n.id);
    dirty.add(right.id);
    return { up, right };
  };
  const r = ins(t.root);
  if (r) {
    t.root = { id: t.nextId++, keys: [r.up], kids: [t.root, r.right] };
    dirty.add(t.root.id);
  }
  return { dirty: [...dirty], split, path };
}

/** Deletes with borrow-from-sibling and merge, keeping every non-root node at least half full. */
export function btDelete(t: BTree, key: number) {
  const dirty = new Set<number>(), path: number[] = [];
  let found = false;
  const fix = (n: BNode, i: number) => {
    const kids = n.kids!, c = kids[i];
    if (c.keys.length >= minKeys(t)) return;
    const l = kids[i - 1], r = kids[i + 1];
    if (l && l.keys.length > minKeys(t)) {
      c.keys.unshift(n.keys[i - 1]); n.keys[i - 1] = l.keys.pop()!;
      if (l.kids) c.kids!.unshift(l.kids.pop()!);
      dirty.add(l.id);
    } else if (r && r.keys.length > minKeys(t)) {
      c.keys.push(n.keys[i]); n.keys[i] = r.keys.shift()!;
      if (r.kids) c.kids!.push(r.kids.shift()!);
      dirty.add(r.id);
    } else {
      const j = l ? i - 1 : i; // merge kids[j] + separator + kids[j + 1] into kids[j]
      const a = kids[j], b = kids[j + 1];
      a.keys.push(n.keys[j], ...b.keys);
      if (a.kids) a.kids.push(...b.kids!);
      n.keys.splice(j, 1); kids.splice(j + 1, 1);
      dirty.add(a.id);
    }
    dirty.add(c.id); dirty.add(n.id);
  };
  const del = (n: BNode, k: number) => {
    path.push(n.id);
    const i = firstGe(n.keys, k);
    if (!n.kids) {
      if (n.keys[i] === k) { n.keys.splice(i, 1); dirty.add(n.id); found = true; }
      return;
    }
    if (n.keys[i] === k) {
      // Swap in the predecessor (largest key on the left), then delete that from the left subtree.
      let p = n.kids[i];
      while (p.kids) p = p.kids[p.kids.length - 1];
      const pred = p.keys[p.keys.length - 1];
      n.keys[i] = pred; dirty.add(n.id); found = true;
      del(n.kids[i], pred);
    } else del(n.kids[i], k);
    fix(n, i);
  };
  del(t.root, key);
  if (t.root.kids && t.root.keys.length === 0) t.root = t.root.kids[0];
  return { found, dirty: [...dirty], path };
}

export const btLevels = (t: BTree) => {
  const out: BNode[][] = [];
  let level = [t.root];
  while (level.length) { out.push(level); level = level.flatMap((n) => n.kids ?? []); }
  return out;
};
/** In-order walk: every key, sorted. */
export const btKeys = (t: BTree) => {
  const walk = (n: BNode): number[] => (n.kids ? n.kids.flatMap((c, i) => [...walk(c), ...(i < n.keys.length ? [n.keys[i]] : [])]) : n.keys);
  return walk(t.root);
};

// ── LSM tree ────────────────────────────────────────────────────────────────

/** d = tombstone (a delete marker that shadows older values). */
export interface Entry { k: number; d?: 1 }
export interface SSTable { id: number; level: number; entries: Entry[]; min: number; max: number }
export interface Lsm { mem: Record<number, Entry>; files: SSTable[]; nextId: number; l1Cursor: number }
export const newLsm = (): Lsm => ({ mem: {}, files: [], nextId: 1, l1Cursor: 0 });

const table = (lsm: Lsm, level: number, entries: Entry[]): SSTable => ({ id: lsm.nextId++, level, entries, min: entries[0].k, max: entries[entries.length - 1].k });
const levelFiles = (lsm: Lsm, level: number) => lsm.files.filter((f) => f.level === level);

/** Merge newest-first runs into sorted files for `level`. Returns entries written. */
function compactInto(lsm: Lsm, inputs: SSTable[], level: number, fileSize: number) {
  // Newer files win: inputs are ordered newest first, so keep the first entry seen per key.
  const seen = new Map<number, Entry>();
  for (const f of inputs) for (const e of f.entries) if (!seen.has(e.k)) seen.set(e.k, e);
  const bottom = !lsm.files.some((f) => f.level > level && !inputs.includes(f));
  const merged = [...seen.values()].filter((e) => !(bottom && e.d)).sort((a, b) => a.k - b.k);
  lsm.files = lsm.files.filter((f) => !inputs.includes(f));
  for (let i = 0; i < merged.length; i += fileSize) lsm.files.push(table(lsm, level, merged.slice(i, i + fileSize)));
  return merged.length;
}

export interface LsmEvents { flushed: number[]; compacted: number[]; written: number }

/** Flush the memtable and run any compactions it triggers. */
export function lsmFlush(lsm: Lsm, fileSize: number): LsmEvents {
  const ev: LsmEvents = { flushed: [], compacted: [], written: 0 };
  const entries = Object.values(lsm.mem).sort((a, b) => a.k - b.k);
  if (!entries.length) return ev;
  lsm.mem = {};
  const f = table(lsm, 0, entries);
  lsm.files.unshift(f); // newest first
  ev.flushed.push(f.id);
  ev.written += entries.length;
  if (levelFiles(lsm, 0).length > L0_MAX) {
    const l0 = levelFiles(lsm, 0);
    const lo = Math.min(...l0.map((x) => x.min)), hi = Math.max(...l0.map((x) => x.max));
    const l1 = levelFiles(lsm, 1).filter((x) => x.max >= lo && x.min <= hi);
    const before = lsm.nextId;
    ev.written += compactInto(lsm, [...l0, ...l1], 1, fileSize);
    for (let id = before; id < lsm.nextId; id++) ev.compacted.push(id);
  }
  const l1 = levelFiles(lsm, 1).sort((a, b) => a.min - b.min);
  if (l1.length > L1_MAX_FILES) {
    // Leveled compaction: push one L1 file (round robin through the key space) into the overlapping L2 files.
    const pick = l1.find((x) => x.min >= lsm.l1Cursor) ?? l1[0];
    lsm.l1Cursor = pick.max + 1;
    const l2 = levelFiles(lsm, 2).filter((x) => x.max >= pick.min && x.min <= pick.max);
    const before = lsm.nextId;
    ev.written += compactInto(lsm, [pick, ...l2], 2, fileSize);
    for (let id = before; id < lsm.nextId; id++) ev.compacted.push(id);
  }
  return ev;
}

/** Deterministic ~1% false-positive Bloom filter per file. */
export const bloomMaybe = (f: SSTable, k: number) => f.entries.some((e) => e.k === k) || ((Math.imul(f.id * 2654435761 + k, 2246822519) >>> 0) % 100) < 1;

/** Point read: memtable (RAM, free), then L0 newest first, then one file per deeper level. */
export function lsmGet(lsm: Lsm, k: number, bloom: boolean) {
  const touched: number[] = [];
  const m = lsm.mem[k];
  if (m) return { found: !m.d, touched };
  const order = [...levelFiles(lsm, 0), ...levelFiles(lsm, 1), ...levelFiles(lsm, 2)];
  for (const f of order) {
    if (k < f.min || k > f.max) continue; // fence pointers: the key range is kept in memory
    if (bloom && !bloomMaybe(f, k)) continue;
    touched.push(f.id);
    const e = f.entries.find((x) => x.k === k);
    if (e) return { found: !e.d, touched };
  }
  return { found: false, touched };
}

// ── Simulation state ────────────────────────────────────────────────────────

export interface LastOp { kind: "insert" | "search" | "delete"; key: number; found: boolean; path: number[]; split: number[]; files: number[] }
export interface IvState {
  tree: BTree; lsm: Lsm; keys: Record<number, true>;
  seq: number; acc: number; inserted: number;
  btPages: number; btPagesPending: number[]; lsmEntries: number;
  btReads: number[]; lsmReads: number[]; bloomAt?: boolean; noBloomAvg?: number;
  last?: LastOp; flash: number[];
  answer?: "btree" | "lsm";
}

export const btWA = (s: IvState) => (s.inserted ? (s.btPages * PAGE_BYTES) / (s.inserted * ENTRY_BYTES) : 0);
export const lsmWA = (s: IvState) => (s.inserted ? (s.lsmEntries * ENTRY_BYTES) / (s.inserted * ENTRY_BYTES) : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const btReadCost = (s: IvState) => avg(s.btReads);
export const lsmReadCost = (s: IvState) => avg(s.lsmReads);
export const cheaperWriter = (s: IvState) => (btWA(s) <= lsmWA(s) ? "btree" : "lsm");

const nextKey = (s: IvState, c: IvConfig, rng: Rng) => (c.pattern === "sequential" ? s.seq++ % KEY_SPACE : rng.int(0, KEY_SPACE - 1));

/** Write any pages dirtied since the last flush; a page touched twice in one batch is written once. */
function flushPages(s: IvState) { s.btPages += new Set(s.btPagesPending).size; s.btPagesPending = []; }

function insertKey(s: IvState, key: number, batch: number) {
  const r = btInsert(s.tree, key);
  s.btPagesPending.push(...r.dirty);
  s.lsm.mem[key] = { k: key };
  s.keys[key] = true;
  s.inserted++;
  let ev: LsmEvents | undefined;
  if (Object.keys(s.lsm.mem).length >= batch) { ev = lsmFlush(s.lsm, batch); s.lsmEntries += ev.written; }
  return { r, ev };
}

function deleteKey(s: IvState, key: number, batch: number) {
  const r = btDelete(s.tree, key);
  s.btPagesPending.push(...r.dirty);
  flushPages(s);
  s.lsm.mem[key] = { k: key, d: 1 };
  delete s.keys[key];
  if (Object.keys(s.lsm.mem).length >= batch) s.lsmEntries += lsmFlush(s.lsm, batch).written;
  return r;
}

function read(s: IvState, key: number, bloom: boolean) {
  const b = btSearch(s.tree, key);
  const l = lsmGet(s.lsm, key, bloom);
  if (s.bloomAt !== bloom) {
    if (s.bloomAt === false && s.lsmReads.length) s.noBloomAvg = lsmReadCost(s);
    s.bloomAt = bloom; s.lsmReads = []; s.btReads = [];
  }
  s.btReads.push(b.path.length); s.lsmReads.push(l.touched.length);
  if (s.btReads.length > READ_WINDOW) { s.btReads.shift(); s.lsmReads.shift(); }
  return { b, l };
}

const insertBatch = (s: IvState, c: IvConfig, rng: Rng, count = c.batch) => {
  const fresh: number[] = [];
  for (let i = 0; i < count; i++) {
    const { r, ev } = insertKey(s, nextKey(s, c, rng), c.batch);
    fresh.push(...r.split, ...(ev ? [...ev.flushed, ...ev.compacted] : []));
  }
  flushPages(s);
  // Background reads: half for keys that exist, half for keys inside the range that don't.
  const have = Object.keys(s.keys);
  for (let i = 0; i < READS_PER_BATCH; i++) {
    let k = rng.int(0, KEY_SPACE - 1);
    if (i % 2 && have.length) k = Number(rng.pick(have)); else while (s.keys[k]) k = (k + 1) % KEY_SPACE;
    read(s, k, c.bloom);
  }
  s.flash = fresh;
};

export const MAX_KEYS = 5_000;

export const ivModel: SimModel<IvConfig, IvState> = {
  init: (c) => ({ tree: newTree(c.order), lsm: newLsm(), keys: {}, seq: 0, acc: 0, inserted: 0, btPages: 0, btPagesPending: [], lsmEntries: 0, btReads: [], lsmReads: [], flash: [] }),
  tick(s, ctx) {
    if (s.tree.order !== ctx.config.order) {
      // Rebuild at the new order; costs restart because the old pages don't exist any more.
      const keys = btKeys(s.tree);
      s.tree = newTree(ctx.config.order);
      for (const k of keys) btInsert(s.tree, k);
      ctx.log("info", `B-tree rebuilt at order ${ctx.config.order}: height ${btLevels(s.tree).length}.`);
    }
    s.acc += ctx.dt;
    if (s.acc < 1000 || s.inserted >= MAX_KEYS) return s;
    s.acc = 0;
    const files = s.lsm.nextId;
    insertBatch(s, ctx.config, ctx.rng);
    ctx.metrics.inc("inserts", ctx.config.batch);
    if (s.lsm.nextId > files) ctx.log("info", `LSM: ${s.lsm.files.length} SSTables after flush/compaction (L0 ${levelFiles(s.lsm, 0).length}, L1 ${levelFiles(s.lsm, 1).length}, L2 ${levelFiles(s.lsm, 2).length}).`);
    return s;
  },
  actions: {
    insert: (s0, p) => {
      const s = structuredClone(s0);
      const { key, batch } = p as { key: number; batch: number };
      const { r, ev } = insertKey(s, key, batch);
      flushPages(s);
      s.last = { kind: "insert", key, found: true, path: r.path, split: r.split, files: ev ? [...ev.flushed, ...ev.compacted] : [] };
      s.flash = r.split;
      return s;
    },
    search: (s0, p) => {
      const s = structuredClone(s0);
      const { key, bloom } = p as { key: number; bloom: boolean };
      const { b, l } = read(s, key, bloom);
      s.last = { kind: "search", key, found: b.found, path: b.path, split: [], files: l.touched };
      return s;
    },
    delete: (s0, p) => {
      const s = structuredClone(s0);
      const { key, batch } = p as { key: number; batch: number };
      const r = deleteKey(s, key, batch);
      s.last = { kind: "delete", key, found: r.found, path: r.path, split: [], files: [] };
      return s;
    },
    /** Insert n keys right away using the current pattern (the challenge's 1,000). */
    bulk: (s0, p) => {
      const s = structuredClone(s0);
      const { n, config, seed } = p as { n: number; config: IvConfig; seed: number };
      const rng = createRng(seed + s.inserted);
      for (let done = 0; done < n; done += config.batch) insertBatch(s, config, rng, Math.min(config.batch, n - done));
      return s;
    },
    answer: (s0, p) => ({ ...s0, answer: p as "btree" | "lsm" }),
  },
  faults: [],
  metrics: (s) => ({
    keys: Object.keys(s.keys).length,
    inserted: s.inserted,
    btWA: btWA(s),
    lsmWA: lsmWA(s),
    btRead: btReadCost(s),
    lsmRead: lsmReadCost(s),
    height: btLevels(s.tree).length,
    sstables: s.lsm.files.length,
  }),
};
