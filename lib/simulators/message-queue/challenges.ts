import type { Challenge } from "@/lib/sim/engine";
import { CLEARED, totalLag, type MqConfig, type MqState } from "./model";

const quiet: Partial<MqConfig> = { failPct: 0, crashAt: 0, poisonAt: 0, backlog: 0, groups: false, keys: 20, keyDist: "uniform", idempotent: false };

export const challenges: Challenge<MqConfig, MqState>[] = [
  {
    id: "zero-loss-crash",
    title: "Crash a consumer, lose nothing",
    description: "Two consumers on 4 partitions at 200 messages/s; consumer C1 crashes at t = 10 s mid-batch. Finish 30 s with zero lost messages (committed or acked but never processed) and at least 80% of produced messages processed.",
    setup: { ...quiet, mode: "log", partitions: 4, consumers: 2, rate: 200, procMs: 3, commit: "before", maxAttempts: 5, crashAt: 10_000 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const g = s.groups[0];
      const share = s.produced ? g.processed / s.produced : 0;
      if (!s.autoCrashed) return { passed: false, value: g.lost, detail: "The crash didn't happen. Let the challenge play to the end." };
      if (s.minRate < 200 || s.produced < 4000) return { passed: false, value: g.lost, detail: "The producer rate was lowered. Keep 200 messages/s." };
      if (g.lost) return { passed: false, value: g.lost, detail: `${g.lost} messages were committed before processing, then C1 died holding them. Nobody will ever process them.` };
      if (share < 0.8) return { passed: false, value: 0, detail: `Nothing lost, but only ${Math.round(share * 100)}% of messages were processed.` };
      return { passed: true, value: 0, detail: `Zero lost. ${g.dups ? `${g.dups} messages were processed twice (replayed since the last commit): at-least-once. Turn on the idempotent consumer to make them harmless.` : g.deduped ? `${g.deduped} replays were deduplicated: effectively-once.` : "No duplicates either this time."}` };
    },
    hint: "Commit (or ack) only after processing. A crash then replays work since the last commit instead of skipping it.",
  },
  {
    id: "per-key-order",
    title: "Keep per-key order with 4 consumers",
    description: "200 messages/s over 20 keys, 4 consumers working in parallel. Over 30 s, process at least 3,000 messages with zero out-of-order deliveries for any key, and never drop below 4 consumers.",
    setup: { ...quiet, mode: "queue", partitions: 4, consumers: 4, rate: 200, procMs: 10, commit: "after", maxAttempts: 5 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const g = s.groups[0];
      if (s.minCons < 4) return { passed: false, value: g.ooo, detail: "Fewer than 4 consumers ran at some point. One consumer keeps order trivially; the point is parallelism." };
      if (g.ooo) return { passed: false, value: g.ooo, detail: `${g.ooo} messages were processed after a later message with the same key: parallel consumers raced on one key.` };
      if (g.processed < 3000) return { passed: false, value: 0, detail: `Order held, but only ${g.processed} messages were processed (need 3,000).` };
      return { passed: true, value: 0, detail: `${g.processed} messages, every key in order. Each key hashes to one partition, and one consumer reads a partition in sequence.` };
    },
    hint: "A shared queue hands neighbouring messages of one key to different consumers. Route each key to one ordered lane read by exactly one consumer.",
  },
  {
    id: "clear-lag",
    title: "Clear a 10k backlog in 30 s",
    description: `10,000 messages are already waiting, new ones arrive at 100/s and each takes ~5 ms to process. Bring group A's lag under ${CLEARED} within 30 s, without speeding up processing or slowing the producer.`,
    setup: { ...quiet, mode: "log", partitions: 4, consumers: 1, rate: 100, procMs: 5, commit: "after", maxAttempts: 5, backlog: 10_000 },
    durationMs: 30_000,
    better: "lower",
    done: (s) => Number.isFinite(s.clearedAt),
    winCondition(_h, s) {
      const sec = Number.isFinite(s.clearedAt) ? Math.round(s.clearedAt / 100) / 10 : 30;
      if (s.minProc < 5 || s.minRate < 100) return { passed: false, value: sec, detail: "Processing time or producer rate was lowered. Win with parallelism instead." };
      if (s.dlqCount > 10) return { passed: false, value: sec, detail: `${s.dlqCount} messages went to the DLQ. Clearing lag means processing it.` };
      return Number.isFinite(s.clearedAt)
        ? { passed: true, value: sec, detail: `Backlog cleared in ${sec} s. Throughput scales with consumers, up to the partition count.` }
        : { passed: false, value: sec, detail: `Lag is still ${totalLag(s)} after 30 s. One consumer does ~200/s and only gains 100/s on the producer.` };
    },
    hint: "One consumer nets ~100 messages/s here, so 10k takes 100 s. Consumers beyond the partition count sit idle.",
  },
  {
    id: "poison-dlq",
    title: "Route a poison message to the DLQ",
    description: "A message produced at t = 5 s fails every time it is processed, and attempts are unlimited. Get it into the dead-letter queue and finish the 30 s run with total lag under 300.",
    setup: { ...quiet, mode: "log", partitions: 4, consumers: 4, rate: 100, procMs: 5, commit: "after", maxAttempts: 0, poisonAt: 5_000 },
    durationMs: 30_000,
    winCondition(_h, s) {
      const lag = totalLag(s);
      if (!Number.isFinite(s.poisonDlqAt)) return { passed: false, value: lag, detail: `The poison message is still being retried. Lag is ${lag}: in log mode it blocks every message behind it in its partition.` };
      if (lag >= 300) return { passed: false, value: lag, detail: `The poison message reached the DLQ, but lag is ${lag}. The blocked partition hasn't caught up.` };
      return { passed: true, value: lag, detail: `Dead-lettered after ${((s.poisonDlqAt - s.poisonedAt) / 1000).toFixed(1)} s of retries; the partition moved on and lag is ${lag}.` };
    },
    hint: "Cap attempts: after N failures the consumer publishes the message to the DLQ and moves past its offset.",
  },
];
