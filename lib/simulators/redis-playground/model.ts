import type { Rng, SimModel } from "@/lib/sim/engine";

export type Group = "strings" | "structures" | "atomic";
export interface RedisConfig { group: Group }

type Val =
  | { type: "string"; v: string }
  | { type: "hash"; v: Map<string, string> }
  | { type: "list"; v: string[] }
  | { type: "set"; v: Set<string> }
  | { type: "zset"; v: Map<string, number> }
  | { type: "hll"; v: number[] };
/** exp is an absolute sim time in ms. */
export type Entry = Val & { exp?: number };
export type Reply =
  | { t: "status"; v: string }
  | { t: "err"; v: string }
  | { t: "int"; v: number }
  | { t: "bulk"; v: string | null }
  | { t: "arr"; v: Reply[] | null };
/** One executed command; tx is the EXEC it ran in (0 = none). Exercises are checked against these. */
export interface Op { name: string; args: string[]; reply: Reply; tx: number }
export interface Line { input: string; out: string[]; note?: string }
export interface RedisState {
  db: Map<string, Entry>;
  now: number;
  tx: { queue: string[][]; dirty: boolean } | null;
  txCount: number;
  ops: Op[];
  lines: Line[];
  passed: Record<string, true>;
  stats: { commands: number; lazy: number; active: number };
  activeExpiry: boolean;
  nextCycle: number;
}

export const GROUPS: { id: Group; label: string }[] = [
  { id: "strings", label: "Strings and TTLs" },
  { id: "structures", label: "Rankings and uniques" },
  { id: "atomic", label: "Atomicity" },
];

// ---------- Replies ----------

const OK: Reply = { t: "status", v: "OK" };
const int = (v: number): Reply => ({ t: "int", v });
const bulk = (v: string | null): Reply => ({ t: "bulk", v });
const arr = (v: Reply[] | null): Reply => ({ t: "arr", v });
const err = (v: string): Reply => ({ t: "err", v });
export const WRONGTYPE = "WRONGTYPE Operation against a key holding the wrong kind of value";
const NOT_INT = err("ERR value is not an integer or out of range");
const NOT_FLOAT = err("ERR value is not a valid float");
const SYNTAX = err("ERR syntax error");
const OVERFLOW = err("ERR increment or decrement would overflow");
// Commands throw an error Reply; the dispatcher turns it into the reply.
const fail = (r: Reply | string): never => { throw typeof r === "string" ? err(r) : r; };

const ESC: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\x07": "\\a" };
const quote = (s: string) => `"${s.replace(/[\\"]/g, "\\$&").replace(/[\x00-\x1f\x7f]/g, (c) => ESC[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`)}"`;

/** Formats a reply exactly as redis-cli prints it. */
export function format(r: Reply): string[] {
  switch (r.t) {
    case "status": return [r.v];
    case "err": return [`(error) ${r.v}`];
    case "int": return [`(integer) ${r.v}`];
    case "bulk": return [r.v === null ? "(nil)" : quote(r.v)];
    case "arr": {
      if (r.v === null) return ["(nil)"];
      if (!r.v.length) return ["(empty array)"];
      const w = String(r.v.length).length;
      return r.v.flatMap((x, i) => {
        const p = `${String(i + 1).padStart(w)}) `;
        return format(x).map((l, j) => (j ? " ".repeat(p.length) : p) + l);
      });
    }
  }
}

/** redis-cli's argument splitter: whitespace, "double quotes" with escapes, 'single quotes'. null = unbalanced quotes. */
export function tokenize(line: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  const ws = (c: string | undefined) => c !== undefined && /\s/.test(c);
  for (;;) {
    while (ws(line[i])) i++;
    if (i >= line.length) return out;
    let cur = "";
    let q: string | null = null;
    for (let done = false; !done; i++) {
      const c = line[i];
      if (q && c === undefined) return null;
      if (q === '"') {
        const hex = line.slice(i + 2, i + 4);
        if (c === "\\" && line[i + 1] === "x" && /^[0-9a-f]{2}$/i.test(hex)) { cur += String.fromCharCode(parseInt(hex, 16)); i += 3; }
        else if (c === "\\" && i + 1 < line.length) { const n = line[++i]; cur += ({ n: "\n", r: "\r", t: "\t", b: "\b", a: "\x07" } as Record<string, string>)[n] ?? n; }
        else if (c === '"') { if (i + 1 < line.length && !ws(line[i + 1])) return null; done = true; }
        else cur += c;
      } else if (q === "'") {
        if (c === "\\" && line[i + 1] === "'") { cur += "'"; i++; }
        else if (c === "'") { if (i + 1 < line.length && !ws(line[i + 1])) return null; done = true; }
        else cur += c;
      } else if (c === undefined || ws(c)) done = true;
      else if (c === '"' || c === "'") q = c;
      else cur += c;
    }
    out.push(cur);
  }
}

// ---------- Values ----------

const parseInt64 = (s: string, e: Reply = NOT_INT) => {
  if (!/^-?(0|[1-9]\d*)$/.test(s)) fail(e);
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : fail(e);
};
const parseScore = (s: string) => {
  const l = s.toLowerCase();
  if (l === "inf" || l === "+inf") return Infinity;
  if (l === "-inf") return -Infinity;
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : fail(NOT_FLOAT);
};
export const fmtScore = (n: number) => (n === Infinity ? "inf" : n === -Infinity ? "-inf" : String(n));

export function globToRegex(p: string): RegExp {
  let r = "";
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") r += ".*";
    else if (c === "?") r += ".";
    else if (c === "\\" && i + 1 < p.length) r += esc(p[++i]);
    else if (c === "[" && p.indexOf("]", i + 1) > i + 1) {
      const j = p.indexOf("]", i + 1);
      const body = p.slice(i + 1, j);
      r += `[${body[0] === "^" ? "^" + esc(body.slice(1)).replace(/\\-/g, "-") : esc(body).replace(/\\-/g, "-")}]`;
      i = j;
    } else r += esc(c);
  }
  return new RegExp(`^${r}$`, "s");
}

/** Reads a key without side effects (views and checkers). */
export const peek = (s: RedisState, k: string) => {
  const e = s.db.get(k);
  return e && !(e.exp !== undefined && e.exp <= s.now) ? e : undefined;
};
/** Lazy expiry: a command that touches an expired key deletes it first, so a read never sees it. */
function get(s: RedisState, k: string) {
  const e = s.db.get(k);
  if (e?.exp !== undefined && e.exp <= s.now) { s.db.delete(k); s.stats.lazy++; return undefined; }
  return e;
}
function typed<T extends Val["type"]>(s: RedisState, k: string, type: T) {
  const e = get(s, k);
  if (e && e.type !== type) fail(WRONGTYPE);
  return e as Extract<Entry, { type: T }> | undefined;
}
const liveKeys = (s: RedisState) => [...s.db.keys()].filter((k) => get(s, k));
/** Redis deletes a container key when its last element goes. */
const dropIfEmpty = (s: RedisState, k: string, size: number) => { if (!size) s.db.delete(k); };

function incrBy(s: RedisState, k: string, by: number) {
  const e = typed(s, k, "string");
  const n = (e ? parseInt64(e.v) : 0) + by;
  if (!Number.isSafeInteger(n)) fail(OVERFLOW);
  s.db.set(k, { type: "string", v: String(n), exp: e?.exp });
  return int(n);
}
const sorted = (z: Map<string, number>) => [...z].sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) : a[1] < b[1] ? -1 : 1));
function slice<T>(xs: T[], a: string, b: string) {
  let start = parseInt64(a), stop = parseInt64(b);
  const n = xs.length;
  if (start < 0) start += n;
  if (stop < 0) stop += n;
  start = Math.max(0, start);
  return start > stop || start >= n ? [] : xs.slice(start, Math.min(stop, n - 1) + 1);
}
const zReply = (items: [string, number][], scores: boolean) => arr(items.flatMap(([m, sc]) => (scores ? [bulk(m), bulk(fmtScore(sc))] : [bulk(m)])));

// ---------- HyperLogLog: 2^10 six-bit registers, standard error 1.04/√1024 ≈ 3.25% ----------

export const HLL_P = 10;
const HLL_M = 1 << HLL_P;
export function hash32(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  // FNV alone mixes the high bits poorly; the murmur3 finaliser spreads them.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export function hllAdd(reg: number[], el: string) {
  const h = hash32(el);
  const idx = h >>> (32 - HLL_P);
  const w = (h << HLL_P) >>> 0;
  const rho = w === 0 ? 32 - HLL_P + 1 : Math.clz32(w) + 1;
  if (rho <= reg[idx]) return false;
  reg[idx] = rho;
  return true;
}
export function hllCount(reg: number[]) {
  let sum = 0, zeros = 0;
  for (const r of reg) { sum += 2 ** -r; if (!r) zeros++; }
  const e = ((0.7213 / (1 + 1.079 / HLL_M)) * HLL_M * HLL_M) / sum;
  // Linear counting is far more accurate while many registers are still empty.
  return Math.round(e <= 2.5 * HLL_M && zeros ? HLL_M * Math.log(HLL_M / zeros) : e);
}

// ---------- Commands ----------

type Cmd = { arity: number; run(s: RedisState, a: string[]): Reply; note?: string };
const KEYS_NOTE = "KEYS walks every key on Redis's single thread: on a big instance it blocks every other client. Use SCAN in production.";

const COMMANDS: Record<string, Cmd> = {
  PING: { arity: -1, run: (_s, a) => (a.length > 1 ? fail(arityErr("ping")) : a.length ? bulk(a[0]) : { t: "status", v: "PONG" }) },
  GET: { arity: 2, run: (s, [k]) => bulk(typed(s, k, "string")?.v ?? null) },
  SET: {
    arity: -3,
    run(s, [k, v, ...opts]) {
      let nx = false, xx = false, keep = false, ttl: number | undefined;
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i].toUpperCase();
        if (o === "NX" && !xx) nx = true;
        else if (o === "XX" && !nx) xx = true;
        else if (o === "KEEPTTL" && ttl === undefined) keep = true;
        else if ((o === "EX" || o === "PX") && ttl === undefined && !keep && i + 1 < opts.length) {
          const n = parseInt64(opts[++i]);
          if (n <= 0) fail("ERR invalid expire time in 'set' command");
          ttl = o === "EX" ? n * 1000 : n;
        } else fail(SYNTAX);
      }
      const e = get(s, k);
      if ((nx && e) || (xx && !e)) return bulk(null);
      // A plain SET drops any TTL the key had; KEEPTTL keeps it.
      s.db.set(k, { type: "string", v, exp: ttl !== undefined ? s.now + ttl : keep ? e?.exp : undefined });
      return OK;
    },
  },
  DEL: { arity: -2, run: (s, a) => int(a.filter((k) => get(s, k) && s.db.delete(k)).length) },
  EXISTS: { arity: -2, run: (s, a) => int(a.filter((k) => get(s, k)).length) },
  TYPE: { arity: 2, run: (s, [k]) => { const t = get(s, k)?.type ?? "none"; return { t: "status", v: t === "hll" ? "string" : t }; } },
  EXPIRE: {
    arity: -3,
    run(s, [k, sec, ...opts]) {
      const n = parseInt64(sec);
      if (opts.length > 1) fail("ERR NX and XX, GT or LT options at the same time are not compatible");
      const o = opts[0]?.toUpperCase();
      if (o && !["NX", "XX", "GT", "LT"].includes(o)) fail(`ERR Unsupported option ${opts[0]}`);
      const e = get(s, k);
      if (!e) return int(0);
      const at = s.now + n * 1000;
      // GT and LT treat "no TTL" as an infinite one.
      if ((o === "NX" && e.exp !== undefined) || (o === "XX" && e.exp === undefined) || (o === "GT" && (e.exp === undefined || at <= e.exp)) || (o === "LT" && e.exp !== undefined && at >= e.exp)) return int(0);
      if (n <= 0) s.db.delete(k);
      else e.exp = at;
      return int(1);
    },
  },
  TTL: { arity: 2, run: (s, [k]) => { const e = get(s, k); return int(!e ? -2 : e.exp === undefined ? -1 : Math.floor((e.exp - s.now + 500) / 1000)); } },
  PTTL: { arity: 2, run: (s, [k]) => { const e = get(s, k); return int(!e ? -2 : e.exp === undefined ? -1 : e.exp - s.now); } },
  PERSIST: { arity: 2, run: (s, [k]) => { const e = get(s, k); if (e?.exp === undefined) return int(0); delete e.exp; return int(1); } },
  INCR: { arity: 2, run: (s, [k]) => incrBy(s, k, 1) },
  DECR: { arity: 2, run: (s, [k]) => incrBy(s, k, -1) },
  INCRBY: { arity: 3, run: (s, [k, n]) => incrBy(s, k, parseInt64(n)) },
  DECRBY: { arity: 3, run: (s, [k, n]) => incrBy(s, k, -parseInt64(n)) },
  MGET: { arity: -2, run: (s, a) => arr(a.map((k) => { const e = get(s, k); return bulk(e?.type === "string" ? e.v : null); })) },
  MSET: {
    arity: -3,
    run(s, a) {
      if (a.length % 2) fail(arityErr("mset"));
      for (let i = 0; i < a.length; i += 2) s.db.set(a[i], { type: "string", v: a[i + 1] });
      return OK;
    },
  },
  KEYS: { arity: 2, note: KEYS_NOTE, run: (s, [p]) => { const re = globToRegex(p); return arr(liveKeys(s).filter((k) => re.test(k)).map(bulk)); } },
  SCAN: {
    arity: -2,
    run(s, [cur, ...opts]) {
      const at = parseInt64(cur, err("ERR invalid cursor"));
      let re: RegExp | null = null, count = 10, type: string | null = null;
      for (let i = 0; i < opts.length; i += 2) {
        const o = opts[i].toUpperCase(), v = opts[i + 1];
        if (v === undefined) fail(SYNTAX);
        if (o === "MATCH") re = globToRegex(v);
        else if (o === "COUNT") { count = parseInt64(v); if (count < 1) fail(SYNTAX); }
        else if (o === "TYPE") type = v.toLowerCase();
        else fail(SYNTAX);
      }
      // The cursor is a position in the key table; MATCH and TYPE filter after the batch, like real SCAN, so a batch can come back empty.
      const keys = liveKeys(s);
      const next = at + count >= keys.length ? 0 : at + count;
      const batch = keys.slice(at, at + count).filter((k) => (!re || re.test(k)) && (!type || (s.db.get(k)!.type === "hll" ? "string" : s.db.get(k)!.type) === type));
      return arr([bulk(String(next)), arr(batch.map(bulk))]);
    },
  },
  HSET: {
    arity: -4,
    run(s, [k, ...fv]) {
      if (fv.length % 2) fail(arityErr("hset"));
      const e = typed(s, k, "hash") ?? { type: "hash" as const, v: new Map<string, string>() };
      let added = 0;
      for (let i = 0; i < fv.length; i += 2) { if (!e.v.has(fv[i])) added++; e.v.set(fv[i], fv[i + 1]); }
      s.db.set(k, e);
      return int(added);
    },
  },
  HGET: { arity: 3, run: (s, [k, f]) => bulk(typed(s, k, "hash")?.v.get(f) ?? null) },
  HGETALL: { arity: 2, run: (s, [k]) => arr([...(typed(s, k, "hash")?.v ?? [])].flatMap(([f, v]) => [bulk(f), bulk(v)])) },
  HDEL: {
    arity: -3,
    run(s, [k, ...fs]) {
      const e = typed(s, k, "hash");
      if (!e) return int(0);
      const n = fs.filter((f) => e.v.delete(f)).length;
      dropIfEmpty(s, k, e.v.size);
      return int(n);
    },
  },
  HINCRBY: {
    arity: 4,
    run(s, [k, f, by]) {
      const d = parseInt64(by);
      const e = typed(s, k, "hash") ?? { type: "hash" as const, v: new Map<string, string>() };
      const cur = e.v.has(f) ? parseInt64(e.v.get(f)!, err("ERR hash value is not an integer")) : 0;
      const n = cur + d;
      if (!Number.isSafeInteger(n)) fail(OVERFLOW);
      e.v.set(f, String(n));
      s.db.set(k, e);
      return int(n);
    },
  },
  LPUSH: { arity: -3, run: (s, [k, ...xs]) => push(s, k, xs, true) },
  RPUSH: { arity: -3, run: (s, [k, ...xs]) => push(s, k, xs, false) },
  LPOP: { arity: -2, run: (s, a) => pop(s, a, true) },
  RPOP: { arity: -2, run: (s, a) => pop(s, a, false) },
  LRANGE: { arity: 4, run: (s, [k, a, b]) => arr(slice(typed(s, k, "list")?.v ?? [], a, b).map(bulk)) },
  LLEN: { arity: 2, run: (s, [k]) => int(typed(s, k, "list")?.v.length ?? 0) },
  SADD: {
    arity: -3,
    run(s, [k, ...ms]) {
      const e = typed(s, k, "set") ?? { type: "set" as const, v: new Set<string>() };
      const n = ms.filter((m) => !e.v.has(m) && e.v.add(m)).length;
      s.db.set(k, e);
      return int(n);
    },
  },
  SREM: {
    arity: -3,
    run(s, [k, ...ms]) {
      const e = typed(s, k, "set");
      if (!e) return int(0);
      const n = ms.filter((m) => e.v.delete(m)).length;
      dropIfEmpty(s, k, e.v.size);
      return int(n);
    },
  },
  SMEMBERS: { arity: 2, run: (s, [k]) => arr([...(typed(s, k, "set")?.v ?? [])].map(bulk)) },
  SISMEMBER: { arity: 3, run: (s, [k, m]) => int(typed(s, k, "set")?.v.has(m) ? 1 : 0) },
  SCARD: { arity: 2, run: (s, [k]) => int(typed(s, k, "set")?.v.size ?? 0) },
  ZADD: {
    arity: -4,
    run(s, [k, ...rest]) {
      const f = new Set<string>();
      while (rest.length && ["NX", "XX", "CH", "INCR"].includes(rest[0].toUpperCase())) f.add(rest.shift()!.toUpperCase());
      if (!rest.length || rest.length % 2) fail(SYNTAX);
      if (f.has("NX") && f.has("XX")) fail("ERR XX and NX options at the same time are not compatible");
      if (f.has("INCR") && rest.length > 2) fail("ERR INCR option supports a single increment-element pair");
      const pairs: [number, string][] = [];
      for (let i = 0; i < rest.length; i += 2) pairs.push([parseScore(rest[i]), rest[i + 1]]);
      const old = typed(s, k, "zset");
      const z = old?.v ?? new Map<string, number>();
      let added = 0, changed = 0;
      let last: number | null = null;
      for (const [sc, m] of pairs) {
        const has = z.has(m);
        if ((f.has("NX") && has) || (f.has("XX") && !has)) continue;
        const next = f.has("INCR") ? (z.get(m) ?? 0) + sc : sc;
        if (Number.isNaN(next)) fail("ERR resulting score is not a number (NaN)");
        if (!has) added++;
        else if (z.get(m) !== next) changed++;
        z.set(m, next);
        last = next;
      }
      if (!old && z.size) s.db.set(k, { type: "zset", v: z });
      if (f.has("INCR")) return bulk(last === null ? null : fmtScore(last));
      return int(f.has("CH") ? added + changed : added);
    },
  },
  ZINCRBY: {
    arity: 4,
    run(s, [k, by, m]) {
      const d = parseScore(by);
      const e = typed(s, k, "zset") ?? { type: "zset" as const, v: new Map<string, number>() };
      const n = (e.v.get(m) ?? 0) + d;
      if (Number.isNaN(n)) fail("ERR resulting score is not a number (NaN)");
      e.v.set(m, n);
      s.db.set(k, e);
      return bulk(fmtScore(n));
    },
  },
  ZRANGE: {
    arity: -4,
    run(s, [k, a, b, ...opts]) {
      const o = opts.map((x) => x.toUpperCase());
      if (o.some((x) => x !== "REV" && x !== "WITHSCORES")) fail(SYNTAX);
      const items = sorted(typed(s, k, "zset")?.v ?? new Map());
      return zReply(slice(o.includes("REV") ? items.reverse() : items, a, b), o.includes("WITHSCORES"));
    },
  },
  ZREVRANGE: {
    arity: -4,
    run(s, [k, a, b, ...opts]) {
      if (opts.length > 1 || (opts[0] && opts[0].toUpperCase() !== "WITHSCORES")) fail(SYNTAX);
      return zReply(slice(sorted(typed(s, k, "zset")?.v ?? new Map()).reverse(), a, b), opts.length === 1);
    },
  },
  ZRANK: { arity: 3, run: (s, [k, m]) => rank(s, k, m, false) },
  ZREVRANK: { arity: 3, run: (s, [k, m]) => rank(s, k, m, true) },
  ZSCORE: { arity: 3, run: (s, [k, m]) => { const v = typed(s, k, "zset")?.v.get(m); return bulk(v === undefined ? null : fmtScore(v)); } },
  ZCARD: { arity: 2, run: (s, [k]) => int(typed(s, k, "zset")?.v.size ?? 0) },
  ZREM: {
    arity: -3,
    run(s, [k, ...ms]) {
      const e = typed(s, k, "zset");
      if (!e) return int(0);
      const n = ms.filter((m) => e.v.delete(m)).length;
      dropIfEmpty(s, k, e.v.size);
      return int(n);
    },
  },
  PFADD: {
    arity: -2,
    run(s, [k, ...els]) {
      const old = typed(s, k, "hll");
      const e = old ?? { type: "hll" as const, v: new Array<number>(HLL_M).fill(0) };
      let changed = !old;
      for (const el of els) if (hllAdd(e.v, el)) changed = true;
      s.db.set(k, e);
      return int(changed ? 1 : 0);
    },
  },
  PFCOUNT: {
    arity: -2,
    run(s, keys) {
      // Several keys: count the union by taking the max of each register.
      const reg = new Array<number>(HLL_M).fill(0);
      for (const k of keys) typed(s, k, "hll")?.v.forEach((r, i) => { if (r > reg[i]) reg[i] = r; });
      return int(hllCount(reg));
    },
  },
  DBSIZE: { arity: 1, run: (s) => int(s.db.size) },
  FLUSHALL: {
    arity: -1,
    run(s, a) {
      if (a.length > 1 || (a[0] && !["ASYNC", "SYNC"].includes(a[0].toUpperCase()))) fail(SYNTAX);
      s.db.clear();
      return OK;
    },
  },
};
export const COMMAND_NAMES = [...Object.keys(COMMANDS), "MULTI", "EXEC", "DISCARD"].sort();

function arityErr(name: string) { return err(`ERR wrong number of arguments for '${name.toLowerCase()}' command`); }
function push(s: RedisState, k: string, xs: string[], left: boolean) {
  const e = typed(s, k, "list") ?? { type: "list" as const, v: [] as string[] };
  for (const x of xs) if (left) e.v.unshift(x); else e.v.push(x);
  s.db.set(k, e);
  return int(e.v.length);
}
function pop(s: RedisState, [k, c, ...extra]: string[], left: boolean) {
  if (extra.length) fail(arityErr(left ? "lpop" : "rpop"));
  const n = c === undefined ? null : parseInt64(c, err("ERR value is out of range, must be positive"));
  if (n !== null && n < 0) fail("ERR value is out of range, must be positive");
  const e = typed(s, k, "list");
  if (!e) return n === null ? bulk(null) : arr(null);
  const out = left ? e.v.splice(0, n ?? 1) : e.v.splice(Math.max(0, e.v.length - (n ?? 1))).reverse();
  dropIfEmpty(s, k, e.v.length);
  return n === null ? bulk(out[0]) : arr(out.map(bulk));
}
function rank(s: RedisState, k: string, m: string, rev: boolean) {
  const items = sorted(typed(s, k, "zset")?.v ?? new Map());
  const i = items.findIndex(([x]) => x === m);
  return i < 0 ? bulk(null) : int(rev ? items.length - 1 - i : i);
}

/** Validation done when a command is queued: an unknown command or wrong arity aborts the whole MULTI at EXEC. */
function validate([name, ...args]: string[]): Reply | null {
  const c = COMMANDS[name.toUpperCase()];
  if (!c) return err(`ERR unknown command '${name}', with args beginning with: ${args.map((a) => `'${a}' `).join("")}`);
  const n = args.length + 1;
  return (c.arity > 0 ? n !== c.arity : n < -c.arity) ? arityErr(name) : null;
}

const cap = <T>(xs: T[], n: number) => { if (xs.length > n) xs.splice(0, xs.length - n); };

function run(s: RedisState, argv: string[], tx: number): { reply: Reply; note?: string } {
  const name = argv[0].toUpperCase(), args = argv.slice(1);
  const c = COMMANDS[name];
  let reply: Reply;
  try { reply = c.run(s, args); } catch (e) { if ((e as Reply)?.t !== "err") throw e; reply = e as Reply; }
  s.stats.commands++;
  s.ops.push({ name, args, reply, tx });
  cap(s.ops, 400);
  return { reply, note: c.note };
}

function dispatch(s: RedisState, argv: string[]): { reply: Reply; note?: string } {
  const name = argv[0].toUpperCase();
  const bare = argv.length === 1;
  if (s.tx) {
    if (name === "EXEC" || name === "DISCARD") {
      if (!bare) { s.tx.dirty = true; return { reply: arityErr(argv[0]) }; }
      const tx = s.tx;
      s.tx = null;
      if (name === "DISCARD") return { reply: OK };
      if (tx.dirty) return { reply: err("EXECABORT Transaction discarded because of previous errors.") };
      // Runs back to back: nothing else (not even the clock) moves between queued commands.
      const id = ++s.txCount;
      return { reply: arr(tx.queue.map((a) => run(s, a, id).reply)) };
    }
    if (name === "MULTI") return { reply: err("ERR MULTI calls can not be nested") };
    const bad = validate(argv);
    if (bad) { s.tx.dirty = true; return { reply: bad }; }
    s.tx.queue.push(argv);
    return { reply: { t: "status", v: "QUEUED" } };
  }
  if (name === "MULTI" || name === "EXEC" || name === "DISCARD") {
    if (!bare) return { reply: arityErr(argv[0]) };
    if (name !== "MULTI") return { reply: err(`ERR ${name} without MULTI`) };
    s.tx = { queue: [], dirty: false };
    return { reply: OK };
  }
  const bad = validate(argv);
  return bad ? { reply: bad } : run(s, argv, 0);
}

/** Runs one REPL line against s (mutating it) and returns the redis-cli output lines. */
export function execLine(s: RedisState, input: string): Line {
  const argv = tokenize(input);
  if (argv && !argv.length) return { input, out: [] };
  const r = argv ? dispatch(s, argv) : null;
  const line: Line = { input, out: r ? format(r.reply) : ["Invalid argument(s)"], note: r?.note };
  s.lines.push(line);
  cap(s.lines, 200);
  for (const ex of EXERCISES) if (!s.passed[ex.id] && ex.check(s)) s.passed[ex.id] = true;
  return line;
}

/** Redis's active cycle: sample up to 20 keys with a TTL, delete the expired ones, repeat while over 25% were expired. */
function activeCycle(s: RedisState, rng: Rng, log: (m: string) => void) {
  for (let round = 0; round < 16; round++) {
    const withTtl = [...s.db].filter(([, e]) => e.exp !== undefined);
    if (!withTtl.length) return;
    const sample = withTtl.length <= 20 ? withTtl : Array.from({ length: 20 }, () => rng.pick(withTtl));
    let hit = 0;
    for (const [k, e] of sample) if (s.db.has(k) && e.exp! <= s.now) { s.db.delete(k); s.stats.active++; hit++; log(`Active expiry removed ${k}`); }
    if (hit <= sample.length / 4) return;
  }
}

// ---------- Exercises ----------

export interface Exercise { id: string; group: Group; title: string; goal: string; hint: string; check(s: RedisState): boolean }
const keysLike = (s: RedisState, re: RegExp) => [...s.db.keys()].filter((k) => re.test(k) && peek(s, k));
const isUp = (x: string) => (u: string) => u.toUpperCase() === x;
const DELTA: Record<string, (a: string[]) => number> = { INCR: () => 1, DECR: () => -1, INCRBY: (a) => Number(a[1]), DECRBY: (a) => -Number(a[1]) };

export const EXERCISES: Exercise[] = [
  {
    id: "session", group: "strings", title: "Session store with TTL",
    goal: "Store a session under session:<id> with a JSON value and a 30-minute TTL, set in one command. TTL should then report about 1800.",
    hint: `SET session:9f2c '{"userId":42}' EX 1800, then TTL session:9f2c`,
    check: (s) => keysLike(s, /^session:./).some((k) => {
      const e = peek(s, k)!;
      return e.type === "string" && e.exp !== undefined && e.exp - s.now <= 1_800_000 && s.ops.some((o) => o.name === "SET" && o.args[0] === k && o.reply.t === "status" && o.args.slice(2).some((x) => /^(ex|px)$/i.test(x)));
    }),
  },
  {
    id: "counter", group: "strings", title: "Page-view counter",
    goal: "Count at least three views of the home page in page:home:views using INCR, never SET (INCR is atomic, GET-then-SET races).",
    hint: "INCR page:home:views three times, then GET page:home:views",
    check: (s) => {
      const e = peek(s, "page:home:views");
      const on = (o: Op) => o.args[0] === "page:home:views";
      return e?.type === "string" && /^\d+$/.test(e.v) && Number(e.v) >= 3 && s.ops.some((o) => on(o) && (o.name === "INCR" || o.name === "INCRBY") && o.reply.t === "int") && !s.ops.some((o) => on(o) && o.name === "SET");
    },
  },
  {
    id: "leaderboard", group: "structures", title: "Leaderboard: top 10 and a rank",
    goal: "Build a sorted set called leaderboard with at least 10 players, read the top 10 highest scores, then look up one player's rank.",
    hint: "ZADD leaderboard 1500 alice 1320 bob … (10 players), ZREVRANGE leaderboard 0 9 WITHSCORES, ZREVRANK leaderboard alice",
    check: (s) => {
      const z = peek(s, "leaderboard");
      const lb = (o: Op) => o.args[0] === "leaderboard" && o.reply.t !== "err";
      const top = s.ops.some((o) => lb(o) && o.args[1] === "0" && o.args[2] === "9" && (o.name === "ZREVRANGE" || (o.name === "ZRANGE" && o.args.slice(3).some(isUp("REV")))));
      return z?.type === "zset" && z.v.size >= 10 && top && s.ops.some((o) => lb(o) && (o.name === "ZRANK" || o.name === "ZREVRANK") && o.reply.t === "int");
    },
  },
  {
    id: "visitors", group: "structures", title: "Unique visitors with HyperLogLog",
    goal: "PFADD at least 5 distinct visitors (including a repeat visit) to a visitors:<day> key, then PFCOUNT it. The repeat must not be counted twice.",
    hint: "PFADD visitors:2026-11-02 user:1 user:2 user:3 user:4 user:5 user:1, then PFCOUNT visitors:2026-11-02",
    check: (s) => keysLike(s, /^visitors:./).some((k) => {
      const adds = s.ops.filter((o) => o.name === "PFADD" && o.args[0] === k && o.reply.t === "int").flatMap((o) => o.args.slice(1));
      const distinct = new Set(adds).size;
      return peek(s, k)!.type === "hll" && distinct >= 5 && adds.length > distinct && s.ops.some((o) => o.name === "PFCOUNT" && o.args.includes(k) && o.reply.t === "int");
    }),
  },
  {
    id: "ratelimit", group: "atomic", title: "Fixed-window rate limiter",
    goal: "Count a request in rate:<user> with INCR and give the key a 60-second window with EXPIRE, both inside one MULTI/EXEC so a crash between them can't leave a key that never expires.",
    hint: "MULTI, INCR rate:user:42, EXPIRE rate:user:42 60, EXEC",
    check: (s) => s.ops.some((o) => o.tx > 0 && o.name === "INCR" && /^rate:./.test(o.args[0]) && o.reply.t === "int"
      && s.ops.some((p) => p.tx === o.tx && p.name === "EXPIRE" && p.args[0] === o.args[0] && Number(p.args[1]) > 0 && Number(p.args[1]) <= 60 && p.reply.t === "int" && p.reply.v === 1)),
  },
  {
    id: "transfer", group: "atomic", title: "Atomic transfer",
    goal: "With balance:alice and balance:bob set, move an amount from one to the other inside one MULTI/EXEC: one key goes down by exactly what the other goes up.",
    hint: "MSET balance:alice 100 balance:bob 50, then MULTI, DECRBY balance:alice 30, INCRBY balance:bob 30, EXEC",
    check: (s) => {
      const byTx = new Map<number, Op[]>();
      for (const o of s.ops) if (o.tx) byTx.set(o.tx, [...(byTx.get(o.tx) ?? []), o]);
      return [...byTx.values()].some((ops) => {
        const moves = ops.filter((o) => /^balance:./.test(o.args[0] ?? "") && DELTA[o.name]);
        if (moves.some((o) => o.reply.t !== "int")) return false;
        const net = new Map<string, number>();
        for (const o of moves) net.set(o.args[0], (net.get(o.args[0]) ?? 0) + DELTA[o.name](o.args));
        const v = [...net.values()];
        return net.size >= 2 && v.reduce((a, b) => a + b, 0) === 0 && v.some((x) => x !== 0);
      });
    },
  },
];
export const groupDone = (s: RedisState, g: Group) => EXERCISES.filter((e) => e.group === g && s.passed[e.id]).length;

// ---------- Model ----------

export const initState = (): RedisState => ({
  db: new Map(), now: 0, tx: null, txCount: 0, ops: [], lines: [], passed: {}, stats: { commands: 0, lazy: 0, active: 0 }, activeExpiry: true, nextCycle: 100,
});

export const redisModel: SimModel<RedisConfig, RedisState> = {
  init: initState,
  tick(s, ctx) {
    s.now += ctx.dt;
    // Redis runs the cycle hz=10 times a second.
    if (s.now >= s.nextCycle) {
      s.nextCycle = s.now + 100;
      if (s.activeExpiry) activeCycle(s, ctx.rng, (m) => ctx.log("info", m));
    }
    return s;
  },
  actions: {
    exec: (s, line) => { const c = structuredClone(s); execLine(c, String(line ?? "")); return c; },
    forward: (s, seconds) => ({ ...s, now: s.now + Math.max(0, Number(seconds) || 0) * 1000 }),
    clear: (s) => ({ ...s, lines: [] }),
  },
  faults: [
    {
      id: "no-active-expiry", label: "Stop the active expiry cycle",
      description: "Only lazy expiry is left: expired keys stay in memory until a command touches them. Reads still never return them.",
      apply: (s) => ({ ...s, activeExpiry: false }),
      revert: (s) => ({ ...s, activeExpiry: true }),
    },
  ],
  metrics(s) {
    let ttl = 0, stale = 0;
    for (const e of s.db.values()) if (e.exp !== undefined) { ttl++; if (e.exp <= s.now) stale++; }
    return {
      keys: s.db.size, ttl, stale, lazy: s.stats.lazy, active: s.stats.active, commands: s.stats.commands,
      strings: groupDone(s, "strings"), structures: groupDone(s, "structures"), atomic: groupDone(s, "atomic"), passed: Object.keys(s.passed).length,
    };
  },
};
