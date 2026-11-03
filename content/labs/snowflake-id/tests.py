E = 1288834974657  # Twitter's epoch (the default)


def clock(*values):
    """A fake clock that returns each value in turn, then repeats the last one."""
    vals, i = list(values), [0]

    def now():
        v = vals[min(i[0], len(vals) - 1)]
        i[0] += 1
        return v
    return now


@test("bit layout: timestamp << 22 | worker << 12 | sequence", input="worker 1, clock = epoch + 1 ms")
def _(m):
    return m.Snowflake(1, clock(E + 1)).next_id(), (1 << 22) | (1 << 12)


@test("parse recovers timestamp, worker and sequence", input="worker 513, clock = epoch + 123456789")
def _(m):
    g = m.Snowflake(513, clock(E + 123456789))
    return m.parse(g.next_id()), {"timestamp": E + 123456789, "worker_id": 513, "sequence": 0}


@test("IDs in the same millisecond bump the sequence", input="3 IDs, clock fixed at epoch + 50")
def _(m):
    g = m.Snowflake(7, clock(E + 50))
    ids = [g.next_id() for _ in range(3)]
    return [[m.parse(i)["sequence"] for i in ids], ids[2] - ids[0]], [[0, 1, 2], 2]


@test("a new millisecond resets the sequence to 0", input="clock: epoch+50, +50, +51")
def _(m):
    g = m.Snowflake(7, clock(E + 50, E + 50, E + 51))
    ids = [g.next_id() for _ in range(3)]
    return [(m.parse(i)["timestamp"] - E, m.parse(i)["sequence"]) for i in ids], [(50, 0), (50, 1), (51, 0)]


@test("10,000 IDs are unique and strictly increasing", input="clock advances 1 ms every 3 reads")
def _(m):
    reads = [0]

    def now():
        reads[0] += 1
        return E + reads[0] // 3
    g = m.Snowflake(42, now)
    ids = [g.next_id() for _ in range(10_000)]
    return all(a < b for a, b in zip(ids, ids[1:])), True


@test("sequence overflow waits for the next millisecond", input="clock stuck at T for 5,000 reads, then T+1; 4,097 IDs")
def _(m):
    reads, T = [0], E + 1000

    def now():
        reads[0] += 1
        return T if reads[0] <= 5000 else T + 1
    g = m.Snowflake(3, now)
    ids = [g.next_id() for _ in range(4097)]
    increasing = all(a < b for a, b in zip(ids, ids[1:]))
    return [m.parse(ids[4095]), m.parse(ids[4096]), increasing], [
        {"timestamp": T, "worker_id": 3, "sequence": 4095},
        {"timestamp": T + 1, "worker_id": 3, "sequence": 0},
        True,
    ]


@test("a clock that moves backwards raises ClockMovedBackwardsError", input="clock: epoch+100, then epoch+99")
def _(m):
    g = m.Snowflake(1, clock(E + 100, E + 99))
    g.next_id()
    return (lambda: g.next_id()), raises(m.ClockMovedBackwardsError)


@test("after the clock catches up, IDs continue without a duplicate", input="clock: +100, +95 (raises), +100, +101")
def _(m):
    g = m.Snowflake(1, clock(E + 100, E + 95, E + 100, E + 101))
    first = g.next_id()
    try:
        g.next_id()
        raised = False
    except m.ClockMovedBackwardsError:
        raised = True
    later = [g.next_id(), g.next_id()]
    return [raised, [(m.parse(i)["timestamp"] - E, m.parse(i)["sequence"]) for i in [first] + later]], [
        True, [(100, 0), (100, 1), (101, 0)]]


@test("worker IDs outside 0..1023 are rejected", input="Snowflake(1024, ...)")
def _(m):
    return (lambda: m.Snowflake(1024, clock(E))), raises(ValueError)


@test("two workers in the same millisecond never collide", input="workers 0 and 1, same clock reading")
def _(m):
    a, b = m.Snowflake(0, clock(E + 9)), m.Snowflake(1, clock(E + 9))
    ia, ib = a.next_id(), b.next_id()
    return [ia != ib, ib - ia], [True, 1 << 12]


@test("late timestamps give IDs above 2^53 that still round-trip", input="clock = epoch + 2^40, worker 1023")
def _(m):
    g = m.Snowflake(1023, clock(E + 2 ** 40))
    i = g.next_id()
    return [i > 2 ** 53, m.parse(i)], [True, {"timestamp": E + 2 ** 40, "worker_id": 1023, "sequence": 0}]


@test("a custom epoch shifts the timestamp field", input="Discord's epoch 1420070400000 (2015-01-01), clock = epoch + 1000")
def _(m):
    D = 1420070400000
    i = m.Snowflake(0, clock(D + 1000), epoch=D).next_id()
    return [i, m.parse(i, D)["timestamp"]], [1000 << 22, D + 1000]


@test("a clock before the epoch is rejected", input="clock = epoch - 1")
def _(m):
    g = m.Snowflake(0, clock(E - 1))
    return (lambda: g.next_id()), raises(ValueError)
