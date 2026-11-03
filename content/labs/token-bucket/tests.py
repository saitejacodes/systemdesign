class Clock:
    """A fake clock: tests move time by setting .t (seconds)."""
    def __init__(self, t=0.0):
        self.t = t

    def __call__(self):
        return self.t


@test("a new bucket starts full: capacity requests pass, the next is refused", input="B=10, R=1; 11 requests at t=0")
def _(m):
    b = m.TokenBucket(10, 1, Clock())
    results = [b.allow() for _ in range(11)]
    return [results.count(True), results[-1]], [10, False]


@test("lesson example: burst of 15, then 2 tokens a second later", input="B=10, R=2; 15 at t=0, 3 at t=1")
def _(m):
    clock = Clock()
    b = m.TokenBucket(10, 2, clock)
    burst = sum(b.allow() for _ in range(15))
    clock.t = 1
    later = sum(b.allow() for _ in range(3))
    return [burst, later], [10, 2]


@test("refill never exceeds capacity", input="B=10, R=5; drain, idle 1000 s")
def _(m):
    clock = Clock()
    b = m.TokenBucket(10, 5, clock)
    for _ in range(10):
        b.allow()
    clock.t = 1000
    return b.tokens(), approx(10)


@test("refill is fractional", input="B=1, R=0.5; allow at t=0, 1, 2")
def _(m):
    clock = Clock()
    b = m.TokenBucket(1, 0.5, clock)
    a0 = b.allow()
    clock.t = 1
    a1, half = b.allow(), b.tokens()
    clock.t = 2
    a2 = b.allow()
    return [a0, a1, round(half, 6), a2], [True, False, 0.5, True]


@test("a weighted request takes cost tokens; a refused one takes none", input="B=10, R=0; allow(4) x3, allow(2)")
def _(m):
    b = m.TokenBucket(10, 0, Clock())
    out = [b.allow(4), b.allow(4), b.allow(4)]
    left = b.tokens()
    out.append(b.allow(2))
    return [out, round(left, 6)], [[True, True, False, True], 2.0]


@test("cost > capacity is always refused, even when full", input="B=5, R=1; idle 100 s; allow(6)")
def _(m):
    clock = Clock()
    b = m.TokenBucket(5, 1, clock)
    clock.t = 100
    return [b.allow(6), round(b.tokens(), 6)], [False, 5.0]


@test("clock going backwards mints no tokens and is not credited twice", input="B=10, R=2; drain at t=10; t=5; t=10.5")
def _(m):
    clock = Clock(10)
    b = m.TokenBucket(10, 2, clock)
    for _ in range(10):
        b.allow()
    clock.t = 5                      # NTP stepped the clock back 5 s
    back = [b.allow(), round(b.tokens(), 6)]
    clock.t = 10.5                   # only 0.5 s past the last real refill: exactly 1 token
    fwd = [b.allow(), round(b.tokens(), 6)]
    return [back, fwd], [[False, 0.0], [True, 0.0]]


@test("refill_rate 0 never refills", input="B=2, R=0; drain; idle 1e6 s")
def _(m):
    clock = Clock()
    b = m.TokenBucket(2, 0, clock)
    b.allow(); b.allow()
    clock.t = 1_000_000
    return b.allow(), False


@test("sustained rate converges to B + R*T", input="B=5, R=4; a request every 0.125 s for 10 s (81 requests)")
def _(m):
    clock = Clock()
    b = m.TokenBucket(5, 4, clock)
    allowed = 0
    for i in range(81):
        clock.t = i * 0.125
        allowed += b.allow()
    return allowed, 5 + 4 * 10


@test("tokens() only reads: it never consumes", input="B=3, R=1; tokens() twice")
def _(m):
    b = m.TokenBucket(3, 1, Clock())
    b.allow()
    return [round(b.tokens(), 6), round(b.tokens(), 6), b.allow(), b.allow(), b.allow()], [2.0, 2.0, True, True, False]


@test("allow(0) is rejected with ValueError", input="allow(0)")
def _(m):
    b = m.TokenBucket(3, 1, Clock())
    return (lambda: b.allow(0)), raises(ValueError)


@test("capacity 0 is rejected with ValueError", input="TokenBucket(0, 1, now)")
def _(m):
    return (lambda: m.TokenBucket(0, 1, Clock())), raises(ValueError)
