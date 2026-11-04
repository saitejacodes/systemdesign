import {
  AckPolicy,
  connect,
  DiscardPolicy,
  nanos,
  RetentionPolicy,
  StorageType,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from "nats";
import { config } from "./config";

/**
 * NATS JetStream as the batch job queue.
 *   - Work-queue retention: a message is deleted once a worker acks it.
 *   - File storage: messages survive a broker restart.
 *   - max_msgs + discard "new": when the stream is full, publishing FAILS instead of growing without bound.
 *     That error is our backpressure signal at the front door (POST /v1/batches answers 503).
 *   - duplicate_window: a publish with the same msgID within 2 minutes is dropped, so a retried submit does not
 *     enqueue the same item twice.
 * Delivery is at-least-once: a worker that crashes before acking gets its message redelivered after ack_wait.
 * Workers must therefore be idempotent (they are: see src/worker.ts).
 */
export const STREAM = "BATCH";
export const SUBJECT = "batch.items";
export const CONSUMER = "workers";

export interface BatchJob {
  batchId: string;
  customId: string;
  tenantId: string;
}

export interface Queue {
  nc: NatsConnection;
  js: JetStreamClient;
  jsm: JetStreamManager;
}

export async function connectQueue(name: string): Promise<Queue> {
  const nc = await connect({ servers: config.natsUrl, name, maxReconnectAttempts: -1, reconnectTimeWait: 1_000 });
  const jsm = await nc.jetstreamManager();
  try {
    await jsm.streams.info(STREAM);
  } catch {
    await jsm.streams.add({
      name: STREAM,
      subjects: [SUBJECT],
      retention: RetentionPolicy.Workqueue,
      storage: StorageType.File,
      max_msgs: config.batchQueueMax,
      discard: DiscardPolicy.New,
      duplicate_window: nanos(120_000),
    });
  }
  return { nc, js: nc.jetstream(), jsm };
}

export async function ensureConsumer(q: Queue): Promise<void> {
  const cfg = {
    durable_name: CONSUMER,
    ack_policy: AckPolicy.Explicit,
    // A message not acked within ack_wait is redelivered. Workers call working() to extend it during long jobs.
    ack_wait: nanos(60_000),
    // After 5 deliveries the item is marked failed instead of retrying forever (a poison message).
    max_deliver: 5,
    // At most this many unacked messages are out at once across all workers: the consumer-side backpressure.
    max_ack_pending: config.workerConcurrency * 2,
  };
  try {
    await q.jsm.consumers.info(STREAM, CONSUMER);
    await q.jsm.consumers.update(STREAM, CONSUMER, { ack_wait: cfg.ack_wait, max_deliver: cfg.max_deliver, max_ack_pending: cfg.max_ack_pending });
  } catch {
    await q.jsm.consumers.add(STREAM, cfg);
  }
}

export async function publishJob(q: Queue, job: BatchJob): Promise<void> {
  await q.js.publish(SUBJECT, JSON.stringify(job), { msgID: `${job.batchId}:${job.customId}` });
}

/** Messages waiting plus messages handed to a worker and not yet acked. */
export async function queueDepth(q: Queue): Promise<{ pending: number; inProgress: number }> {
  const info = await q.jsm.consumers.info(STREAM, CONSUMER);
  return { pending: info.num_pending, inProgress: info.num_ack_pending };
}
