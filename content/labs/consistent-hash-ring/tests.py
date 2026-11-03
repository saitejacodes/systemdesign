KEYS = [f"key-{i}" for i in range(10_000)]
NODES = ["node-A", "node-B", "node-C"]


def ring(m, nodes, vnodes=100):
    r = m.HashRing(vnodes)
    for n in nodes:
        r.add_node(n)
    return r


@test("FNV-1a 32-bit matches the published test vectors (UTF-8 bytes)", input="fnv1a32('') / 'a' / 'foobar' / 'café'; hash32('a')")
def _(m):
    got = [m.fnv1a32(""), m.fnv1a32("a"), m.fnv1a32("foobar"), m.fnv1a32("café"), m.hash32("a")]
    return [hex(x) for x in got], ["0x811c9dc5", "0xe40c292c", "0xbf9cf968", "0xa82b5049", "0x1a80b1b3"]


@test("an empty ring raises LookupError", input="HashRing().get_node('k')")
def _(m):
    r = m.HashRing()
    return (lambda: r.get_node("k")), raises(LookupError)


@test("a single node owns every key", input="add node-A; 1,000 keys")
def _(m):
    r = ring(m, ["node-A"])
    return {r.get_node(k) for k in KEYS[:1000]}, {"node-A"}


@test("keys past the last point wrap around to the first", input="vnodes=1, nodes A, B, C (C has the lowest position); keys k1 (above all points), k9 (below all)")
def _(m):
    r = ring(m, ["A", "B", "C"], vnodes=1)
    return [r.get_node("k1"), r.get_node("k9"), r.get_node("k0")], ["C", "C", "A"]


@test("ownership does not depend on the order nodes were added", input="add A, B, C vs C, A, B")
def _(m):
    a, b = ring(m, NODES), ring(m, list(reversed(NODES)))
    return all(a.get_node(k) == b.get_node(k) for k in KEYS), True


@test("100 vnodes spread keys evenly: each of 4 nodes owns 25% +/- 8%", input="4 nodes x 100 vnodes, 10,000 keys")
def _(m):
    r = ring(m, NODES + ["node-D"])
    share = {n: 0 for n in r.nodes()}
    for k in KEYS:
        share[r.get_node(k)] += 1
    return all(0.17 <= c / len(KEYS) <= 0.33 for c in share.values()), True


@test("adding a 4th node moves about 1/4 of keys, all of them to the new node", input="3 -> 4 nodes, 100 vnodes, 10,000 keys")
def _(m):
    r = ring(m, NODES)
    before = {k: r.get_node(k) for k in KEYS}
    r.add_node("node-D")
    moved = [k for k in KEYS if r.get_node(k) != before[k]]
    frac = len(moved) / len(KEYS)
    return [0.15 <= frac <= 0.35, all(r.get_node(k) == "node-D" for k in moved)], [True, True]


@test("removing a node moves only that node's keys", input="4 -> 3 nodes (remove node-B)")
def _(m):
    r = ring(m, NODES + ["node-D"])
    before = {k: r.get_node(k) for k in KEYS}
    r.remove_node("node-B")
    moved = {k for k in KEYS if r.get_node(k) != before[k]}
    owned_by_b = {k for k in KEYS if before[k] == "node-B"}
    return [moved == owned_by_b, "node-B" in {r.get_node(k) for k in KEYS}], [True, False]


@test("for contrast, hash mod N moves about 3/4 of keys going from 3 to 4", input="hash32(key) % 3 vs % 4")
def _(m):
    frac = sum(m.hash32(k) % 3 != m.hash32(k) % 4 for k in KEYS) / len(KEYS)
    return frac, approx(0.75, 0.03)


@test("adding a node twice does not double its vnodes", input="add A, B, A; remove A once")
def _(m):
    r = ring(m, ["A", "B", "A"])
    r.remove_node("A")
    return [r.nodes(), {r.get_node(k) for k in KEYS[:500]}], [["B"], {"B"}]


@test("removing an unknown node raises KeyError", input="remove_node('ghost')")
def _(m):
    r = ring(m, NODES)
    return (lambda: r.remove_node("ghost")), raises(KeyError)


@test("removing the last node leaves an empty ring", input="add A; remove A; get_node")
def _(m):
    r = ring(m, ["A"])
    r.remove_node("A")
    return (lambda: r.get_node("k")), raises(LookupError)
