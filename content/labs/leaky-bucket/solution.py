from collections import deque


class LeakyBucket:
    """A bounded FIFO queue that forwards one request every 1 / leak_rate seconds."""

    def __init__(self, capacity: int, leak_rate: float, now):
        if capacity < 1 or leak_rate <= 0:
            raise ValueError("capacity must be >= 1 and leak_rate > 0")
        self.capacity, self.interval, self.now = capacity, 1.0 / leak_rate, now
        self.queue = deque()   # (departure_time, request), departure times strictly increasing
        self.out = []          # requests that have leaked out but not been drained yet
        self.last_departure = float("-inf")
        self.t = float("-inf")

    def _leak(self) -> None:
        self.t = max(self.t, self.now())  # a clock that steps backwards is treated as standing still
        while self.queue and self.queue[0][0] <= self.t:
            self.out.append(self.queue.popleft())

    def offer(self, request) -> bool:
        self._leak()
        if len(self.queue) >= self.capacity:
            return False  # overflow: the bucket is full, drop the request
        # Leave one interval after the previous departure, or one interval after arriving if the bucket was idle.
        departure = max(self.t, self.last_departure) + self.interval
        self.queue.append((departure, request))
        self.last_departure = departure
        return True

    def size(self) -> int:
        self._leak()
        return len(self.queue)

    def drain(self):
        self._leak()
        out, self.out = self.out, []
        return out
