class QuorumError(Exception):
    """Fewer than W replicas acknowledged a write, or fewer than R could answer a read."""


class QuorumStore:
    def __init__(self, n: int, w: int, r: int):
        # TODO: raise ValueError unless n >= 1, 1 <= w <= n and 1 <= r <= n
        self.n, self.w, self.r = n, w, r
        self.replicas = [{} for _ in range(n)]  # per replica: key -> (version, value)
        self.down = [False] * n

    def set_down(self, i: int, down: bool = True) -> None:
        self.down[i] = down

    def overlaps(self) -> bool:
        # TODO: is every read quorum guaranteed to share a replica with every write quorum?
        return False

    def replica_value(self, i: int, key):
        return self.replicas[i].get(key)

    def write(self, key, value, version) -> int:
        # TODO: store on every up replica (a replica keeps only the newest version),
        # count acks, raise QuorumError if acks < w, otherwise return acks
        return 0

    def read(self, key, order=None):
        # TODO: contact the first r up replicas in `order` (default 0..n-1); raise QuorumError if fewer;
        # return the newest (version, value) or None, and repair contacted replicas that were stale
        return None
