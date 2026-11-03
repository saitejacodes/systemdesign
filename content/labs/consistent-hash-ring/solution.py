import bisect

FNV_OFFSET = 0x811C9DC5   # 2166136261
FNV_PRIME = 0x01000193    # 16777619


def fnv1a32(data: str, seed: int = FNV_OFFSET) -> int:
    """FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32."""
    h = seed
    for b in data.encode("utf-8"):
        h = ((h ^ b) * FNV_PRIME) & 0xFFFFFFFF
    return h


def fmix32(h: int) -> int:
    """MurmurHash3's 32-bit finalizer: spreads FNV's weak low-bit differences across all 32 bits."""
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h


def hash32(s: str) -> int:
    """Ring position of a node label or key: an integer in [0, 2^32)."""
    return fmix32(fnv1a32(s))


class HashRing:
    def __init__(self, vnodes: int = 100):
        if vnodes < 1:
            raise ValueError("vnodes must be >= 1")
        self.vnodes = vnodes
        self._points = []     # sorted list of (position, node); ties broken by node name
        self._hashes = []     # positions only, parallel to _points, for bisect
        self._nodes = set()

    def add_node(self, node: str) -> None:
        if node in self._nodes:
            return            # already on the ring: adding again must not double its vnodes
        self._nodes.add(node)
        for i in range(self.vnodes):
            p = (hash32(f"{node}#{i}"), node)
            j = bisect.bisect_left(self._points, p)
            self._points.insert(j, p)
            self._hashes.insert(j, p[0])

    def remove_node(self, node: str) -> None:
        if node not in self._nodes:
            raise KeyError(node)
        self._nodes.remove(node)
        self._points = [p for p in self._points if p[1] != node]
        self._hashes = [p[0] for p in self._points]

    def get_node(self, key: str) -> str:
        if not self._points:
            raise LookupError("the ring is empty")
        # First point clockwise at or after the key's position; past the last point, wrap to 0.
        i = bisect.bisect_left(self._hashes, hash32(key))
        return self._points[i % len(self._points)][1]

    def nodes(self) -> list:
        return sorted(self._nodes)
