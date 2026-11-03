import type { Rng, SimModel } from "@/lib/sim/engine";

/*
 * A small shop: gateway → users, orders, payments, inventory, backed by Postgres, a 3-node Redis
 * cache and an external payment provider (PSP). Every request is executed as a tree of spans with
 * sampled latencies; when it completes it feeds per-component RED stats (rate, errors, duration),
 * structured logs and, if sampled, a trace. Five failure conditions change specific code paths, so
 * each leaves its own signature across the three signals.
 */

export const SERVICES = ["gateway", "users", "orders", "payments", "inventory"] as const;
export const DEPS = ["postgres", "redis", "psp"] as const;
export type Comp = (typeof SERVICES)[number] | (typeof DEPS)[number];
export const COMPS: Comp[] = [...SERVICES, ...DEPS];
export type Level = "info" | "warn" | "error";

export type IncidentId = "orders-db" | "psp-timeout" | "cache-down" | "inventory-leak" | "users-deploy";
export type CauseId = "slow-query" | "db-overload" | "dependency-timeout" | "cache-down" | "memory-leak" | "bad-deploy" | "traffic-spike";

export const CAUSES: { id: CauseId; label: string }[] = [
  { id: "slow-query", label: "Slow database query (bad plan / missing index)" },
  { id: "db-overload", label: "Database overloaded (CPU or connections)" },
  { id: "dependency-timeout", label: "Third-party dependency timing out" },
  { id: "cache-down", label: "Cache node down" },
  { id: "memory-leak", label: "Memory leak (GC pauses, OOM restarts)" },
  { id: "bad-deploy", label: "Bad deploy (bug in the new version)" },
  { id: "traffic-spike", label: "Traffic spike (not enough capacity)" },
];

interface IncidentDef {
  id: IncidentId; page: string; cause: CauseId; comps: Comp[];
  mitigation: string; debrief: string;
  /** Nudges for plausible wrong answers, keyed by cause id or "@component". They never name the answer. */
  traps: Record<string, string>;
}

export const INCIDENTS: IncidentDef[] = [
  {
    id: "orders-db", cause: "slow-query", comps: ["orders"],
    page: "GET /api/orders p99 is over 2 s (SLO 500 ms); some checkouts are slow too",
    mitigation: "orders: ANALYZE orders; planner back on orders_customer_id_created_at_idx",
    debrief: "One statement went from an index scan to a sequential scan over 2.1M rows. Postgres's slow-query log lists only that statement, all from orders; users' and inventory's queries are a few ms slower at most (the seq scans eat I/O). Holding connections for 3 s also drains orders' pool of 20 (Little's law: L = λW), which is why checkout's INSERT waits on pool.acquire.",
    traps: {
      "@postgres": "Postgres is the busiest box, but are all its queries slow, or only one? Check which statements show up in its slow-query log and who sends them.",
      "db-overload": "If the database were simply overloaded, every service's queries would be slow. Compare the db spans under users and inventory with those under orders.",
      "@gateway": "The gateway only reports what is below it. Open a slow trace and find the span with the most self time.",
    },
  },
  {
    id: "psp-timeout", cause: "dependency-timeout", comps: ["psp", "payments"],
    page: "POST /api/checkout error rate is 7% (SLO 99.5% success); other routes are fine",
    mitigation: "payments: switched charges to the PSP's secondary region; circuit breaker armed",
    debrief: "The PSP started answering in about 1.5 s or not at all. Payments' client times out at 1500 ms and retries twice with backoff, so a failed checkout takes about 4.8 s and triples the calls to the PSP. Orders and the gateway show the same errors, but their spans have almost no self time: they are just waiting.",
    traps: {
      "@orders": "Orders' spans are long, but look at their self time in the waterfall. Is orders doing the work, or waiting on something below it?",
      "@gateway": "Errors at the edge are symptoms. Follow a failing checkout trace down to the deepest red span.",
      "bad-deploy": "Was anything deployed? Search the logs for a rollout. Then look at what the failing span is calling.",
      "slow-query": "Look at the db spans in a failing checkout: are they slow? What is the long red span?",
    },
  },
  {
    id: "cache-down", cause: "cache-down", comps: ["redis"],
    page: "GET /api/users p99 is over 150 ms (SLO); every read route got slower",
    mitigation: "redis: cache-2 replaced; keys warming back up",
    debrief: "One of three Redis nodes stopped answering. Every key that hashes to cache-2 waits 100 ms for the connect timeout and then falls back to Postgres, so the hit ratio drops from about 95% to about 63% and Postgres takes the extra reads. Postgres looks busier, but it is the victim: the errors are on redis spans, all naming one node.",
    traps: {
      "@postgres": "Postgres is getting more queries. Why? Compare the cache hit ratio before and after, and read the warnings just before each extra db span.",
      "db-overload": "The database is busier, but something is sending it more reads than usual. What fails right before each fallback query?",
      "slow-query": "Which statements are slow, and are they slow or just more frequent? Check the hit ratio.",
      "traffic-spike": "Compare the gateway's request rate with its value before the page. Did traffic actually go up?",
    },
  },
  {
    id: "inventory-leak", cause: "memory-leak", comps: ["inventory"],
    page: "GET /api/products returns bursts of 503s, recovers, then bursts again",
    mitigation: "inventory: rolled out a fix for the unbounded price-cache map; heap flat",
    debrief: "Inventory's heap grows without bound: each full GC reclaims almost nothing, pauses get longer (latency rises before the errors), then the container is OOMKilled (exit 137) and restarts. While it restarts the gateway gets connection refused and returns 503. The heap gauge draws a sawtooth whose floor keeps rising: that is the leak.",
    traps: {
      "bad-deploy": "Restarts can look like a rollout. Search the logs for a deploy, then look at the heap gauge and what each full GC reclaims.",
      "@gateway": "The gateway returns the 503s, but what is it failing to connect to, and why does that upstream keep disappearing?",
      "traffic-spike": "Did the request rate change? What happens to inventory just before each burst of errors?",
    },
  },
  {
    id: "users-deploy", cause: "bad-deploy", comps: ["users"],
    page: "GET /api/users/:id 5xx rate is about 30%; latency is normal",
    mitigation: "users: rolled back to v2.13.2",
    debrief: "Users v2.14.0 rolled out and its profile serializer throws on accounts without a plan field (about 30% of them). The errors are fast (a few ms, no slow dependency), start exactly at the rollout log line, carry version v2.14.0 on the span, and appear only on profile reads: auth for orders and checkout uses a different code path.",
    traps: {
      "@gateway": "The gateway reports the 500s, but whose span is red first, and what does its error message say?",
      "@postgres": "Are the failing requests reaching Postgres at all? Look at a failing trace's waterfall.",
      "traffic-spike": "Errors that are fast and only on one route are rarely capacity. What changed just before they started?",
    },
  },
];
export const incidentOf = (id: IncidentId) => INCIDENTS.find((x) => x.id === id)!;

/** internal: an in-process span (e.g. pool.acquire) that RED stats skip; it isn't a request to the component. */
export interface Span { id: string; parent?: string; comp: Comp; name: string; start: number; dur: number; err?: string; internal?: boolean; attrs?: Record<string, string | number> }
export interface Trace { id: string; t: number; route: string; status: number; dur: number; sampled: boolean; spans: Span[] }
export interface LogLine { n: number; t: number; comp: Comp; level: Level; trace?: string; msg: string }
export interface Point { t: number; rps: number; err: number; p50: number; p99: number }
interface Bucket { n: number; err: number; lat: number[] }
interface Pending { end: number; trace: Trace; logs: Omit<LogLine, "n">[]; keep: boolean }

export interface Incident { id: IncidentId; onset: number; wrong: number; feedback: string[] }
export interface Solved { score: number; ms: number; wrong: number }
export interface ObsConfig { rps: number; infoLogs: "all" | "10%" | "none"; sampling: "head" | "tail"; incident: "none" | IncidentId }

export interface ObsState {
  t: number; sec: number; nextReq: number; seq: number; logN: number;
  /** Break-it faults, applied openly; an incident applies its condition hidden. */
  faults: IncidentId[];
  inc?: Incident; queued?: { id: IncidentId; at: number };
  solved: Partial<Record<IncidentId, Solved>>; revealed: IncidentId[];
  last?: { ok: boolean; text: string };
  pending: Pending[]; logs: LogLine[]; traces: Trace[];
  cur: Record<Comp, Bucket>; series: Record<Comp, Point[]>;
  hits: number; misses: number; hitRatio: number; dbQps: number; dbExtra: number; dbLoad: number;
  /** Little's law estimate of busy connections in orders' pool (sum of query time per second). */
  ordersPool: number; poolAcc: number;
  heap: { live: number; garbage: number; nextGc: number; gcUntil: number; downUntil: number; restarts: number };
  logRate: number; logAcc: number;
}

const LOG_CAP = 800, TRACE_CAP = 60, SERIES_CAP = 60;
const GW_TIMEOUT = 5000, PSP_TIMEOUT = 1500, DB_CAP = 80, POOL = 20, HEAP_MAX = 2048, HEAP_BASE = 520;
const LEAK_MB_S = 22; // compresses an hours-long leak into about a minute per OOM cycle
const SLOW_STMT_MS = 500; // Postgres log_min_duration_statement

export const has = (s: ObsState, id: IncidentId) => s.faults.includes(id) || (s.inc?.id === id && s.t >= s.inc.onset);
const usersVersion = (s: ObsState) => (has(s, "users-deploy") ? "v2.14.0" : "v2.13.2");

const hex = (rng: Rng, n: number) => { let x = ""; while (x.length < n) x += ((rng.next() * 2 ** 32) >>> 0).toString(16).padStart(8, "0"); return x.slice(0, n); };
const ln = (rng: Rng, m: number, sd = 0.35) => m * Math.exp(rng.normal(0, sd));
const r1 = (x: number) => Math.round(x * 10) / 10;

export function addLog(s: ObsState, l: Omit<LogLine, "n">) {
  s.logs.push({ ...l, n: s.logN++ });
  s.logAcc++;
  if (s.logs.length > LOG_CAP + 100) s.logs.splice(0, s.logs.length - LOG_CAP);
}

// ── Request execution ──────────────────────────────────────────────────────

interface Cx { s: ObsState; rng: Rng; t0: number; spans: Span[]; logs: Pending["logs"]; tid: string; info: number }
interface R { end: number; status: number; err?: string }

const open = (cx: Cx, comp: Comp, name: string, start: number, parent?: Span, attrs?: Span["attrs"]): Span => {
  const sp: Span = { id: hex(cx.rng, 16), parent: parent?.id, comp, name, start: r1(start), dur: 0, attrs };
  cx.spans.push(sp);
  return sp;
};
const close = (sp: Span, end: number, status = 200, err?: string): R => { sp.dur = r1(end - sp.start); if (err) sp.err = err; return { end, status, err }; };
const log = (cx: Cx, comp: Comp, level: Level, at: number, msg: string) => {
  if (level === "info" && !cx.rng.chance(cx.info)) return;
  cx.logs.push({ t: cx.t0 + at, comp, level, trace: cx.tid, msg });
};

function redisGet(cx: Cx, parent: Span, at: number, key: string, slot: number): { end: number; hit: boolean } {
  const node = slot % 3;
  const sp = open(cx, "redis", `GET ${key}`, at, parent, { node: `cache-${node + 1}` });
  if (node === 1 && has(cx.s, "cache-down")) {
    close(sp, at + 100, 0, "connect ETIMEDOUT 10.0.3.12:6379");
    log(cx, parent.comp, "warn", at + 100, `redis GET ${key} on cache-2 (10.0.3.12:6379) failed: connect ETIMEDOUT after 100 ms; falling back to postgres`);
    cx.s.misses++;
    return { end: at + 100, hit: false };
  }
  if (cx.rng.chance(0.0008)) log(cx, parent.comp, "warn", at, `redis ECONNRESET on cache-${node + 1}, retried once`);
  const hit = cx.rng.chance(0.95);
  if (hit) cx.s.hits++; else cx.s.misses++;
  sp.attrs!.hit = hit ? "true" : "false";
  return { end: close(sp, at + ln(cx.rng, 0.6)).end, hit };
}

function pg(cx: Cx, parent: Span, at: number, stmt: string, base: number, slow = false): number {
  const load = 1 / (1 - Math.min(0.85, cx.s.dbLoad)); // M/M/1-style queueing: wait grows as 1/(1−ρ)
  const d = slow ? ln(cx.rng, 3200, 0.3) : ln(cx.rng, base) * load;
  const sp = open(cx, "postgres", stmt.split(" ").slice(0, 2).join(" ") + "…", at, parent, {
    "db.statement": stmt, plan: slow ? "Seq Scan on orders (rows examined 2,140,000)" : stmt.startsWith("SELECT") ? "Index Scan" : "Index Scan (row update)",
  });
  if (d > SLOW_STMT_MS) log(cx, "postgres", "warn", at + d, `duration: ${d.toFixed(3)} ms  statement: ${stmt}`);
  if (slow) cx.s.dbExtra += 4; // a seq scan costs far more I/O than an index lookup
  if (parent.comp === "orders") cx.s.poolAcc += d;
  return close(sp, at + d).end;
}

function poolAcquire(cx: Cx, sp: Span, at: number): number {
  const util = cx.s.ordersPool / POOL;
  if (util < 0.75) return at;
  const w = ln(cx.rng, 250 * Math.min(4, (util - 0.75) / 0.25 + 0.2), 0.4);
  const a = open(cx, "orders", "pool.acquire", at, sp, { "pool.size": POOL, "pool.busy": Math.min(POOL, Math.round(cx.s.ordersPool)) });
  a.internal = true;
  if (util >= 1) log(cx, "orders", "warn", at + w, `connection pool exhausted (${POOL}/${POOL} in use), waited ${Math.round(w)} ms`);
  return close(a, at + w).end;
}

function auth(cx: Cx, parent: Span, at: number, sid: number): R {
  const sp = open(cx, "users", "auth.verify", at + 0.3, parent, { version: usersVersion(cx.s) });
  let t = sp.start + ln(cx.rng, 0.5);
  const r = redisGet(cx, sp, t, `session:${sid}`, sid);
  t = r.hit ? r.end : pg(cx, sp, r.end, "SELECT user_id, expires_at FROM sessions WHERE id = $1", 2);
  return close(sp, t + ln(cx.rng, 0.4));
}

function profile(cx: Cx, parent: Span, at: number): R {
  const uid = cx.rng.int(1, 90000);
  const ver = usersVersion(cx.s);
  const sp = open(cx, "users", "GET /users/:id", at + 0.3, parent, { version: ver, "user.id": uid });
  let t = sp.start + ln(cx.rng, 1.2);
  const r = redisGet(cx, sp, t, `user:${uid}`, uid);
  t = r.hit ? r.end : pg(cx, sp, r.end, "SELECT * FROM users WHERE id = $1", 3);
  if (ver === "v2.14.0" && cx.rng.chance(0.3)) {
    const e = "TypeError: Cannot read properties of undefined (reading 'tier')";
    log(cx, "users", "error", t + 1, `${e}\n    at serializeProfile (src/profile/serialize.ts:88:31)\n    at ProfileController.get (src/profile/controller.ts:41:12)  user=${uid} version=v2.14.0`);
    return close(sp, t + 1.5, 500, e);
  }
  if (cx.rng.chance(0.002)) { log(cx, "users", "info", t, `user ${uid} not found`); return close(sp, t + 0.5, 404); }
  return close(sp, t + ln(cx.rng, 1));
}

/** Gateway → inventory: nothing answers while the container restarts. */
function invDown(cx: Cx, at: number): R | undefined {
  return cx.t0 + at < cx.s.heap.downUntil ? { end: at + 1, status: 503, err: "upstream connect error: connection refused (inventory:8080)" } : undefined;
}
/** Stop-the-world pause: a request that lands inside a full GC waits it out. */
const gcWait = (cx: Cx, at: number) => Math.max(0, cx.s.heap.gcUntil - (cx.t0 + at));

function products(cx: Cx, parent: Span, at: number): R {
  const down = invDown(cx, at);
  if (down) return down;
  const sp = open(cx, "inventory", "GET /products", at + 0.3, parent, { "heap.mb": Math.round(cx.s.heap.live + cx.s.heap.garbage) });
  let t = sp.start + gcWait(cx, sp.start) + ln(cx.rng, 1.5);
  const cat = cx.rng.int(1, 300);
  const r = redisGet(cx, sp, t, `products:cat:${cat}`, cat);
  t = r.hit ? r.end : pg(cx, sp, r.end, "SELECT sku, name, price FROM products WHERE category_id = $1 LIMIT 50", 5);
  return close(sp, t + ln(cx.rng, 2));
}

function reserve(cx: Cx, parent: Span, at: number): R {
  const down = invDown(cx, at);
  if (down) return down;
  const sp = open(cx, "inventory", "POST /inventory/reserve", at + 0.3, parent);
  const t = pg(cx, sp, sp.start + gcWait(cx, sp.start) + ln(cx.rng, 0.8), "UPDATE stock SET reserved = reserved + $1 WHERE sku = $2 AND available >= $1", 4);
  log(cx, "inventory", "info", t, `reserved 1 × sku-${cx.rng.int(1000, 9999)}`);
  return close(sp, t + ln(cx.rng, 0.6));
}

function charge(cx: Cx, parent: Span, at: number): R {
  const sp = open(cx, "payments", "POST /payments/charge", at + 0.3, parent);
  const ch = `ch_${hex(cx.rng, 10)}`;
  const bad = has(cx.s, "psp-timeout");
  let t = sp.start + ln(cx.rng, 2);
  for (let a = 1; a <= 3; a++) {
    const p = open(cx, "psp", "POST /v1/charges", t, sp, { "http.url": "https://api.psp.example/v1/charges", attempt: a, "timeout.ms": PSP_TIMEOUT });
    if (bad && cx.rng.chance(0.7)) {
      close(p, t + PSP_TIMEOUT, 0, `timeout after ${PSP_TIMEOUT} ms`);
      log(cx, "payments", "error", t + PSP_TIMEOUT, `POST https://api.psp.example/v1/charges timed out after ${PSP_TIMEOUT} ms (attempt ${a}/3) ${ch}`);
      t += PSP_TIMEOUT + (a < 3 ? 100 * 2 ** (a - 1) : 0);
      continue;
    }
    t = close(p, t + (bad ? Math.min(PSP_TIMEOUT - 1, ln(cx.rng, 900, 0.3)) : ln(cx.rng, 180, 0.3))).end;
    if (cx.rng.chance(0.004)) { log(cx, "payments", "warn", t, `charge ${ch} declined: insufficient_funds`); return close(sp, t + 1, 402); }
    log(cx, "payments", "info", t, `charge ${ch} succeeded`);
    return close(sp, t + ln(cx.rng, 1));
  }
  log(cx, "payments", "error", t, `charge ${ch} failed after 3 attempts: upstream timeout; returning 502`);
  return close(sp, t + 0.5, 502, "upstream psp timeout");
}

function ordersList(cx: Cx, parent: Span, at: number): R {
  const sp = open(cx, "orders", "GET /orders", at + 0.3, parent);
  const t = poolAcquire(cx, sp, sp.start + ln(cx.rng, 0.8));
  const end = pg(cx, sp, t, "SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20", 4, has(cx.s, "orders-db"));
  return close(sp, end + ln(cx.rng, 1.5));
}

function checkout(cx: Cx, parent: Span, at: number): R {
  const sp = open(cx, "orders", "POST /orders", at + 0.3, parent);
  let t = sp.start + ln(cx.rng, 1);
  const inv = reserve(cx, sp, t);
  if (inv.status >= 500) { log(cx, "orders", "error", inv.end, `inventory.reserve failed: ${inv.status} ${inv.err ?? ""}`); return close(sp, inv.end + 0.5, 503, "inventory unavailable"); }
  const pay = charge(cx, sp, inv.end);
  if (pay.status >= 500) { log(cx, "orders", "error", pay.end, `payments.charge failed: ${pay.status} Bad Gateway; released reservation`); return close(sp, pay.end + 1, 502, "payment failed"); }
  if (pay.status >= 400) return close(sp, pay.end + 1, pay.status);
  t = poolAcquire(cx, sp, pay.end);
  t = pg(cx, sp, t, "INSERT INTO orders (customer_id, total_cents, status) VALUES ($1, $2, 'paid')", 3);
  log(cx, "orders", "info", t, `order ord_${hex(cx.rng, 8)} created`);
  return close(sp, t + ln(cx.rng, 0.8));
}

const ROUTES = [
  { w: 0.3, route: "GET /api/users/:id" }, { w: 0.35, route: "GET /api/products" },
  { w: 0.15, route: "GET /api/orders" }, { w: 0.2, route: "POST /api/checkout" },
];

function request(s: ObsState, rng: Rng, t0: number, c: ObsConfig) {
  const x = rng.next();
  let acc = 0;
  const route = (ROUTES.find((r) => (acc += r.w) > x) ?? ROUTES[3]).route;
  const cx: Cx = { s, rng, t0, spans: [], logs: [], tid: hex(rng, 32), info: c.infoLogs === "all" ? 1 : c.infoLogs === "10%" ? 0.1 : 0 };
  const head = c.sampling === "head" && rng.chance(0.1); // decided at the edge, before the outcome is known
  const gw = open(cx, "gateway", route, 0);
  const at = ln(rng, 0.8);
  const sid = rng.int(1, 50000);
  let r: R;
  if (route === "GET /api/users/:id") r = profile(cx, gw, at);
  else if (route === "GET /api/products") r = products(cx, gw, at);
  else {
    const a = auth(cx, gw, at, sid);
    r = route === "GET /api/orders" ? ordersList(cx, gw, a.end) : checkout(cx, gw, a.end);
  }
  let end = r.end + ln(rng, 0.5);
  let status = r.status;
  if (end > GW_TIMEOUT) { end = GW_TIMEOUT; status = 504; r = { ...r, err: "upstream request timeout" }; }
  close(gw, end, status, status >= 500 ? `${status} ${r.err ?? ""}`.trim() : undefined);
  const ms = Math.round(end);
  if (status >= 500) log(cx, "gateway", "error", end, `${route} ${status} ${ms}ms${r.err ? ` (${r.err})` : ""}`);
  else log(cx, "gateway", ms > 1000 ? "warn" : "info", end, `${route} ${status} ${ms}ms`);
  const trace: Trace = { id: cx.tid, t: t0, route, status, dur: r1(end), sampled: head, spans: cx.spans };
  const keep = c.sampling === "head" ? head : status >= 500 || end >= 1000 || rng.chance(0.05); // tail: decided after the outcome
  s.pending.push({ end: t0 + end, trace, logs: cx.logs, keep });
}

function finish(s: ObsState, p: Pending) {
  for (const sp of p.trace.spans) {
    if (sp.internal) continue;
    const b = s.cur[sp.comp];
    b.n++;
    if (sp.err) b.err++;
    b.lat.push(sp.dur);
  }
  // Downstream outages have no span of their own; count the failed call against the target.
  if (p.trace.status === 503 && !p.trace.spans.some((x) => x.comp === "inventory")) { s.cur.inventory.n++; s.cur.inventory.err++; }
  for (const l of p.logs) addLog(s, l);
  if (p.keep) { s.traces.push(p.trace); if (s.traces.length > TRACE_CAP) s.traces.shift(); }
}

const pct = (v: number[], p: number) => { if (!v.length) return 0; const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]; };

function roll(s: ObsState, t: number) {
  for (const c of COMPS) {
    const b = s.cur[c];
    s.series[c].push({ t, rps: b.n, err: b.n ? (b.err / b.n) * 100 : 0, p50: r1(pct(b.lat, 50)), p99: r1(pct(b.lat, 99)) });
    if (s.series[c].length > SERIES_CAP) s.series[c].shift();
  }
  s.dbQps = s.cur.postgres.n + s.dbExtra;
  s.dbExtra = 0;
  s.dbLoad = Math.min(0.95, s.dbQps / DB_CAP);
  const lookups = s.hits + s.misses;
  if (lookups) s.hitRatio = s.hits / lookups;
  s.ordersPool = s.poolAcc / 1000;
  s.logRate = s.logAcc;
  s.hits = s.misses = s.poolAcc = s.logAcc = 0;
  for (const c of COMPS) s.cur[c] = { n: 0, err: 0, lat: [] };
}

function stepHeap(s: ObsState, dt: number, rps: number, log: (l: Level, m: string) => void) {
  const h = s.heap;
  if (s.t < h.downUntil) return;
  if (h.downUntil && s.t - dt < h.downUntil) addLog(s, { t: s.t, comp: "inventory", level: "info", msg: `inventory started in 4.1 s (heap ${(h.live / 1024).toFixed(2)} GB / 2.00 GB)` });
  const leak = has(s, "inventory-leak");
  if (leak) h.live += (LEAK_MB_S * dt) / 1000;
  h.garbage += (12 * dt * rps) / 40 / 1000;
  if (h.garbage > 250) h.garbage = 0; // young GC: a few ms, not logged
  const used = h.live + h.garbage;
  if (used >= HEAP_MAX) {
    h.restarts++;
    h.downUntil = s.t + 5000;
    h.live = HEAP_BASE; h.garbage = 0; h.gcUntil = 0;
    addLog(s, { t: s.t, comp: "inventory", level: "error", msg: `container inventory OOMKilled (exit code 137, limit 2Gi), restart #${h.restarts}` });
    log("error", `inventory OOMKilled, restart #${h.restarts}`);
    return;
  }
  if (h.live > 0.7 * HEAP_MAX && s.t >= h.nextGc) {
    // Old-gen pressure: frequent full GCs that reclaim almost nothing, each one longer.
    const pause = 300 + 900 * ((h.live / HEAP_MAX - 0.7) / 0.3);
    const freed = 8 + (s.seq % 13);
    h.gcUntil = s.t + pause;
    h.nextGc = s.t + 2500;
    addLog(s, { t: s.t, comp: "inventory", level: "warn", msg: `Full GC pause ${Math.round(pause)} ms: old gen ${(h.live / 1024).toFixed(2)} GB → ${((h.live - freed) / 1024).toFixed(2)} GB of 2.00 GB (reclaimed ${freed} MB)` });
  }
}

function onset(s: ObsState, id: IncidentId) {
  if (id === "inventory-leak") s.heap.live = Math.max(s.heap.live, 1300); // it was leaking for a while before anyone got paged
  if (id === "users-deploy") addLog(s, { t: s.t, comp: "users", level: "info", msg: "rollout complete: users v2.14.0 (3/3 pods ready, was v2.13.2)" });
  if (id === "cache-down") addLog(s, { t: s.t, comp: "redis", level: "warn", msg: "cluster: node cache-2 (10.0.3.12:6379) not responding to PING" });
}
function recover(s: ObsState, id: IncidentId) {
  if (id === "inventory-leak") { s.heap.live = HEAP_BASE; s.heap.gcUntil = 0; }
  if (id === "users-deploy") addLog(s, { t: s.t, comp: "users", level: "info", msg: "rollback complete: users v2.13.2 (3/3 pods ready)" });
}

const blankBuckets = () => Object.fromEntries(COMPS.map((c) => [c, { n: 0, err: 0, lat: [] }])) as unknown as Record<Comp, Bucket>;

/** Score: full marks inside 60 s, falling linearly to 30% at 10 min; each wrong answer costs 25%. */
export const scoreFor = (ms: number, wrong: number) => Math.round(100 * Math.max(0.3, Math.min(1, 1 - (ms / 1000 - 60) / 770)) * 0.75 ** wrong);
export const solvedIds = (s: ObsState) => INCIDENTS.map((d) => d.id).filter((id) => s.solved[id]);
export const totalScore = (s: ObsState) => Object.values(s.solved).reduce((a, x) => a + (x?.score ?? 0), 0);

function start(s: ObsState, id: IncidentId, at: number): ObsState {
  s.inc = { id, onset: at, wrong: 0, feedback: [] };
  s.queued = undefined;
  s.last = undefined;
  return s;
}

export const obsModel: SimModel<ObsConfig, ObsState> = {
  init(c, rng) {
    return {
      t: 0, sec: 0, nextReq: rng.exponential(c.rps) * 1000, seq: 0, logN: 0, faults: [],
      queued: c.incident !== "none" ? { id: c.incident, at: 15_000 } : undefined,
      solved: {}, revealed: [], pending: [], logs: [], traces: [],
      cur: blankBuckets(), series: Object.fromEntries(COMPS.map((x) => [x, []])) as unknown as Record<Comp, Point[]>,
      hits: 0, misses: 0, hitRatio: 0.95, dbQps: 0, dbExtra: 0, dbLoad: 0.3, ordersPool: 0, poolAcc: 0,
      heap: { live: HEAP_BASE, garbage: 0, nextGc: 0, gcUntil: 0, downUntil: 0, restarts: 0 },
      logRate: 0, logAcc: 0,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    s.t = ctx.t;
    if (s.queued && ctx.t >= s.queued.at) start(s, s.queued.id, ctx.t);
    if (s.inc && ctx.t >= s.inc.onset && ctx.t - ctx.dt < s.inc.onset) { onset(s, s.inc.id); ctx.log("error", `PAGE: ${incidentOf(s.inc.id).page}`); }
    stepHeap(s, ctx.dt, c.rps, ctx.log);
    while (s.nextReq <= ctx.t) { s.seq++; request(s, ctx.rng, s.nextReq, c); s.nextReq += ctx.rng.exponential(c.rps) * 1000; }
    if (s.pending.length) {
      const done = s.pending.filter((p) => p.end <= ctx.t);
      if (done.length) { s.pending = s.pending.filter((p) => p.end > ctx.t); done.sort((a, b) => a.end - b.end).forEach((p) => finish(s, p)); }
    }
    const sec = Math.floor(ctx.t / 1000);
    if (sec > s.sec) { s.sec = sec; roll(s, ctx.t); }
    return s;
  },

  actions: {
    /** payload: { id?: IncidentId } — no id picks an unsolved one, so the learner doesn't know which. */
    start(s0, payload) {
      const s = structuredClone(s0);
      const open = INCIDENTS.map((d) => d.id).filter((id) => !s.solved[id]);
      const want = (payload as { id?: IncidentId } | undefined)?.id;
      const id = want ?? open[(s.seq * 7) % Math.max(1, open.length)] ?? "orders-db";
      if (s.inc) recover(s, s.inc.id);
      return start(s, id, s.t + 3000);
    },
    /** payload: { cause: CauseId; comp: Comp } */
    submit(s0, payload) {
      const s = structuredClone(s0);
      const inc = s.inc;
      const p = payload as { cause?: CauseId; comp?: Comp } | undefined;
      if (!inc || s.t < inc.onset || !p?.cause || !p.comp) return s0;
      const d = incidentOf(inc.id);
      const okCause = p.cause === d.cause, okComp = d.comps.includes(p.comp);
      if (okCause && okComp) {
        const ms = s.t - inc.onset;
        s.solved[inc.id] = { score: scoreFor(ms, inc.wrong), ms, wrong: inc.wrong };
        s.last = { ok: true, text: `Correct in ${Math.round(ms / 1000)} s (${inc.wrong} wrong). Mitigation: ${d.mitigation}. ${d.debrief}` };
        addLog(s, { t: s.t, comp: p.comp, level: "info", msg: `mitigation: ${d.mitigation}` });
        recover(s, inc.id);
        s.inc = undefined;
        return s;
      }
      inc.wrong++;
      const nudge = (!okCause && d.traps[p.cause]) || (!okComp && d.traps[`@${p.comp}`]) || "Not the root cause. Pick the slowest or first-failing span in a bad trace and read its logs.";
      inc.feedback.unshift(`${okCause ? "Cause right, component wrong." : okComp ? "Component right, cause wrong." : "Both wrong."} ${nudge}`);
      return s;
    },
    reveal(s0) {
      if (!s0.inc) return s0;
      const s = structuredClone(s0);
      const d = incidentOf(s.inc!.id);
      s.revealed.push(d.id);
      s.last = { ok: false, text: `Answer: ${CAUSES.find((x) => x.id === d.cause)!.label} in ${d.comps[0]}. ${d.debrief}` };
      recover(s, d.id);
      s.inc = undefined;
      return s;
    },
  },

  faults: INCIDENTS.map((d) => ({
    id: d.id,
    label: { "orders-db": "Slow query in orders", "psp-timeout": "Payment provider timeouts", "cache-down": "Cache node cache-2 down", "inventory-leak": "Memory leak in inventory", "users-deploy": "Bad deploy of users" }[d.id],
    description: `Applies incident condition openly so you can learn its signature: ${CAUSES.find((x) => x.id === d.cause)!.label.toLowerCase()} (${d.comps[0]}).`,
    apply: (s: ObsState) => { if (!s.faults.includes(d.id)) { s.faults.push(d.id); onset(s, d.id); } return s; },
    revert: (s: ObsState) => { s.faults = s.faults.filter((x) => x !== d.id); recover(s, d.id); return s; },
  })),

  metrics(s) {
    const m: Record<string, number> = {};
    for (const c of COMPS) {
      const p = s.series[c].at(-1);
      m[`rps_${c}`] = p?.rps ?? 0; m[`err_${c}`] = p?.err ?? 0; m[`p99_${c}`] = p?.p99 ?? 0;
    }
    m.hit = s.hitRatio * 100;
    m.heap = Math.round(s.heap.live + s.heap.garbage);
    m.restarts = s.heap.restarts;
    m.dbLoad = s.dbLoad * 100;
    m.pool = Math.min(100, (s.ordersPool / POOL) * 100);
    m.logRate = s.logRate;
    m.solved = solvedIds(s).length;
    m.score = totalScore(s);
    return m;
  },
};

export const POOL_SIZE = POOL;
export const HEAP_LIMIT_MB = HEAP_MAX;
