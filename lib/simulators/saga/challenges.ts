import type { Challenge } from "@/lib/sim/engine";
import type { SagaConfig, SagaState } from "./model";

const ORDERS = 100;
const DOUBT_MS = 5_000;
const BLOCKED = 20;
const HOT_RATE = 150;
const HOT_P99 = 100;
const worst = (xs: { t: number; v: number }[] = [], from = 0) => xs.filter((x) => x.t >= from).reduce((m, x) => Math.max(m, x.v), 0);

export const challenges: Challenge<SagaConfig, SagaState>[] = [
  {
    id: "hundred-orders",
    title: "100 orders, zero inconsistent states",
    description: `Run ${ORDERS} orders through a saga while 10% of them fail at payment, inventory or shipping and 5% of messages are lost. Every order must settle completed or fully compensated: no money captured or stock held for an order that isn't confirmed, nothing applied twice, nothing stuck.`,
    setup: { mode: "orchestration", orderRate: 20, failPct: 10, lossPct: 5, maxOrders: ORDERS },
    durationMs: 60_000,
    done: (s) => s.placed >= ORDERS && s.open === 0,
    winCondition(_h, s) {
      if (s.txs2pc) return { passed: false, value: s.txs2pc, detail: "The payment provider is an HTTP API: it can't PREPARE and wait for your COMMIT. Use a saga." };
      const settled = s.completed + s.compensated + s.failed + s.stuck;
      if (s.inconsistent) {
        const k = s.kinds;
        return { passed: false, value: s.inconsistent, detail: `${s.inconsistent} orders settled inconsistent (paid with no order ${k.paidNoOrder}, stock leaked ${k.stockLeak}, applied twice ${k.duplicate}, over-compensated ${k.overUndo}).${k.duplicate || k.overUndo ? " Retries without idempotency keys apply steps twice." : !s.retries ? " Lost messages are never re-sent." : " Failed orders need their completed steps undone."}` };
      }
      if (s.stuck) return { passed: false, value: s.stuck, detail: `${s.stuck} orders are stuck PENDING forever: a command or event was lost and nothing re-sends it.` };
      if (s.failed) return { passed: false, value: s.failed, detail: `${s.failed} failed orders were never compensated.` };
      if (settled < ORDERS) return { passed: false, value: ORDERS - settled, detail: `Only ${settled} of ${ORDERS} orders settled; ${s.open} still in flight. Let the run finish.` };
      return { passed: true, value: 0, detail: `${s.completed} completed, ${s.compensated} compensated in reverse order, ${s.retries} retries, ${s.deduped} duplicates dropped by idempotency keys. Zero inconsistent states.` };
    },
    hint: "Compensations alone aren't enough when messages get lost: retry every step and compensation until it is acknowledged, and give each one an idempotency key so a retry after a lost reply doesn't charge or refund twice.",
  },
  {
    id: "two-pc-blocking",
    title: "Demonstrate the 2PC blocking problem",
    description: `In 2PC mode, crash the coordinator right after the participants vote YES. Keep them in doubt, holding their locks, for ${DOUBT_MS / 1000} s while at least ${BLOCKED} other orders queue behind the locked stock row.`,
    setup: { mode: "2pc", orderRate: 20, hopMs: 5, failPct: 0, lossPct: 0, maxOrders: 0 },
    durationMs: 30_000,
    better: "higher",
    done: (s) => s.maxDoubt >= DOUBT_MS && s.blockedPeak >= BLOCKED,
    winCondition(_h, s) {
      const sec = (s.maxDoubt / 1000).toFixed(1);
      if (!s.maxDoubt) return { passed: false, value: 0, detail: "No transaction was ever in doubt: every coordinator decided within milliseconds. Use “Crash the 2PC coordinator after PREPARE” (Break it menu or the canvas button) in 2PC mode." };
      if (s.maxDoubt < DOUBT_MS || s.blockedPeak < BLOCKED) return { passed: false, value: Math.round(s.maxDoubt), detail: `In doubt for ${sec} s with up to ${s.blockedPeak} orders blocked. Leave the coordinator down longer.` };
      return { passed: true, value: Math.round(s.maxDoubt), detail: `Participants held their locks for ${sec} s and ${s.blockedPeak} orders queued on the stock row. Having voted YES they may not abort, and only the coordinator knows whether it logged COMMIT.` };
    },
    hint: "A participant that voted YES has promised to commit if told to. Without the coordinator's decision it can neither commit nor abort, so it keeps its locks.",
  },
  {
    id: "hot-row",
    title: "Beat the hot row",
    description: `Every order touches one popular product's stock row. With the lesson's numbers (1 ms network hop, 2 ms fsync), take ${HOT_RATE} orders/s and keep end-to-end p99 under ${HOT_P99} ms for 20 s (after the first 5 s).`,
    setup: { mode: "2pc", orderRate: HOT_RATE, hopMs: 1, failPct: 0, lossPct: 0, maxOrders: 0 },
    durationMs: 20_000,
    winCondition(h, s) {
      const p99 = Math.round(worst(h.p99, 5_000));
      if (s.minRate < HOT_RATE) return { passed: false, value: p99, detail: `Order rate dropped to ${s.minRate}/s. Keep it at ${HOT_RATE}/s.` };
      if (s.txs2pc && s.hot.queue.length > 10) return { passed: false, value: p99, detail: `p99 ${p99} ms and ${s.hot.queue.length} transactions queued on the stock row: 2PC holds its lock for prepare + decision (~3 fsyncs + a round trip ≈ 8 ms), so at most ~125 orders/s can pass.` };
      return p99 < HOT_P99
        ? { passed: true, value: p99, detail: `p99 ${p99} ms. Each saga step commits locally, so the stock row is locked for one 2 ms fsync instead of the whole distributed commit.` }
        : { passed: false, value: p99, detail: `p99 reached ${p99} ms.` };
    },
    hint: "Count how long the stock row stays locked per order in each mode, and compare 1,000 ms divided by that with 150.",
  },
];
