class TokenBucket:
    """Holds up to `capacity` tokens and gains `refill_rate` tokens per second, computed lazily."""

    def __init__(self, capacity, refill_rate, now):
        if capacity <= 0 or refill_rate < 0:
            raise ValueError("capacity must be > 0 and refill_rate >= 0")
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.now = now
        self._tokens = float(capacity)   # a new bucket starts full
        self._last = now()

    def _refill(self):
        t = self.now()
        elapsed = t - self._last
        if elapsed <= 0:
            # Clock stood still or went backwards (NTP step, VM migration): mint nothing and keep
            # the later timestamp, so the same interval is never credited twice.
            return
        self._tokens = min(self.capacity, self._tokens + elapsed * self.refill_rate)
        self._last = t

    def allow(self, cost=1) -> bool:
        if cost <= 0:
            raise ValueError("cost must be positive")
        self._refill()
        if cost > self.capacity or self._tokens < cost:
            return False          # a refused request takes nothing
        self._tokens -= cost
        return True

    def tokens(self) -> float:
        self._refill()
        return self._tokens
