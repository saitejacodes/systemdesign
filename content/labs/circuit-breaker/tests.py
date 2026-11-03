class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def boom():
    raise IOError("dependency down")


def ok():
    return "ok"


def make(m, threshold=3, cooldown=30, trials=1):
    clock = Clock()
    return m.CircuitBreaker(failure_threshold=threshold, reset_timeout=cooldown, half_open_max_calls=trials, now=clock), clock


def fail(b, n=1):
    for _ in range(n):
        try:
            b.call(boom)
        except IOError:
            pass


@test("starts closed and passes calls through", input="threshold 3; call(ok)")
def _(m):
    b, _ = make(m)
    return [b.state(), b.call(ok), b.state()], ["closed", "ok", "closed"]


@test("stays closed below the threshold", input="threshold 3; 2 failures")
def _(m):
    b, _ = make(m)
    fail(b, 2)
    return b.state(), "closed"


@test("opens after N consecutive failures", input="threshold 3; 3 failures")
def _(m):
    b, _ = make(m)
    fail(b, 3)
    return b.state(), "open"


@test("a success resets the consecutive-failure count", input="threshold 3; fail, fail, ok, fail, fail")
def _(m):
    b, _ = make(m)
    fail(b, 2); b.call(ok); fail(b, 2)
    return b.state(), "closed"


@test("the caller sees the dependency's own exception", input="call(fn raising KeyError) while closed")
def _(m):
    b, _ = make(m)

    def bad():
        raise KeyError("x")
    return (lambda: b.call(bad)), raises(KeyError)


@test("an open breaker fails fast with CircuitOpenError", input="tripped; call(fn)")
def _(m):
    b, _ = make(m)
    fail(b, 3)
    return (lambda: b.call(ok)), raises(m.CircuitOpenError)


@test("while open, the dependency is never called", input="tripped; 5 calls at t = 1..5 s")
def _(m):
    b, clock = make(m)
    fail(b, 3)
    calls = [0]

    def counted():
        calls[0] += 1
    rejected = 0
    for t in range(1, 6):
        clock.t = t
        try:
            b.call(counted)
        except m.CircuitOpenError:
            rejected += 1
    return [calls[0], rejected], [0, 5]


@test("stays open until the cooldown has fully elapsed", input="opened at t=0, cooldown 30 s; check t=29.9 and t=30")
def _(m):
    b, clock = make(m)
    fail(b, 3)
    clock.t = 29.9
    before = b.state()
    clock.t = 30
    return [before, b.state()], ["open", "half_open"]


@test("a successful trial call closes the breaker and resets the count", input="half-open; call(ok); then 2 failures")
def _(m):
    b, clock = make(m)
    fail(b, 3)
    clock.t = 30
    out = b.call(ok)
    after_ok = b.state()
    fail(b, 2)
    return [out, after_ok, b.state()], ["ok", "closed", "closed"]


@test("a failed trial call reopens and restarts the cooldown", input="half-open at t=30; trial fails; check t=59 and t=60")
def _(m):
    b, clock = make(m)
    fail(b, 3)
    clock.t = 30
    fail(b)
    reopened = b.state()
    clock.t = 59
    still = b.state()
    clock.t = 60
    return [reopened, still, b.state()], ["open", "open", "half_open"]


@test("half-open admits only half_open_max_calls trials", input="trials 2; allow_request x3 before any result")
def _(m):
    b, clock = make(m, trials=2)
    fail(b, 3)
    clock.t = 30
    b.allow_request()
    b.allow_request()
    return (lambda: b.allow_request()), raises(m.CircuitOpenError)


@test("with 2 trials, both must succeed to close", input="trials 2; success, then (a) success or (b) failure")
def _(m):
    a, ca = make(m, trials=2)
    fail(a, 3); ca.t = 30
    a.call(ok)
    mid = a.state()
    a.call(ok)
    b, cb = make(m, trials=2)
    fail(b, 3); cb.t = 30
    b.call(ok); fail(b)
    return [mid, a.state(), b.state()], ["half_open", "closed", "open"]


@test("threshold 1 trips on the first failure", input="threshold 1; one failure")
def _(m):
    b, _ = make(m, threshold=1)
    fail(b)
    return b.state(), "open"
