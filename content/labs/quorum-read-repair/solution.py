class QuorumError(Exception):
    """Fewer than W replicas acknowledged a write, or fewer than R could answer a read."""


class QuorumStore:
    def __init__(self, n: int, w: int, r: int):
        if not (n >= 1 and 1 <= w <= n and 1 <= r <= n):
            raise ValueError("need n >= 1, 1 <= w <= n and 1 <= r <= n")
        self.n, self.w, self.r = n, w, r
        self.replicas = [{} for _ in range(n)]  # per replica: key -> (version, value)
        self.down = [False] * n

    def set_down(self, i: int, down: bool = True) -> None:
        self.down[i] = down

    def overlaps(self) -> bool:
        # Pigeonhole: a read quorum and a write quorum must share a replica iff R + W > N.
        return self.r + self.w > self.n

    def replica_value(self, i: int, key):
        return self.replicas[i].get(key)

    def _store(self, i: int, key, version, value) -> None:
        # A replica keeps whichever version is newest; an older or equal write is acknowledged but ignored.
        cur = self.replicas[i].get(key)
        if cur is None or version > cur[0]:
            self.replicas[i][key] = (version, value)

    def write(self, key, value, version) -> int:
        acks = 0
        for i in range(self.n):
            if not self.down[i]:
                self._store(i, key, version, value)
                acks += 1
        # Replicas that did accept the write keep it even if the quorum fails: there is no rollback.
        if acks < self.w:
            raise QuorumError(f"write got {acks} acks, needs {self.w}")
        return acks

    def read(self, key, order=None):
        order = range(self.n) if order is None else order
        contacted = [i for i in order if not self.down[i]][: self.r]
        if len(contacted) < self.r:
            raise QuorumError(f"read reached {len(contacted)} replicas, needs {self.r}")
        answers = [self.replicas[i].get(key) for i in contacted]
        newest = max((a for a in answers if a is not None), default=None, key=lambda a: a[0])
        if newest is None:
            return None
        # Read repair: push the newest version to every contacted replica that returned something older.
        for i, a in zip(contacted, answers):
            if a is None or a[0] < newest[0]:
                self._store(i, key, *newest)
        return newest
