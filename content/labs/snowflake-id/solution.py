TWITTER_EPOCH = 1288834974657  # 2010-11-04T01:42:54.657Z, the epoch in Twitter's Snowflake

TIMESTAMP_BITS, WORKER_BITS, SEQUENCE_BITS = 41, 10, 12
MAX_WORKER = (1 << WORKER_BITS) - 1      # 1023
MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1  # 4095
WORKER_SHIFT = SEQUENCE_BITS             # 12
TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS  # 22


class ClockMovedBackwardsError(Exception):
    pass


class Snowflake:
    def __init__(self, worker_id: int, now, epoch: int = TWITTER_EPOCH):
        if not 0 <= worker_id <= MAX_WORKER:
            raise ValueError(f"worker_id must be 0..{MAX_WORKER}")
        self.worker_id, self.now, self.epoch = worker_id, now, epoch
        self.last_ts = -1
        self.sequence = 0

    def next_id(self) -> int:
        ts = self.now()
        if ts < self.last_ts:
            # Trusting the clock here could re-issue an ID we already handed out.
            raise ClockMovedBackwardsError(f"clock moved back {self.last_ts - ts} ms")
        if ts == self.last_ts:
            self.sequence = (self.sequence + 1) & MAX_SEQUENCE
            if self.sequence == 0:
                # 4,096 IDs used this millisecond: spin until the clock moves on.
                while ts <= self.last_ts:
                    ts = self.now()
        else:
            self.sequence = 0
        delta = ts - self.epoch
        if not 0 <= delta < (1 << TIMESTAMP_BITS):
            raise ValueError("timestamp outside the 41-bit range of this epoch")
        self.last_ts = ts
        return (delta << TIMESTAMP_SHIFT) | (self.worker_id << WORKER_SHIFT) | self.sequence


def parse(id_: int, epoch: int = TWITTER_EPOCH) -> dict:
    return {
        "timestamp": (id_ >> TIMESTAMP_SHIFT) + epoch,
        "worker_id": (id_ >> WORKER_SHIFT) & MAX_WORKER,
        "sequence": id_ & MAX_SEQUENCE,
    }
