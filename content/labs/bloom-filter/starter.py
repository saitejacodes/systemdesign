import math

FNV_OFFSET = 0x811C9DC5   # seed for h1 (the standard FNV-1a offset basis)
FNV_PRIME = 0x01000193    # also used as the seed for h2


# The hashes are given (and must stay exactly like this so Python and JavaScript agree).
def fnv1a32(data: str, seed: int = FNV_OFFSET) -> int:
    """FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32."""
    h = seed
    for b in data.encode("utf-8"):
        h = ((h ^ b) * FNV_PRIME) & 0xFFFFFFFF
    return h


def fmix32(h: int) -> int:
    """MurmurHash3's 32-bit finalizer, so every input bit affects every output bit."""
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h


def optimal_params(n: int, p: float):
    """Bits m and hash count k for n items at false-positive rate p."""
    # TODO: raise ValueError unless n >= 1 and 0 < p < 1
    # TODO: m = ceil(-n ln p / (ln 2)^2), k = max(1, round((m / n) ln 2))
    return 0, 0


class BloomFilter:
    def __init__(self, n: int, p: float):
        self.m, self.k = optimal_params(n, p)
        # TODO: a bit array of m bits (a bytearray of ceil(m / 8) bytes)

    def indexes(self, item: str) -> list:
        # TODO: h1 = fmix32(fnv1a32(item, FNV_OFFSET)), h2 = fmix32(fnv1a32(item, FNV_PRIME))
        # TODO: return [(h1 + i * h2) % m for i in 0..k-1]
        return []

    def add(self, item: str) -> None:
        # TODO: set every bit in indexes(item)
        pass

    def might_contain(self, item: str) -> bool:
        # TODO: True only if every bit in indexes(item) is set
        return False

    def expected_fp_rate(self, count: int) -> float:
        # TODO: (1 - e^(-k * count / m))^k
        return 0.0
