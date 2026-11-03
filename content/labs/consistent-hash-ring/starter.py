import bisect

FNV_OFFSET = 0x811C9DC5   # 2166136261
FNV_PRIME = 0x01000193    # 16777619


# The hash is given (and must stay exactly like this so Python and JavaScript agree).
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
        # TODO: raise ValueError if vnodes < 1
        self.vnodes = vnodes
        # TODO: a sorted list of (position, node) points, and the set of node names

    def add_node(self, node: str) -> None:
        # TODO: no-op if already present; else insert points hash32(f"{node}#{i}") for i in range(vnodes)
        pass

    def remove_node(self, node: str) -> None:
        # TODO: raise KeyError if unknown; else drop all of its points
        pass

    def get_node(self, key: str) -> str:
        # TODO: raise LookupError on an empty ring
        # TODO: binary-search the first point with position >= hash32(key); wrap past the end
        return ""

    def nodes(self) -> list:
        # TODO: the node names, sorted
        return []
