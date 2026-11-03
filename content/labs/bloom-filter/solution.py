import math

FNV_OFFSET = 0x811C9DC5   # seed for h1 (the standard FNV-1a offset basis)
FNV_PRIME = 0x01000193    # also used as the seed for h2


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
    if n < 1 or not 0 < p < 1:
        raise ValueError("need n >= 1 and 0 < p < 1")
    m = math.ceil(-n * math.log(p) / math.log(2) ** 2)
    k = max(1, round(m / n * math.log(2)))
    return m, k


class BloomFilter:
    def __init__(self, n: int, p: float):
        self.m, self.k = optimal_params(n, p)
        self.bits = bytearray((self.m + 7) // 8)

    def indexes(self, item: str) -> list:
        # Kirsch–Mitzenmacher: k positions from two hashes, g_i = (h1 + i * h2) mod m.
        h1 = fmix32(fnv1a32(item, FNV_OFFSET))
        h2 = fmix32(fnv1a32(item, FNV_PRIME))
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def add(self, item: str) -> None:
        for i in self.indexes(item):
            self.bits[i >> 3] |= 1 << (i & 7)

    def might_contain(self, item: str) -> bool:
        # One clear bit proves the item was never added; all set means "probably".
        return all(self.bits[i >> 3] & (1 << (i & 7)) for i in self.indexes(item))

    def expected_fp_rate(self, count: int) -> float:
        """(1 - e^(-k * count / m))^k: the false-positive rate after `count` insertions."""
        return (1 - math.exp(-self.k * count / self.m)) ** self.k
