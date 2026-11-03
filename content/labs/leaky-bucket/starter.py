from collections import deque


class LeakyBucket:
    """A bounded FIFO queue that forwards one request every 1 / leak_rate seconds."""

    def __init__(self, capacity: int, leak_rate: float, now):
        # TODO: raise ValueError unless capacity >= 1 and leak_rate > 0
        self.capacity, self.interval, self.now = capacity, 1.0 / leak_rate, now
        self.queue = deque()   # (departure_time, request)
        self.out = []          # requests that have leaked out but not been drained yet

    def _leak(self) -> None:
        # TODO: read the clock (never let it go backwards) and move every queued entry
        # whose departure time has passed into self.out
        pass

    def offer(self, request) -> bool:
        # TODO: leak first; drop (return False) if capacity requests are waiting;
        # otherwise schedule its departure one interval after the previous departure
        # (or after now, if the bucket has been idle) and return True
        self.queue.append((0.0, request))
        return True

    def size(self) -> int:
        # TODO: leak first, then count the waiting requests
        return len(self.queue)

    def drain(self):
        # TODO: leak first, then return and clear the (departure_time, request) pairs that have left
        return []
