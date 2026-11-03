const TWITTER_EPOCH = 1288834974657; // 2010-11-04T01:42:54.657Z, the epoch in Twitter's Snowflake

// Layout, high bit to low: 1 sign (always 0) | 41 timestamp | 10 worker | 12 sequence.
// IDs exceed Number.MAX_SAFE_INTEGER (2^53 - 1): build them with BigInt (1n, <<, |).

class ClockMovedBackwardsError extends Error {
  constructor(message) { super(message); this.name = "ClockMovedBackwardsError"; }
}

class Snowflake {
  constructor(workerId, now, epoch = TWITTER_EPOCH) {
    // TODO: reject workerId outside 0..1023 with RangeError
    this.workerId = workerId; this.now = now; this.epoch = epoch;
    this.lastTs = -1;
    this.sequence = 0;
  }

  nextId() {
    // TODO: read the clock once; throw ClockMovedBackwardsError if it is behind lastTs;
    // same millisecond -> bump the sequence, and on overflow spin until now() moves on;
    // new millisecond -> sequence 0. Then shift the three fields into place as a BigInt.
    return 0n;
  }
}

function parse(id, epoch = TWITTER_EPOCH) {
  // TODO: undo the shifts and masks (BigInt), returning plain Numbers
  return { timestamp: 0, workerId: 0, sequence: 0 };
}

module.exports = { Snowflake, parse, ClockMovedBackwardsError, TWITTER_EPOCH };
