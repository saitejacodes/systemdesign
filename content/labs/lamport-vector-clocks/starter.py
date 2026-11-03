class LamportClock:
    def __init__(self):
        self.time = 0

    def tick(self) -> int:
        # TODO: a local event increments the counter; return it
        return self.time

    def send(self) -> int:
        # TODO: sending is an event: tick and return the timestamp to attach
        return self.time

    def receive(self, t: int) -> int:
        # TODO: counter = max(counter, t) + 1; return it
        return self.time


def merge(a, b):
    # TODO: element-wise max as a NEW list; ValueError if the lengths differ
    return list(a)


def compare(a, b) -> str:
    # TODO: "equal", "before" (a <= b everywhere), "after", or "concurrent";
    # ValueError if the lengths differ
    return "equal"


class VectorClock:
    def __init__(self, pid: int, n: int):
        self.pid = pid
        self.v = [0] * n

    def value(self):
        return list(self.v)

    def increment(self):
        # TODO: bump only this process's entry; return a copy
        return self.value()

    def send(self):
        # TODO: an increment whose copy travels with the message
        return self.value()

    def receive(self, other):
        # TODO: merge with the received vector, then increment; return a copy
        return self.value()
