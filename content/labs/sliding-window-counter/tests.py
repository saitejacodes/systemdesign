@test("allows up to the limit inside one window", input="limit 5, window 60; 6 requests at t=0")
def _(m):
    s = m.SlidingWindowCounter(5, 60)
    return [s.allow(0) for _ in range(6)], [True] * 5 + [False]


@test("lesson example: 80 previous, 30 current, 25% in -> 90, allowed", input="limit 100, window 60; 80 at t=1, 30 at t=70; estimate(75); 45 s in")
def _(m):
    s = m.SlidingWindowCounter(100, 60)
    for _ in range(80):
        s.allow(1)
    for _ in range(30):
        s.allow(70)
    e75 = s.estimate(75)
    ok = s.allow(75)
    e105 = s.estimate(105)                 # 80 * 0.25 + 31
    return [round(e75, 6), ok, round(e105, 6)], [90.0, True, 51.0]


@test("fixed window (given) lets 2x the limit through at the boundary", input="FixedWindowCounter(100, 60); 100 at t=59, 100 at t=60")
def _(m):
    f = m.FixedWindowCounter(100, 60)
    n = sum(f.allow(59) for _ in range(100)) + sum(f.allow(60) for _ in range(100))
    return n, 200


@test("sliding window holds the same boundary burst to the limit", input="SlidingWindowCounter(100, 60); 100 at t=59, 100 at t=60")
def _(m):
    s = m.SlidingWindowCounter(100, 60)
    a = sum(s.allow(59) for _ in range(100))
    b = sum(s.allow(60) for _ in range(100))
    return [a, b], [100, 0]


@test("capacity comes back as the previous window slides out", input="limit 100, window 60; 100 at t=59; 100 tries at t=90")
def _(m):
    s = m.SlidingWindowCounter(100, 60)
    for _ in range(100):
        s.allow(59)
    return sum(s.allow(90) for _ in range(100)), 50   # 100 * 0.5 + curr < 100


@test("refused requests are not counted", input="limit 2, window 10; 5 tries at t=0; estimate(0)")
def _(m):
    s = m.SlidingWindowCounter(2, 10)
    n = sum(s.allow(0) for _ in range(5))
    return [n, s.estimate(0)], [2, 2]


@test("a gap longer than one window forgets the old counts", input="limit 100, window 60; 100 at t=0; 100 tries at t=130")
def _(m):
    s = m.SlidingWindowCounter(100, 60)
    for _ in range(100):
        s.allow(0)
    return sum(s.allow(130) for _ in range(100)), 100


@test("limit 1: the previous request is weighted until it slides out", input="limit 1, window 60; allow at t=0, 30, 60, 90")
def _(m):
    s = m.SlidingWindowCounter(1, 60)
    return [s.allow(0), s.allow(30), s.allow(60), s.allow(90)], [True, False, False, True]


@test("steady traffic: the estimate tracks the exact sliding count", input="a request every 0.5 s for t=0..330; estimate(330.25) vs exact 120")
def _(m):
    s = m.SlidingWindowCounter(10_000, 60)
    for i in range(661):
        s.allow(i * 0.5)
    return s.estimate(330.25), approx(120, 1)


@test("a timestamp earlier than the last one raises ValueError", input="allow(10); allow(5)")
def _(m):
    s = m.SlidingWindowCounter(10, 60)
    s.allow(10)
    return (lambda: s.allow(5)), raises(ValueError)


@test("limit 0 is rejected with ValueError", input="SlidingWindowCounter(0, 60)")
def _(m):
    return (lambda: m.SlidingWindowCounter(0, 60)), raises(ValueError)
