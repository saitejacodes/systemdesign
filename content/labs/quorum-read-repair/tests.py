from itertools import combinations, permutations


def _store(m, n, w, r, down=()):
    s = m.QuorumStore(n, w, r)
    for i in down:
        s.set_down(i)
    return s


@test("an impossible configuration is rejected", input="QuorumStore(3, 4, 2) and QuorumStore(3, 2, 0)")
def _(m):
    def bad():
        try:
            m.QuorumStore(3, 2, 0)
        except ValueError:
            m.QuorumStore(3, 4, 2)
    return bad, raises(ValueError)


@test("overlaps() is true exactly when R + W > N", input="(3,2,2) (3,3,1) (3,1,1) (5,3,3) (5,2,3)")
def _(m):
    cfgs = [(3, 2, 2), (3, 3, 1), (3, 1, 1), (5, 3, 3), (5, 2, 3)]
    return [m.QuorumStore(*c).overlaps() for c in cfgs], [True, True, False, True, False]


@test("write then read returns the newest (version, value)", input="(3,2,2): write v1, write v2, read")
def _(m):
    s = _store(m, 3, 2, 2)
    s.write("k", "a", 1)
    acks = s.write("k", "b", 2)
    return [acks, s.read("k")], [3, (2, "b")]


@test("reading a key nobody has returns None", input="(3,2,2): read('missing')")
def _(m):
    return _store(m, 3, 2, 2).read("missing"), None


@test("a write with fewer than W replicas up raises", input="(3,2,2), replicas 1 and 2 down: write")
def _(m):
    s = _store(m, 3, 2, 2, down=(1, 2))
    return (lambda: s.write("k", "a", 1)), raises(m.QuorumError)


@test("a failed write is not rolled back on the replica that took it", input="(3,2,2), 1 and 2 down: write fails; inspect replica 0")
def _(m):
    s = _store(m, 3, 2, 2, down=(1, 2))
    try:
        s.write("seat", "Maya", 1)
    except m.QuorumError:
        pass
    return [s.replica_value(0, "seat"), s.replica_value(1, "seat")], [(1, "Maya"), None]


@test("a read with fewer than R replicas up raises", input="(3,2,2), replicas 0 and 2 down: read")
def _(m):
    s = _store(m, 3, 2, 2)
    s.write("k", "a", 1)
    s.set_down(0); s.set_down(2)
    return (lambda: s.read("k")), raises(m.QuorumError)


@test("an older version arriving late does not overwrite a newer one", input="write v5 then write v3")
def _(m):
    s = _store(m, 3, 2, 2)
    s.write("k", "new", 5)
    acks = s.write("k", "old", 3)
    return [acks, s.read("k"), s.replica_value(2, "k")], [3, (5, "new"), (5, "new")]


@test("R + W > N: a read reaches the latest write even after a replica missed it", input="(3,2,2): 2 misses v2; then 0 down; read hits 1, 2")
def _(m):
    s = _store(m, 3, 2, 2)
    s.write("k", "v1", 1)
    s.set_down(2); s.write("k", "v2", 2); s.set_down(2, False)
    s.set_down(0)
    return s.read("k"), (2, "v2")


@test("every write quorum meets every read quorum for (5,3,3)", input="all 10 write sets x all 120 read orders")
def _(m):
    stale = 0
    for ws in combinations(range(5), 3):
        for order in permutations(range(5)):
            s = _store(m, 5, 3, 3)
            s.write("k", "old", 1)
            for i in set(range(5)) - set(ws):
                s.set_down(i)
            s.write("k", "new", 2)
            for i in range(5):
                s.set_down(i, False)
            if s.read("k", order=list(order)) != (2, "new"):
                stale += 1
    return stale, 0


@test("W = 1, R = 1: a read can miss an acknowledged write", input="(3,1,1): write v2 lands on 0 only; read from 1")
def _(m):
    s = _store(m, 3, 1, 1)
    s.write("k", "v1", 1)
    s.set_down(1); s.set_down(2)
    acks = s.write("k", "v2", 2)
    s.set_down(1, False); s.set_down(2, False)
    return [acks, s.read("k", order=[1, 0, 2])], [1, (1, "v1")]


@test("read repair updates the stale replica it contacted", input="(3,2,2): 2 misses v2; read order [2, 0]")
def _(m):
    s = _store(m, 3, 2, 2)
    s.write("k", "v1", 1)
    s.set_down(2); s.write("k", "v2", 2); s.set_down(2, False)
    before = s.replica_value(2, "k")
    got = s.read("k", order=[2, 0, 1])
    return [before, got, s.replica_value(2, "k")], [(1, "v1"), (2, "v2"), (2, "v2")]


@test("read repair does not touch replicas outside the read quorum", input="(3,2,2): 2 misses v2; read order [0, 1]")
def _(m):
    s = _store(m, 3, 2, 2)
    s.write("k", "v1", 1)
    s.set_down(2); s.write("k", "v2", 2); s.set_down(2, False)
    s.read("k", order=[0, 1, 2])
    return s.replica_value(2, "k"), (1, "v1")


@test("a replica missing the key entirely is repaired too", input="(3,2,2): 1 down for the only write; read order [1, 0]")
def _(m):
    s = _store(m, 3, 2, 2, down=(1,))
    s.write("k", "v1", 7)
    s.set_down(1, False)
    s.read("k", order=[1, 0, 2])
    return s.replica_value(1, "k"), (7, "v1")
