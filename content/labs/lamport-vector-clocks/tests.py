def diagram_lamport(m):
    """P1: a (send to P2), c.  P2: receive a, b (send to P3).  P3: x, receive b."""
    p1, p2, p3 = m.LamportClock(), m.LamportClock(), m.LamportClock()
    a = p1.send()
    x = p3.tick()
    r2 = p2.receive(a)
    b = p2.send()
    c = p1.tick()
    r3 = p3.receive(b)
    return {"a": a, "x": x, "r2": r2, "b": b, "c": c, "r3": r3}


def diagram_vector(m):
    p1, p2, p3 = m.VectorClock(0, 3), m.VectorClock(1, 3), m.VectorClock(2, 3)
    a = p1.send()
    x = p3.increment()
    r2 = p2.receive(a)
    b = p2.send()
    c = p1.increment()
    r3 = p3.receive(b)
    return {"a": a, "x": x, "r2": r2, "b": b, "c": c, "r3": r3}


@test("Lamport: each local event increments the counter", input="tick() x3")
def _(m):
    c = m.LamportClock()
    return [c.tick(), c.tick(), c.tick()], [1, 2, 3]


@test("Lamport: receive jumps past a sender that is ahead", input="local 0; receive(5)")
def _(m):
    return m.LamportClock().receive(5), 6


@test("Lamport: receive from a sender that is behind still advances", input="local at 10; receive(3)")
def _(m):
    c = m.LamportClock()
    for _ in range(10):
        c.tick()
    return c.receive(3), 11


@test("Lamport: three-process diagram", input="P1 a→P2, P3 x, P2 recv a, P2 b→P3, P1 c, P3 recv b")
def _(m):
    return diagram_lamport(m), {"a": 1, "x": 1, "r2": 2, "b": 3, "c": 2, "r3": 4}


@test("vector: a local event bumps only its own entry", input="VectorClock(1, 3).increment() x2")
def _(m):
    v = m.VectorClock(1, 3)
    return [v.increment(), v.increment()], [[0, 1, 0], [0, 2, 0]]


@test("vector: receive merges element-wise, then increments", input="P2 at [0,0,3,0] receives [2,5,1,0]")
def _(m):
    v = m.VectorClock(2, 4)
    for _ in range(3):
        v.increment()
    return v.receive([2, 5, 1, 0]), [2, 5, 4, 0]


@test("vector: three-process diagram", input="same diagram as the Lamport test")
def _(m):
    return diagram_vector(m), {"a": [1, 0, 0], "x": [0, 0, 1], "r2": [1, 1, 0], "b": [1, 2, 0], "c": [2, 0, 0], "r3": [1, 2, 2]}


@test("compare: before, after and equal", input="[1,0,0] vs [1,2,2]; reverse; [1,2,0] vs itself")
def _(m):
    return [m.compare([1, 0, 0], [1, 2, 2]), m.compare([1, 2, 2], [1, 0, 0]), m.compare([1, 2, 0], [1, 2, 0])], ["before", "after", "equal"]


@test("compare: neither dominates means concurrent", input="[1,1,0] vs [0,0,1]; [2,0,0] vs [1,2,2]")
def _(m):
    return [m.compare([1, 1, 0], [0, 0, 1]), m.compare([2, 0, 0], [1, 2, 2])], ["concurrent", "concurrent"]


@test("Lamport orders events that vector clocks prove concurrent", input="diagram: c (P1) vs r3 (P3); x (P3) vs c (P1)")
def _(m):
    L, V = diagram_lamport(m), diagram_vector(m)
    return [L["c"] < L["r3"], m.compare(V["c"], V["r3"]), m.compare(V["x"], V["c"]), m.compare(V["a"], V["r3"])], [
        True, "concurrent", "concurrent", "before"]


@test("merge is an element-wise max that leaves its inputs alone", input="merge([3,0,2], [1,4,2])")
def _(m):
    a, b = [3, 0, 2], [1, 4, 2]
    return [m.merge(a, b), a, b], [[3, 4, 2], [3, 0, 2], [1, 4, 2]]


@test("a sent vector is a snapshot, not a live reference", input="msg = send(); increment(); msg unchanged")
def _(m):
    v = m.VectorClock(0, 2)
    msg = v.send()
    v.increment()
    msg.append(99)
    return [msg[:2], v.value()], [[1, 0], [2, 0]]


@test("vectors of different lengths are rejected", input="compare([1,0], [1,0,0])")
def _(m):
    return (lambda: m.compare([1, 0], [1, 0, 0])), raises(ValueError)
