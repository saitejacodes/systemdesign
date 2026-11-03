class LamportClock:
    def __init__(self):
        self.time = 0

    def tick(self) -> int:
        """A local event."""
        self.time += 1
        return self.time

    def send(self) -> int:
        """Sending is an event too; the returned timestamp travels with the message."""
        return self.tick()

    def receive(self, t: int) -> int:
        """Jump past the sender's timestamp so the receive is ordered after the send."""
        self.time = max(self.time, t) + 1
        return self.time


def _check(a, b):
    if len(a) != len(b):
        raise ValueError(f"vector lengths differ: {len(a)} vs {len(b)}")


def merge(a, b):
    """Element-wise maximum: everything either side has seen. Inputs are not modified."""
    _check(a, b)
    return [max(x, y) for x, y in zip(a, b)]


def compare(a, b) -> str:
    _check(a, b)
    a_le_b = all(x <= y for x, y in zip(a, b))
    b_le_a = all(y <= x for x, y in zip(a, b))
    if a_le_b and b_le_a:
        return "equal"
    if a_le_b:
        return "before"   # a happened before b
    if b_le_a:
        return "after"
    return "concurrent"   # each has seen something the other has not


class VectorClock:
    def __init__(self, pid: int, n: int):
        self.pid = pid
        self.v = [0] * n

    def value(self):
        return list(self.v)  # a copy, so callers can't mutate our state

    def increment(self):
        """A local event: bump only our own entry."""
        self.v[self.pid] += 1
        return self.value()

    def send(self):
        return self.increment()

    def receive(self, other):
        self.v = merge(self.v, other)
        return self.increment()
