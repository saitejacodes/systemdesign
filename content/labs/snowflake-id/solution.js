const TWITTER_EPOCH = 1288834974657; // 2010-11-04T01:42:54.657Z, the epoch in Twitter's Snowflake

// IDs use 63 bits, far past Number.MAX_SAFE_INTEGER (2^53 - 1), so all bit work is BigInt.
const TIMESTAMP_BITS = 41n, WORKER_BITS = 10n, SEQUENCE_BITS = 12n;
const MAX_WORKER = 1023, MAX_SEQUENCE = 4095;
const WORKER_SHIFT = SEQUENCE_BITS;                  // 12n
const TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS; // 22n

class ClockMovedBackwardsError extends Error {
  constructor(message) { super(message); this.name = "ClockMovedBackwardsError"; }
}

class Snowflake {
  constructor(workerId, now, epoch = TWITTER_EPOCH) {
    if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER) throw new RangeError(`workerId must be 0..${MAX_WORKER}`);
    this.workerId = workerId; this.now = now; this.epoch = epoch;
    this.lastTs = -1;
    this.sequence = 0;
  }

  nextId() {
    let ts = this.now();
    if (ts < this.lastTs) {
      // Trusting the clock here could re-issue an ID we already handed out.
      throw new ClockMovedBackwardsError(`clock moved back ${this.lastTs - ts} ms`);
    }
    if (ts === this.lastTs) {
      this.sequence = (this.sequence + 1) & MAX_SEQUENCE;
      if (this.sequence === 0) {
        // 4,096 IDs used this millisecond: spin until the clock moves on.
        while (ts <= this.lastTs) ts = this.now();
      }
    } else {
      this.sequence = 0;
    }
    const delta = BigInt(ts - this.epoch);
    if (delta < 0n || delta >= 1n << TIMESTAMP_BITS) throw new RangeError("timestamp outside the 41-bit range of this epoch");
    this.lastTs = ts;
    return (delta << TIMESTAMP_SHIFT) | (BigInt(this.workerId) << WORKER_SHIFT) | BigInt(this.sequence);
  }
}

function parse(id, epoch = TWITTER_EPOCH) {
  return {
    timestamp: Number(id >> TIMESTAMP_SHIFT) + epoch,
    workerId: Number((id >> WORKER_SHIFT) & BigInt(MAX_WORKER)),
    sequence: Number(id & BigInt(MAX_SEQUENCE)),
  };
}

module.exports = { Snowflake, parse, ClockMovedBackwardsError, TWITTER_EPOCH };
