import random


def stub(v):
    return lambda: v


@test("exponential doubles from base", input="base 100, cap 5000, attempts 0..4")
def _(m):
    return [m.exponential(a, 100, 5000) for a in range(5)], [100, 200, 400, 800, 1600]


@test("exponential is capped, even for huge attempts", input="base 100, cap 5000, attempts 6 and 2000")
def _(m):
    return [m.exponential(6, 100, 5000), m.exponential(2000, 100, 5000)], [5000, 5000]


@test("full jitter scales the capped window by rand()", input="rand 0 / 0.5 / 1, base 100, cap 5000")
def _(m):
    return [m.full_jitter(3, 100, 5000, stub(0.0)), m.full_jitter(3, 100, 5000, stub(0.5)),
            m.full_jitter(10, 100, 5000, stub(1.0))], [0, 400, 5000]


@test("full jitter stays in [0, window) and averages half of it", input="10,000 draws, attempt 3 (window 800), seeded rand")
def _(m):
    r = random.Random(7)
    xs = [m.full_jitter(3, 100, 5000, r.random) for _ in range(10_000)]
    return [all(0 <= x < 800 for x in xs), round(sum(xs) / len(xs) / 400, 1)], [True, 1.0]


@test("equal jitter keeps at least half the window", input="10,000 draws, attempt 2 (window 400), seeded rand; rand 0 and 0.5")
def _(m):
    r = random.Random(11)
    xs = [m.equal_jitter(2, 100, 5000, r.random) for _ in range(10_000)]
    exact = [m.equal_jitter(2, 100, 5000, stub(0.0)), m.equal_jitter(2, 100, 5000, stub(0.5))]
    return [all(200 <= x < 400 for x in xs), round(sum(xs) / len(xs) / 300, 1), exact], [True, 1.0, [200, 300]]


@test("decorrelated jitter draws from [base, 3 * previous]", input="rand 0 and 0.5 from prev 100 and 1000")
def _(m):
    return [m.decorrelated_jitter(100, 100, 5000, stub(0.0)), m.decorrelated_jitter(100, 100, 5000, stub(0.5)),
            m.decorrelated_jitter(1000, 100, 5000, stub(0.5))], [100, 200, 1550]


@test("decorrelated jitter never leaves [base, cap]", input="chain of 1,000 sleeps, base 100, cap 5000, seeded rand")
def _(m):
    r, prev, ok, hit_cap = random.Random(3), 100, True, False
    for _ in range(1000):
        s = m.decorrelated_jitter(prev, 100, 5000, r.random)
        ok = ok and 100 <= s <= 5000 and s <= 3 * prev
        hit_cap = hit_cap or s == 5000
        prev = s
    return [ok, hit_cap], [True, True]


@test("retry returns the result after transient failures", input="fails twice with RetryableError, then 'ok'; rand 0.5")
def _(m):
    calls, sleeps = [0], []

    def fn():
        calls[0] += 1
        if calls[0] < 3:
            raise m.RetryableError("503")
        return "ok"
    out = m.retry(fn, 5, sleeps.append, base=100, cap=5000, rand=stub(0.5))
    return [out, calls[0], sleeps], ["ok", 3, [50, 100]]


@test("retry gives up after max_attempts and raises the last error", input="always fails, max_attempts 4")
def _(m):
    calls, sleeps = [0], []

    def fn():
        calls[0] += 1
        raise m.RetryableError(f"attempt {calls[0]}")
    try:
        m.retry(fn, 4, sleeps.append, rand=stub(1.0))
        msg = "no exception"
    except m.RetryableError as e:
        msg = str(e)
    return [msg, calls[0], sleeps], ["attempt 4", 4, [100, 200, 400]]


@test("a non-retryable error is raised at once, with no sleep", input="fn raises ValueError (like a 400)")
def _(m):
    calls, sleeps = [0], []

    def fn():
        calls[0] += 1
        raise ValueError("bad request")
    try:
        m.retry(fn, 5, sleeps.append)
        kind = "no exception"
    except ValueError:
        kind = "ValueError"
    return [kind, calls[0], sleeps], ["ValueError", 1, []]


@test("a custom retryable predicate decides what is retried", input="retryable = TimeoutError only; fails with TimeoutError once")
def _(m):
    calls, sleeps = [0], []

    def fn():
        calls[0] += 1
        if calls[0] == 1:
            raise TimeoutError()
        return calls[0]
    out = m.retry(fn, 3, sleeps.append, rand=stub(0.5), retryable=lambda e: isinstance(e, TimeoutError))
    return [out, sleeps], [2, [50]]


@test("retry sleeps grow exponentially and stop at the cap", input="always fails, 10 attempts, base 100, cap 1000, rand 1")
def _(m):
    sleeps = []

    def fn():
        raise m.RetryableError("down")
    try:
        m.retry(fn, 10, sleeps.append, base=100, cap=1000, rand=stub(1.0))
    except m.RetryableError:
        pass
    return sleeps, [100, 200, 400, 800, 1000, 1000, 1000, 1000, 1000]


@test("max_attempts below 1 is rejected", input="retry(fn, 0, sleep)")
def _(m):
    return (lambda: m.retry(lambda: 1, 0, lambda s: None)), raises(ValueError)
