FNV_OFFSET, FNV_PRIME, MASK64 = 0xCBF29CE484222325, 0x100000001B3, (1 << 64) - 1


def fnv1a64(text: str) -> str:
    """64-bit FNV-1a over the UTF-8 bytes of text, as 16 lowercase hex digits. Fast, not cryptographic."""
    h = FNV_OFFSET
    for b in text.encode("utf-8"):
        h = ((h ^ b) * FNV_PRIME) & MASK64
    return format(h, "016x")


def leaf_hash(data: str) -> str:
    return fnv1a64("\x00" + data)  # 0x00 / 0x01 prefixes keep a leaf from posing as an inner node


def node_hash(left: str, right: str) -> str:
    return fnv1a64("\x01" + left + right)


class MerkleTree:
    def __init__(self, leaves):
        if not leaves:
            raise ValueError("a Merkle tree needs at least one leaf")
        level = [leaf_hash(x) for x in leaves]
        self.levels = [level]  # levels[0] = leaf hashes, levels[-1] = [root]
        while len(level) > 1:
            nxt = [node_hash(level[i], level[i + 1]) for i in range(0, len(level) - 1, 2)]
            if len(level) % 2:
                nxt.append(level[-1])  # odd node out is promoted unchanged, not duplicated
            self.levels.append(nxt)
            level = nxt
        self.compared = 0

    def root(self) -> str:
        return self.levels[-1][0]

    def proof(self, i: int):
        if not 0 <= i < len(self.levels[0]):
            raise IndexError("leaf index out of range")
        path = []
        for level in self.levels[:-1]:
            sib = i ^ 1
            if sib < len(level):  # a promoted node has no sibling at this level
                path.append(("L" if sib < i else "R", level[sib]))
            i //= 2
        return path

    def diff(self, other):
        if len(self.levels[0]) != len(other.levels[0]):
            raise ValueError("trees must have the same number of leaves")
        self.compared, out = 0, []

        def walk(depth, j):
            self.compared += 1
            if self.levels[depth][j] == other.levels[depth][j]:
                return  # identical subtree: skip every leaf under it
            if depth == 0:
                out.append(j)
                return
            below = self.levels[depth - 1]
            walk(depth - 1, 2 * j)
            if 2 * j + 1 < len(below):
                walk(depth - 1, 2 * j + 1)

        walk(len(self.levels) - 1, 0)
        return out


def verify(leaf: str, proof, root: str) -> bool:
    h = leaf_hash(leaf)
    for side, sib in proof:
        h = node_hash(sib, h) if side == "L" else node_hash(h, sib)
    return h == root
