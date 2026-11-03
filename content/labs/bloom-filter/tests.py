def filled(m, n, p, count, prefix="item-"):
    b = m.BloomFilter(n, p)
    for i in range(count):
        b.add(f"{prefix}{i}")
    return b


def fp_rate(b, probes=10_000):
    return sum(b.might_contain(f"probe-{i}") for i in range(probes)) / probes


@test("sizing: n=1,000, p=1% gives m=9,586 bits, k=7", input="optimal_params(1000, 0.01)")
def _(m):
    return list(m.optimal_params(1000, 0.01)), [9586, 7]


@test("sizing from the lesson: 100M IDs at 0.1% is about 14.4 bits per ID, k=10", input="optimal_params(100_000_000, 0.001)")
def _(m):
    bits, k = m.optimal_params(100_000_000, 0.001)
    return [k, round(bits / 100_000_000, 2)], [10, 14.38]


@test("k is never 0: p=0.5 gives a single hash", input="optimal_params(1000, 0.5)")
def _(m):
    return list(m.optimal_params(1000, 0.5)), [1443, 1]


@test("an empty filter contains nothing", input="BloomFilter(1000, 0.01); might_contain x 1,000")
def _(m):
    b = m.BloomFilter(1000, 0.01)
    return any(b.might_contain(f"item-{i}") for i in range(1000)), False


@test("indexes use double hashing: (h1 + i*h2) mod m", input="indexes('hello') for n=1000, p=0.01")
def _(m):
    b = m.BloomFilter(1000, 0.01)
    h1 = m.fmix32(m.fnv1a32("hello", 0x811C9DC5))
    h2 = m.fmix32(m.fnv1a32("hello", 0x01000193))
    return b.indexes("hello"), [(h1 + i * h2) % 9586 for i in range(7)]


@test("no false negatives: every added item is found", input="n=2000, p=0.01; add 2,000 items")
def _(m):
    b = filled(m, 2000, 0.01, 2000)
    return all(b.might_contain(f"item-{i}") for i in range(2000)), True


@test("the measured false-positive rate is near the target", input="n=2000, p=0.01; 10,000 non-member probes")
def _(m):
    return fp_rate(filled(m, 2000, 0.01, 2000)), approx(0.01, 0.004)


@test("at design load, the formula predicts p", input="n=1000, p=0.01; expected_fp_rate(1000)")
def _(m):
    return m.BloomFilter(1000, 0.01).expected_fp_rate(1000), approx(0.01, 0.0005)


@test("overfilled 4x, false positives explode, as the formula predicts", input="n=2000, p=0.01; add 8,000 items")
def _(m):
    b = filled(m, 2000, 0.01, 8000)
    measured, predicted = fp_rate(b), b.expected_fp_rate(8000)
    return [measured > 0.5, abs(measured - predicted) < 0.05], [True, True]


@test("non-ASCII items hash their UTF-8 bytes", input="fnv1a32('café'); add 'café'")
def _(m):
    b = m.BloomFilter(100, 0.01)
    b.add("café")
    return [hex(m.fnv1a32("café")), b.might_contain("café"), b.indexes("café") != b.indexes("cafe")], ["0xa82b5049", True, True]


@test("p = 1 is rejected with ValueError", input="BloomFilter(1000, 1.0)")
def _(m):
    return (lambda: m.BloomFilter(1000, 1.0)), raises(ValueError)


@test("n = 0 is rejected with ValueError", input="BloomFilter(0, 0.01)")
def _(m):
    return (lambda: m.BloomFilter(0, 0.01)), raises(ValueError)
