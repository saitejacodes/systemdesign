def _blocks(n, prefix="block-"):
    return [f"{prefix}{i}" for i in range(n)]


@test("fnv1a64 matches the published FNV-1a 64-bit test vectors", input="fnv1a64(''), fnv1a64('a'), fnv1a64('foobar')")
def _(m):
    return [m.fnv1a64(""), m.fnv1a64("a"), m.fnv1a64("foobar")], ["cbf29ce484222325", "af63dc4c8601ec8c", "85944171f73967e8"]


@test("one leaf: the root is the leaf hash; two leaves: the root is their node hash", input="MerkleTree(['only']), MerkleTree(['a', 'b'])")
def _(m):
    one, two = m.MerkleTree(["only"]), m.MerkleTree(["a", "b"])
    return [one.root() == m.fnv1a64("\x00only"), two.root() == m.node_hash(m.leaf_hash("a"), m.leaf_hash("b")), two.root()], [True, True, "4ed018693fe30ca0"]


@test("an odd last node is promoted, so [a, b, c] and [a, b, c, c] differ", input="MerkleTree(list('abc')) vs MerkleTree(list('abcc'))")
def _(m):
    t = m.MerkleTree(["a", "b", "c"])
    expected = m.node_hash(m.node_hash(m.leaf_hash("a"), m.leaf_hash("b")), m.leaf_hash("c"))
    return [t.root(), t.root() == expected, t.root() == m.MerkleTree(["a", "b", "c", "c"]).root()], ["57c9daf1a831262e", True, False]


@test("changing or reordering any leaf changes the root", input="8 blocks: edit each one in turn, then swap 0 and 1")
def _(m):
    base = _blocks(8)
    r = m.MerkleTree(base).root()
    changed = [m.MerkleTree(base[:i] + [base[i] + "x"] + base[i + 1:]).root() != r for i in range(8)]
    swapped = m.MerkleTree([base[1], base[0]] + base[2:]).root() != r
    return [all(changed), swapped], [True, True]


@test("every leaf's proof verifies, for trees of 1 to 9 leaves", input="for n in 1..9, for i in 0..n-1: verify(leaf i, proof(i), root)")
def _(m):
    bad = 0
    for n in range(1, 10):
        t, xs = m.MerkleTree(_blocks(n)), _blocks(n)
        bad += sum(not m.verify(xs[i], t.proof(i), t.root()) for i in range(n))
    return bad, 0


@test("proof shape: one sibling per level, none where a node was promoted", input="8 leaves proof(5); 5 leaves proof(4); 1 leaf proof(0)")
def _(m):
    p8 = m.MerkleTree(_blocks(8, "b")).proof(5)
    p5 = m.MerkleTree(_blocks(5, "b")).proof(4)
    return [[s for s, _ in p8], [s for s, _ in p5], len(m.MerkleTree(["x"]).proof(0))], [["L", "R", "L"], ["L"], 0]


@test("a wrong leaf, a tampered proof or a wrong root fails verification", input="8 blocks, leaf 3")
def _(m):
    xs = _blocks(8)
    t = m.MerkleTree(xs)
    p = t.proof(3)
    forged = [(s, h) for s, h in p]
    forged[1] = (forged[1][0], m.fnv1a64("forged"))
    flipped = [("R" if s == "L" else "L", h) for s, h in p]
    return [m.verify(xs[3], p, t.root()), m.verify("block-x", p, t.root()), m.verify(xs[3], forged, t.root()),
            m.verify(xs[3], flipped, t.root()), m.verify(xs[3], p, m.fnv1a64("other"))], [True, False, False, False, False]


@test("identical trees: diff is empty after comparing only the roots", input="diff of two trees over the same 64 blocks")
def _(m):
    a, b = m.MerkleTree(_blocks(64)), m.MerkleTree(_blocks(64))
    return [a.diff(b), a.compared], [[], 1]


@test("one changed leaf among 8 is found with 1 + 2 * log2(8) comparisons", input="8 blocks, block 5 edited")
def _(m):
    xs = _blocks(8)
    ys = xs[:5] + ["changed"] + xs[6:]
    a = m.MerkleTree(xs)
    return [a.diff(m.MerkleTree(ys)), a.compared], [[5], 7]


@test("diff finds every changed leaf and skips matching subtrees", input="1024 blocks, blocks 3, 500 and 1023 edited")
def _(m):
    xs = _blocks(1024)
    ys = list(xs)
    for i in (3, 500, 1023):
        ys[i] += "!"
    a = m.MerkleTree(xs)
    got = a.diff(m.MerkleTree(ys))
    return [got, a.compared <= 1 + 2 * 10 * 3], [[3, 500, 1023], True]


@test("diff reaches a change in a promoted (odd) leaf", input="5 blocks, block 4 edited")
def _(m):
    xs = _blocks(5)
    return m.MerkleTree(xs).diff(m.MerkleTree(xs[:4] + ["changed"])), [4]


@test("diff of trees with different leaf counts raises", input="MerkleTree(4 blocks).diff(MerkleTree(5 blocks))")
def _(m):
    a, b = m.MerkleTree(_blocks(4)), m.MerkleTree(_blocks(5))
    return (lambda: a.diff(b)), raises(ValueError)


@test("a tree with no leaves raises", input="MerkleTree([])")
def _(m):
    return (lambda: m.MerkleTree([])), raises(ValueError)


@test("a proof for a leaf that does not exist raises", input="MerkleTree(4 blocks).proof(4)")
def _(m):
    t = m.MerkleTree(_blocks(4))
    return (lambda: t.proof(4)), raises(IndexError)
