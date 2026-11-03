FNV_OFFSET, FNV_PRIME, MASK64 = 0xCBF29CE484222325, 0x100000001B3, (1 << 64) - 1


def fnv1a64(text: str) -> str:
    """64-bit FNV-1a over the UTF-8 bytes of text, as 16 lowercase hex digits. Given: you don't need to change it."""
    h = FNV_OFFSET
    for b in text.encode("utf-8"):
        h = ((h ^ b) * FNV_PRIME) & MASK64
    return format(h, "016x")


def leaf_hash(data: str) -> str:
    return fnv1a64("\x00" + data)


def node_hash(left: str, right: str) -> str:
    return fnv1a64("\x01" + left + right)


class MerkleTree:
    def __init__(self, leaves):
        # TODO: raise ValueError on an empty list. Build self.levels bottom-up:
        # levels[0] = leaf hashes; pair neighbours with node_hash; an odd last node is promoted unchanged
        self.levels = [[leaf_hash(x) for x in leaves]]
        self.compared = 0

    def root(self) -> str:
        # TODO: the single hash on the top level
        return self.levels[0][0]

    def proof(self, i: int):
        # TODO: raise IndexError if i is out of range; walk up collecting ("L" or "R", sibling hash),
        # skipping levels where the node has no sibling
        return []

    def diff(self, other):
        # TODO: raise ValueError if the leaf counts differ; compare from the root down, descending only
        # where hashes differ; count every node pair compared in self.compared; return sorted leaf indices
        return []


def verify(leaf: str, proof, root: str) -> bool:
    # TODO: rehash from leaf_hash(leaf) up the proof and compare with root
    return False
