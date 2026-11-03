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
        # TODO: raise ValueError unless limit > 0 and window > 0
        self.limit, self.window = limit, window
        # TODO: the current window's start, prev and curr counts, and the last timestamp seen

    def estimate(self, t) -> float:
        # TODO: raise ValueError if t is earlier than the last timestamp
        # TODO: roll windows: next window -> prev = curr; skipped one or more -> prev = 0
        # TODO: return prev * (1 - (t - current_window_start) / window) + curr
        return 0.0

    def allow(self, t) -> bool:
        # TODO: refuse (and count nothing) when estimate(t) >= limit; otherwise count it
        return True
