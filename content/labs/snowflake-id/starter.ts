export const TWITTER_EPOCH = 1288834974657; // 2010-11-04T01:42:54.657Z, the epoch in Twitter's Snowflake

// Layout, high bit to low: 1 sign (always 0) | 41 timestamp | 10 worker | 12 sequence.
// IDs exceed Number.MAX_SAFE_INTEGER (2^53 - 1): build them with BigInt (1n, <<, |).

export interface SnowflakeParts { timestamp: number; workerId: number; sequence: number }

export class ClockMovedBackwardsError extends Error {
  constructor(message: string) { super(message); this.name = "ClockMovedBackwardsError"; }
}

export class Snowflake {
  private lastTs = -1;
  private sequence = 0;

  constructor(private workerId: number, private now: () => number, private epoch: number = TWITTER_EPOCH) {
    // TODO: reject workerId outside 0..1023 with RangeError
  }

  nextId(): bigint {
    // TODO: read the clock once; throw ClockMovedBackwardsError if it is behind lastTs;
    // same millisecond -> bump the sequence, and on overflow spin until now() moves on;
    // new millisecond -> sequence 0. Then shift the three fields into place as a BigInt.
    return 0n;
  }
}

export function parse(id: bigint, epoch: number = TWITTER_EPOCH): SnowflakeParts {
  // TODO: undo the shifts and masks (BigInt), returning plain numbers
  return { timestamp: 0, workerId: 0, sequence: 0 };
}
