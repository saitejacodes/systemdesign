import type { SimModel, TickContext } from "@/lib/sim/engine";

export type Mode = "commit-publish" | "publish-commit" | "outbox";
export const MODES: { value: Mode; label: string }[] = [
  { value: "commit-publish", label: "Dual write: commit, then publish" },
  { value: "publish-commit", label: "Dual write: publish, then commit" },
  { value: "outbox", label: "Transactional outbox + relay" },
];

export interface OutboxConfig {
  mode: Mode;
  orderRate: number;
  /** Chance (%) the order service dies between its two steps (inside the transaction for the outbox). */
  crashPct: number;
  /** Chance (%) per poll that the relay dies mid-publish, before marking rows published. */
  relayCrashPct: number;
  pollMs: number;
  batch: number;
  dedupe: boolean;
  /** Stop placing orders after this many (0 = forever). */
  maxOrders: number;
}

export const DB_MS = 25;
export const PUB_MS = 30;
export const HOP_MS = 20;
export const DELIVER_MS = 40;
export const RESTART_MS = 1000;
const FLIGHTS_KEEP = 60;

export type NodeId = "svc" | "db" | "relay" | "broker" | "consumer";
export interface Flight { from: NodeId; to: NodeId; sent: number; at: number }
export type FailKind = "missing" | "phantom" | "rollback" | "relay" | "rejected";
export interface Fail { t: number; kind: FailKind; id: number; n?: number }

export interface OutboxState {
  t: number;
  nextOrder: number;
  nextPoll: number;
  relayUpAt: number;
  relayCrashNext: boolean;
  brokerDown: boolean;
  /** Unpublished outbox rows in commit order; `sent` = published by a relay that crashed before marking it. */
  outbox: { id: number; at: number; sent: boolean }[];
  deliveries: { id: number; sent: number; at: number }[];
  flights: Flight[];
  /** The consumer's processed event ids (its dedupe table when dedupe is on). */
  processed: Set<number>;
  lastFail: Fail | null;
  placed: number; committed: number; failed: number;
  missing: number; phantom: number;
  published: number; duplicates: number; deduped: number; doubleProcessed: number; consumed: number;
  relayCrashes: number;
  /** Challenge guard: the smallest poll interval used. */
  minPoll: number;
}

export const inconsistencies = (s: OutboxState) => s.missing + s.phantom;
export const drained = (s: OutboxState) => s.outbox.length === 0 && s.deliveries.length === 0;

function fly(s: OutboxState, from: NodeId, to: NodeId, sent: number, at: number) {
  s.flights.push({ from, to, sent, at });
  if (s.flights.length > FLIGHTS_KEEP) s.flights.shift();
}

function fail(s: OutboxState, ctx: TickContext<OutboxConfig>, f: Fail, msg: string) {
  s.lastFail = f;
  ctx.log(f.kind === "missing" || f.kind === "phantom" ? "error" : "warn", msg);
}

/** The event reaches the broker at `at`; the consumer gets it DELIVER_MS later. */
function publish(s: OutboxState, ctx: TickContext<OutboxConfig>, id: number, at: number) {
  s.published++;
  ctx.metrics.inc("published");
  s.deliveries.push({ id, sent: at, at: at + DELIVER_MS });
}

function order(s: OutboxState, ctx: TickContext<OutboxConfig>, t0: number) {
  const c = ctx.config;
  const id = ++s.placed;
  const crash = ctx.rng.chance(c.crashPct / 100);
  const pub = PUB_MS * (0.8 + 0.6 * ctx.rng.next());
  if (c.mode === "commit-publish") {
    fly(s, "svc", "db", t0, t0 + DB_MS);
    s.committed++;
    if (crash || s.brokerDown) {
      s.missing++;
      ctx.metrics.inc("inconsistent");
      return fail(s, ctx, { t: t0, kind: "missing", id }, `Order #${id} committed, ${crash ? "service crashed" : "broker unreachable"} before publish: no event, ever`);
    }
    fly(s, "svc", "broker", t0 + DB_MS, t0 + DB_MS + pub);
    publish(s, ctx, id, t0 + DB_MS + pub);
    ctx.metrics.observe("delay", pub);
  } else if (c.mode === "publish-commit") {
    if (s.brokerDown) { s.failed++; return fail(s, ctx, { t: t0, kind: "rejected", id }, `Order #${id}: publish failed, error returned before commit (consistent)`); }
    fly(s, "svc", "broker", t0, t0 + pub);
    publish(s, ctx, id, t0 + pub);
    if (crash) {
      s.phantom++;
      s.failed++;
      ctx.metrics.inc("inconsistent");
      return fail(s, ctx, { t: t0, kind: "phantom", id }, `OrderPlaced #${id} published, then the commit failed: event for an order that doesn't exist`);
    }
    fly(s, "svc", "db", t0 + pub, t0 + pub + DB_MS);
    s.committed++;
    ctx.metrics.observe("delay", 0); // published before the commit
  } else {
    fly(s, "svc", "db", t0, t0 + DB_MS);
    if (crash) { s.failed++; return fail(s, ctx, { t: t0, kind: "rollback", id }, `Order #${id}: service crashed mid-transaction, rolled back: no order, no event (consistent)`); }
    s.committed++;
    s.outbox.push({ id, at: t0 + DB_MS, sent: false });
  }
}

function poll(s: OutboxState, ctx: TickContext<OutboxConfig>, t: number) {
  const c = ctx.config;
  let n = 0;
  while (n < s.outbox.length && n < c.batch && s.outbox[n].at <= t) n++;
  if (!n || s.brokerDown) return;
  fly(s, "db", "relay", t, t + HOP_MS);
  const crash = s.relayCrashNext || ctx.rng.chance(c.relayCrashPct / 100);
  // Mid-publish: the first k rows reach the broker, none get marked, so all n are read again after restart.
  const k = crash ? ctx.rng.int(1, n) : n;
  for (let i = 0; i < k; i++) {
    const row = s.outbox[i];
    const at = t + HOP_MS + PUB_MS * (0.8 + 0.6 * ctx.rng.next());
    if (i < 5) fly(s, "relay", "broker", t + HOP_MS, at);
    if (row.sent) { s.duplicates++; ctx.metrics.inc("dup"); } else ctx.metrics.observe("delay", at - row.at);
    row.sent = true;
    publish(s, ctx, row.id, at);
  }
  if (crash) {
    s.relayCrashNext = false;
    s.relayCrashes++;
    s.relayUpAt = t + RESTART_MS;
    return fail(s, ctx, { t, kind: "relay", id: s.outbox[0].id, n: k }, `Relay crashed after publishing ${k} of ${n} rows, before marking them: they will be published again`);
  }
  s.outbox.splice(0, n);
}

function consume(s: OutboxState, ctx: TickContext<OutboxConfig>, id: number) {
  if (s.processed.has(id)) {
    if (ctx.config.dedupe) { s.deduped++; return; }
    s.doubleProcessed++;
    ctx.log("error", `Consumer processed OrderPlaced #${id} twice (second email, stock reserved twice)`);
  }
  s.processed.add(id);
  s.consumed++;
}

export const outboxModel: SimModel<OutboxConfig, OutboxState> = {
  init(c, rng) {
    return {
      t: 0, nextOrder: rng.exponential(c.orderRate) * 1000, nextPoll: c.pollMs, relayUpAt: 0, relayCrashNext: false, brokerDown: false,
      outbox: [], deliveries: [], flights: [], processed: new Set(), lastFail: null,
      placed: 0, committed: 0, failed: 0, missing: 0, phantom: 0,
      published: 0, duplicates: 0, deduped: 0, doubleProcessed: 0, consumed: 0, relayCrashes: 0, minPoll: c.pollMs,
    };
  },

  tick(s, ctx) {
    const c = ctx.config;
    const t = (s.t = ctx.t);
    s.minPoll = Math.min(s.minPoll, c.pollMs);
    const capped = () => c.maxOrders > 0 && s.placed >= c.maxOrders;
    // A capped run must not bank arrivals that burst out when the cap is raised.
    if (capped()) s.nextOrder = Math.max(s.nextOrder, t);
    while (s.nextOrder <= t && !capped()) { const t0 = s.nextOrder; s.nextOrder += ctx.rng.exponential(c.orderRate) * 1000; order(s, ctx, t0); }

    if (t >= s.nextPoll) {
      s.nextPoll = t + c.pollMs;
      if (t >= s.relayUpAt) poll(s, ctx, t);
    }

    if (s.deliveries.some((d) => d.at <= t)) {
      const due = s.deliveries.filter((d) => d.at <= t).sort((a, b) => a.at - b.at);
      s.deliveries = s.deliveries.filter((d) => d.at > t);
      for (const d of due) consume(s, ctx, d.id);
    }
    if (s.flights.length && s.flights[0].at < t - 200) s.flights = s.flights.filter((f) => f.at >= t - 200);
    return s;
  },

  actions: {},

  faults: [
    { id: "relay-crash", label: "Crash the relay mid-publish", description: "On its next poll the relay publishes part of its batch, then dies before marking any row published. After a restart it reads the same rows and publishes them again. Outbox mode only.", apply: (s) => { s.relayCrashNext = true; return s; }, revert: (s) => s },
    { id: "broker-down", label: "Broker unreachable", description: "Publishes fail. Commit-then-publish loses events; publish-then-commit returns errors; the outbox just fills up and drains when the broker returns.", apply: (s) => { s.brokerDown = true; return s; }, revert: (s) => { s.brokerDown = false; return s; } },
  ],

  metrics(s, reg) {
    const p = reg.histogram("delay")?.percentiles() ?? { p50: 0, p95: 0, p99: 0 };
    return {
      inconsistencies: inconsistencies(s), missing: s.missing, phantom: s.phantom,
      duplicates: s.duplicates, deduped: s.deduped, doubleProcessed: s.doubleProcessed,
      p50: p.p50, p99: p.p99, backlog: s.outbox.length,
      placed: s.placed, committed: s.committed, failed: s.failed, relayCrashes: s.relayCrashes,
    };
  },
};
