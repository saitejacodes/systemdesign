const r6 = (x) => Math.round(x * 1e6) / 1e6;
const count = (n, f) => { let c = 0; for (let i = 0; i < n; i++) if (f()) c++; return c; };

test("allows up to the limit inside one window", "limit 5, window 60; 6 requests at t=0", (m) => {
  const s = new m.SlidingWindowCounter(5, 60);
  return [Array.from({ length: 6 }, () => s.allow(0)), [true, true, true, true, true, false]];
});

test("lesson example: 80 previous, 30 current, 25% in -> 90, allowed", "limit 100, window 60; 80 at t=1, 30 at t=70; estimate(75); 45 s in", (m) => {
  const s = new m.SlidingWindowCounter(100, 60);
  for (let i = 0; i < 80; i++) s.allow(1);
  for (let i = 0; i < 30; i++) s.allow(70);
  const e75 = s.estimate(75);
  const ok = s.allow(75);
  const e105 = s.estimate(105); // 80 * 0.25 + 31
  return [[r6(e75), ok, r6(e105)], [90, true, 51]];
});

test("fixed window (given) lets 2x the limit through at the boundary", "FixedWindowCounter(100, 60); 100 at t=59, 100 at t=60", (m) => {
  const f = new m.FixedWindowCounter(100, 60);
  return [count(100, () => f.allow(59)) + count(100, () => f.allow(60)), 200];
});

test("sliding window holds the same boundary burst to the limit", "SlidingWindowCounter(100, 60); 100 at t=59, 100 at t=60", (m) => {
  const s = new m.SlidingWindowCounter(100, 60);
  const a = count(100, () => s.allow(59));
  const b = count(100, () => s.allow(60));
  return [[a, b], [100, 0]];
});

test("capacity comes back as the previous window slides out", "limit 100, window 60; 100 at t=59; 100 tries at t=90", (m) => {
  const s = new m.SlidingWindowCounter(100, 60);
  for (let i = 0; i < 100; i++) s.allow(59);
  return [count(100, () => s.allow(90)), 50]; // 100 * 0.5 + curr < 100
});

test("refused requests are not counted", "limit 2, window 10; 5 tries at t=0; estimate(0)", (m) => {
  const s = new m.SlidingWindowCounter(2, 10);
  const n = count(5, () => s.allow(0));
  return [[n, s.estimate(0)], [2, 2]];
});

test("a gap longer than one window forgets the old counts", "limit 100, window 60; 100 at t=0; 100 tries at t=130", (m) => {
  const s = new m.SlidingWindowCounter(100, 60);
  for (let i = 0; i < 100; i++) s.allow(0);
  return [count(100, () => s.allow(130)), 100];
});

test("limit 1: the previous request is weighted until it slides out", "limit 1, window 60; allow at t=0, 30, 60, 90", (m) => {
  const s = new m.SlidingWindowCounter(1, 60);
  return [[s.allow(0), s.allow(30), s.allow(60), s.allow(90)], [true, false, false, true]];
});

test("steady traffic: the estimate tracks the exact sliding count", "a request every 0.5 s for t=0..330; estimate(330.25) vs exact 120", (m) => {
  const s = new m.SlidingWindowCounter(10000, 60);
  for (let i = 0; i < 661; i++) s.allow(i * 0.5);
  return [s.estimate(330.25), approx(120, 1)];
});

test("a timestamp earlier than the last one raises RangeError", "allow(10); allow(5)", (m) => {
  const s = new m.SlidingWindowCounter(10, 60);
  s.allow(10);
  return [() => s.allow(5), raises("RangeError")];
});

test("limit 0 is rejected with RangeError", "new SlidingWindowCounter(0, 60)", (m) => [() => new m.SlidingWindowCounter(0, 60), raises("RangeError")]);
