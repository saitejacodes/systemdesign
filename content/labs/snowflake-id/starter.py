TWITTER_EPOCH = 1288834974657  # 2010-11-04T01:42:54.657Z, the epoch in Twitter's Snowflake

# Layout, high bit to low: 1 sign (always 0) | 41 timestamp | 10 worker | 12 sequence


class ClockMovedBackwardsError(Exception):
    pass


class Snowflake:
    def __init__(self, worker_id: int, now, epoch: int = TWITTER_EPOCH):
        # TODO: reject worker_id outside 0..1023 with ValueError
        self.worker_id, self.now, self.epoch = worker_id, now, epoch
        self.last_ts = -1
        self.sequence = 0

    def next_id(self) -> int:
        # TODO: read the clock once; raise ClockMovedBackwardsError if it is behind last_ts;
        # same millisecond -> bump the sequence, and on overflow spin until now() moves on;
        # new millisecond -> sequence 0. Then shift the three fields into place.
        return 0


def parse(id_: int, epoch: int = TWITTER_EPOCH) -> dict:
    # TODO: undo the shifts and masks
    return {"timestamp": 0, "worker_id": 0, "sequence": 0}
