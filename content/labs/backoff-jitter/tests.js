// mulberry32: a tiny seeded PRNG, since Math.random cannot be seeded.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const stub = (v) => () => v;
const round1 = (x) => Math.round(x * 10) / 10;

test("exponential doubles from base", "base 100, cap 5000, attempts 0..4", (m) =>
  [[0, 1, 2, 3, 4].map((a) => m.exponential(a, 100, 5000)), [100, 200, 400, 800, 1600]]);

test("exponential is capped, even for huge attempts", "base 100, cap 5000, attempts 6 and 2000", (m) =>
  [[m.exponential(6, 100, 5000), m.exponential(2000, 100, 5000)], [5000, 5000]]);

test("full jitter scales the capped window by rand()", "rand 0 / 0.5 / 1, base 100, cap 5000", (m) =>
  [[m.fullJitter(3, 100, 5000, stub(0)), m.fullJitter(3, 100, 5000, stub(0.5)), m.fullJitter(10, 100, 5000, stub(1))], [0, 400, 5000]]);

test("full jitter stays in [0, window) and averages half of it", "10,000 draws, attempt 3 (window 800), seeded rand", (m) => {
  const r = mulberry32(7);
  const xs = Array.from({ length: 10000 }, () => m.fullJitter(3, 100, 5000, r));
  return [[xs.every((x) => x >= 0 && x < 800), round1(xs.reduce((a, b) => a + b, 0) / xs.length / 400)], [true, 1]];
});

test("equal jitter keeps at least half the window", "10,000 draws, attempt 2 (window 400), seeded rand; rand 0 and 0.5", (m) => {
  const r = mulberry32(11);
  const xs = Array.from({ length: 10000 }, () => m.equalJitter(2, 100, 5000, r));
  const exact = [m.equalJitter(2, 100, 5000, stub(0)), m.equalJitter(2, 100, 5000, stub(0.5))];
  return [[xs.every((x) => x >= 200 && x < 400), round1(xs.reduce((a, b) => a + b, 0) / xs.length / 300), exact], [true, 1, [200, 300]]];
});

test("decorrelated jitter draws from [base, 3 * previous]", "rand 0 and 0.5 from prev 100 and 1000", (m) =>
  [[m.decorrelatedJitter(100, 100, 5000, stub(0)), m.decorrelatedJitter(100, 100, 5000, stub(0.5)), m.decorrelatedJitter(1000, 100, 5000, stub(0.5))], [100, 200, 1550]]);

test("decorrelated jitter never leaves [base, cap]", "chain of 1,000 sleeps, base 100, cap 5000, seeded rand", (m) => {
  const r = mulberry32(3);
  let prev = 100, ok = true, hitCap = false;
  for (let i = 0; i < 1000; i++) {
    const s = m.decorrelatedJitter(prev, 100, 5000, r);
    ok = ok && s >= 100 && s <= 5000 && s <= 3 * prev;
    hitCap = hitCap || s === 5000;
    prev = s;
  }
  return [[ok, hitCap], [true, true]];
});

test("retry returns the result after transient failures", "fails twice with RetryableError, then 'ok'; rand 0.5", (m) => {
  let calls = 0;
  const sleeps = [];
  const out = m.retry(() => { if (++calls < 3) throw new m.RetryableError("503"); return "ok"; }, 5, (s) => sleeps.push(s), { base: 100, cap: 5000, rand: stub(0.5) });
  return [[out, calls, sleeps], ["ok", 3, [50, 100]]];
});

test("retry gives up after maxAttempts and raises the last error", "always fails, maxAttempts 4", (m) => {
  let calls = 0, msg = "no exception";
  const sleeps = [];
  try { m.retry(() => { throw new m.RetryableError(`attempt ${++calls}`); }, 4, (s) => sleeps.push(s), { rand: stub(1) }); } catch (e) { msg = e.message; }
  return [[msg, calls, sleeps], ["attempt 4", 4, [100, 200, 400]]];
});

test("a non-retryable error is raised at once, with no sleep", "fn throws TypeError (like a 400)", (m) => {
  let calls = 0, kind = "no exception";
  const sleeps = [];
  try { m.retry(() => { calls++; throw new TypeError("bad request"); }, 5, (s) => sleeps.push(s)); } catch (e) { kind = e.name; }
  return [[kind, calls, sleeps], ["TypeError", 1, []]];
});

test("a custom retryable predicate decides what is retried", "retryable = TimeoutError only; fails with TimeoutError once", (m) => {
  class TimeoutError extends Error { constructor() { super("timeout"); this.name = "TimeoutError"; } }
  let calls = 0;
  const sleeps = [];
  const out = m.retry(() => { if (++calls === 1) throw new TimeoutError(); return calls; }, 3, (s) => sleeps.push(s), { rand: stub(0.5), retryable: (e) => e instanceof TimeoutError });
  return [[out, sleeps], [2, [50]]];
});

test("retry sleeps grow exponentially and stop at the cap", "always fails, 10 attempts, base 100, cap 1000, rand 1", (m) => {
  const sleeps = [];
  try { m.retry(() => { throw new m.RetryableError("down"); }, 10, (s) => sleeps.push(s), { base: 100, cap: 1000, rand: stub(1) }); } catch { /* expected */ }
  return [sleeps, [100, 200, 400, 800, 1000, 1000, 1000, 1000, 1000]];
});

test("maxAttempts below 1 is rejected", "retry(fn, 0, sleep)", (m) => [() => m.retry(() => 1, 0, () => {}), raises("RangeError")]);
