class Clock:
    def __init__(self, t=0.0):
        self.t = t

    def __call__(self):
        return self.t


def _bucket(m, capacity, rate, t=0.0):
    c = Clock(t)
    return m.LeakyBucket(capacity, rate, c), c


@test("an invalid capacity or leak rate is rejected", input="LeakyBucket(0, 1, now), then LeakyBucket(1, 0, now)")
def _(m):
    def bad():
        try:
            m.LeakyBucket(0, 1, Clock())
        except ValueError:
            m.LeakyBucket(1, 0, Clock())
    return bad, raises(ValueError)


@test("a burst fills the bucket, then overflow is dropped", input="cap 3, rate 1/s: 5 offers at t = 0")
def _(m):
    b, _ = _bucket(m, 3, 1)
    return [[b.offer(i) for i in range(5)], b.size()], [[True, True, True, False, False], 3]


@test("no burst comes out: departures are spaced 1 / rate apart", input="cap 3, rate 2/s: offer a, b, c at t = 0; drain at t = 10")
def _(m):
    b, c = _bucket(m, 3, 2)
    for r in "abc":
        b.offer(r)
    c.t = 10
    return b.drain(), [(0.5, "a"), (1.0, "b"), (1.5, "c")]


@test("the queue drains at a steady rate", input="cap 3, rate 2/s, 3 queued at t = 0: size at t = 0.25, 0.5, 1.0, 1.5")
def _(m):
    b, c = _bucket(m, 3, 2)
    for r in "abc":
        b.offer(r)
    sizes = []
    for t in (0.25, 0.5, 1.0, 1.5):
        c.t = t
        sizes.append(b.size())
    return sizes, [3, 2, 1, 0]


@test("once one request leaks out there is room for exactly one more", input="cap 2, rate 1/s: a, b at t = 0; c at t = 0.5; c at t = 1")
def _(m):
    b, c = _bucket(m, 2, 1)
    got = [b.offer("a"), b.offer("b")]
    c.t = 0.5; got.append(b.offer("c"))
    c.t = 1.0; got += [b.offer("c"), b.offer("d")]
    c.t = 10
    return [got, [t for t, _ in b.drain()]], [[True, True, False, True, False], [1.0, 2.0, 3.0]]


@test("an idle period empties the bucket and it accepts a full burst again", input="cap 3, rate 1/s: 4 offers at t = 0, 4 more at t = 10")
def _(m):
    b, c = _bucket(m, 3, 1)
    first = [b.offer(i) for i in range(4)]
    c.t = 10
    empty = b.size()
    second = [b.offer(i) for i in range(4, 8)]
    return [first, empty, second], [[True, True, True, False], 0, [True, True, True, False]]


@test("a request into an idle bucket leaves one interval after it arrives", input="cap 2, rate 4/s: offer x at t = 5; drain at t = 6")
def _(m):
    b, c = _bucket(m, 2, 4, t=5.0)
    b.offer("x")
    c.t = 6
    return b.drain(), [(5.25, "x")]


@test("arrivals exactly at the leak rate are never dropped, even with capacity 1", input="cap 1, rate 2/s: 100 offers, one every 0.5 s")
def _(m):
    b, c = _bucket(m, 1, 2)
    ok = 0
    for i in range(100):
        c.t = i * 0.5
        ok += b.offer(i)
    return ok, 100


@test("arrivals 4x faster than the rate: accepted = drained so far + capacity", input="cap 2, rate 1/s: 40 offers, one every 0.25 s; drain at t = 100")
def _(m):
    b, c = _bucket(m, 2, 1)
    ok = 0
    for i in range(40):
        c.t = i * 0.25
        ok += b.offer(i)
    c.t = 100
    times = [t for t, _ in b.drain()]
    return [ok, times], [11, [float(k) for k in range(1, 12)]]


@test("drain returns each request once, in arrival order", input="cap 4, rate 1/s: offer 1..4; drain at t = 2.5 and again")
def _(m):
    b, c = _bucket(m, 4, 1)
    for r in (1, 2, 3, 4):
        b.offer(r)
    c.t = 2.5
    first = [r for _, r in b.drain()]
    return [first, b.drain(), b.size()], [[1, 2], [], 2]


@test("a clock stepping backwards neither leaks nor crashes", input="cap 2, rate 1/s: offer a at t = 5; clock goes to t = 1; then t = 6.5")
def _(m):
    b, c = _bucket(m, 2, 1, t=5.0)
    b.offer("a")
    c.t = 1.0
    during = [b.size(), b.drain(), b.offer("b")]
    c.t = 6.5
    return [during, b.drain()], [[1, [], True], [(6.0, "a")]]


@test("capacity 1 holds a single request", input="cap 1, rate 1/s: 2 offers at t = 0")
def _(m):
    b, _ = _bucket(m, 1, 1)
    return [b.offer("a"), b.offer("b"), b.size()], [True, False, 1]


@test("100,000 offers at twice the rate stay fast", input="cap 100, rate 1024/s, one offer every 1/2048 s")
def _(m):
    b, c = _bucket(m, 100, 1024)
    ok = 0
    for i in range(100_000):
        c.t = i / 2048
        ok += b.offer(i)
    return [ok, b.size()], [50_099, 100]
