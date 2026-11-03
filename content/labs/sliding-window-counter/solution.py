import math


class FixedWindowCounter:
    """Given, for contrast: one counter per aligned window, reset at each boundary."""

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.start, self.count = None, 0

    def allow(self, t) -> bool:
        start = math.floor(t / self.window) * self.window
        if start != self.start:
            self.start, self.count = start, 0
        if self.count >= self.limit:
            return False
        self.count += 1
        return True


class SlidingWindowCounter:
    """Approximates a sliding window from two fixed-window counts:
    estimate = prev * (1 - elapsed / window) + curr."""

    def __init__(self, limit, window):
        if limit <= 0 or window <= 0:
            raise ValueError("limit and window must be positive")
        self.limit, self.window = limit, window
        self.curr_start = None    # start of the current aligned window
        self.prev = 0             # requests allowed in the window before it
        self.curr = 0             # requests allowed in the current window
        self.last_t = None

    def _advance(self, t):
        if self.last_t is not None and t < self.last_t:
            raise ValueError("timestamps must be non-decreasing")
        self.last_t = t
        start = math.floor(t / self.window) * self.window
        if self.curr_start is None:
            self.curr_start = start
            return
        if start == self.curr_start:
            return
        if start == self.curr_start + self.window:
            self.prev = self.curr          # rolled into the next window
        else:
            self.prev = 0                  # idle for a whole window or more: nothing overlaps
        self.curr, self.curr_start = 0, start

    def estimate(self, t) -> float:
        self._advance(t)
        elapsed = (t - self.curr_start) / self.window
        return self.prev * (1 - elapsed) + self.curr

    def allow(self, t) -> bool:
        if self.estimate(t) >= self.limit:
            return False                    # a refused request is not counted
        self.curr += 1
        return True
