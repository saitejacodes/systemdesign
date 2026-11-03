class TokenBucket:
    """Holds up to `capacity` tokens and gains `refill_rate` tokens per second, computed lazily."""

    def __init__(self, capacity, refill_rate, now):
        # TODO: raise ValueError if capacity <= 0 or refill_rate < 0
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.now = now           # a zero-argument callable returning seconds (float)
        # TODO: start full, and remember when you last refilled

    def _refill(self):
        # TODO: tokens = min(capacity, tokens + elapsed * refill_rate)
        # TODO: if the clock did not move forward, add nothing and keep the later timestamp
        pass

    def allow(self, cost=1) -> bool:
        # TODO: raise ValueError for cost <= 0; refill; take `cost` tokens if there are enough
        return True

    def tokens(self) -> float:
        # TODO: refill, then report the current (possibly fractional) token count
        return 0.0
