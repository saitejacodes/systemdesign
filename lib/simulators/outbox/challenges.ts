import type { Challenge } from "@/lib/sim/engine";
import { drained, inconsistencies, type OutboxConfig, type OutboxState } from "./model";

const ORDERS = 1000;
const DELAY_LIMIT = 200;
const MIN_POLL = 100;
const worst = (xs: { t: number; v: number }[] = [], from = 0) => xs.filter((x) => x.t >= from).reduce((m, x) => Math.max(m, x.v), 0);

export const challenges: Challenge<OutboxConfig, OutboxState>[] = [
  {
    id: "see-dual-write",
    title: "See the dual-write bug",
    description: "Use either dual-write order and make the database and the event stream disagree at least once: an order with no event, or an event for an order that doesn't exist.",
    setup: { orderRate: 20, maxOrders: 0 },
    durationMs: 20_000,
    better: "higher",
    done: (s) => inconsistencies(s) > 0,
    winCondition(_h, s) {
      const n = inconsistencies(s);
      if (!n) return { passed: false, value: 0, detail: "Everything agreed. The outbox can't diverge; switch to a dual-write mode and let a crash (or the broker) fail between the two steps." };
      const what = s.missing ? `order #${s.lastFail?.id ?? "?"} is saved but nobody downstream will ever hear about it` : "an event went out for an order the database never saved";
      return { passed: true, value: n, detail: `Diverged: ${what}. No shared transaction covers the database and the broker, so nothing can roll the other write back.` };
    },
    hint: "Commit-then-publish loses events when the service dies after COMMIT. Publish-then-commit invents orders when the commit fails after the publish. Raise the failure chance or make the broker unreachable.",
  },
  {
    id: "duplicates-harmless",
    title: "Duplicates are harmless",
    description: "Outbox mode with a relay that crashes on 20% of polls. Over 30 s the relay must publish at least one duplicate event, yet no order may be processed twice and nothing may diverge.",
    setup: { mode: "outbox", orderRate: 50, crashPct: 0, relayCrashPct: 20, maxOrders: 0 },
    durationMs: 30_000,
    winCondition(_h, s) {
      if (!s.duplicates) return { passed: false, value: 0, detail: "No duplicates were published this run, so the consumer was never tested. Let it run the full 30 s." };
      if (inconsistencies(s)) return { passed: false, value: s.doubleProcessed, detail: `${inconsistencies(s)} inconsistencies. Stay on the outbox.` };
      return s.doubleProcessed === 0
        ? { passed: true, value: 0, detail: `${s.duplicates} duplicate events published, ${s.deduped} dropped by the consumer's dedupe table. At-least-once plus idempotency behaves like exactly-once.` }
        : { passed: false, value: s.doubleProcessed, detail: `${s.doubleProcessed} orders were processed twice: the relay re-sent rows it had published but not marked, and the consumer trusted every delivery.` };
    },
    hint: "The outbox is at-least-once; you can't stop the relay from re-publishing. Make the consumer remember event ids it has handled.",
  },
  {
    id: "thousand-orders",
    title: "1,000 orders, zero inconsistencies",
    description: `Place ${ORDERS.toLocaleString("en-US")} orders at 100/s while the service fails between steps 5% of the time and the relay crashes on 10% of polls. Finish with zero inconsistencies, every saved order delivered downstream, and no order processed twice.`,
    setup: { orderRate: 100, crashPct: 5, relayCrashPct: 10, maxOrders: ORDERS },
    durationMs: 40_000,
    done: (s) => s.placed >= ORDERS && drained(s),
    winCondition(_h, s) {
      const n = inconsistencies(s);
      if (n) return { passed: false, value: n, detail: `${n} inconsistencies (${s.missing} orders with no event, ${s.phantom} events with no order). Two separate writes can't survive crashes between them.` };
      if (s.placed < ORDERS || !drained(s)) return { passed: false, value: s.outbox.length, detail: `Only ${s.placed} orders placed, ${s.outbox.length} outbox rows still unpublished. Let the relay drain.` };
      if (s.doubleProcessed) return { passed: false, value: s.doubleProcessed, detail: `Consistent, but ${s.doubleProcessed} orders were processed twice after relay crashes.` };
      return { passed: true, value: 0, detail: `${s.committed} orders saved, every one delivered once; ${s.failed} rolled back cleanly and ${s.deduped} duplicates were dropped.` };
    },
    hint: "Put the event in the same transaction as the order, and make the consumer idempotent.",
  },
  {
    id: "fast-relay",
    title: "Keep the relay fast",
    description: `Outbox at 200 orders/s. Keep publish delay p99 under ${DELAY_LIMIT} ms for the whole 20 s run (after the first 5 s) without polling more often than every ${MIN_POLL} ms.`,
    setup: { mode: "outbox", orderRate: 200, crashPct: 0, relayCrashPct: 0, maxOrders: 0 },
    durationMs: 20_000,
    winCondition(h, s) {
      const p99 = Math.round(worst(h.p99, 5_000));
      if (s.minPoll < MIN_POLL) return { passed: false, value: p99, detail: `Polled every ${s.minPoll} ms. That hammers the database; stay at ${MIN_POLL} ms or more.` };
      return p99 < DELAY_LIMIT
        ? { passed: true, value: p99, detail: `p99 ${p99} ms. Delay ≈ the poll interval plus the publish; the batch just has to keep up with arrivals.` }
        : { passed: false, value: p99, detail: `p99 reached ${p99} ms${s.outbox.length > 50 ? ` and ${s.outbox.length} rows are queued: each poll takes fewer rows than arrive` : ": rows wait up to one poll interval"}.` };
    },
    hint: "Set the poll interval and batch before you start. Batch × polls per second must beat 200/s with room for bursts.",
  },
];
