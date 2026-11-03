function bucket(m, capacity, rate, t = 0) {
  const clock = { t };
  return [new m.LeakyBucket(capacity, rate, () => clock.t), clock];
}

test("an invalid capacity or leak rate is rejected", "new LeakyBucket(0, 1, now), then new LeakyBucket(1, 0, now)", (m) => [() => {
  try { new m.LeakyBucket(0, 1, () => 0); } catch (e) { if (e.name === "RangeError") new m.LeakyBucket(1, 0, () => 0); }
}, raises("RangeError")]);

test("a burst fills the bucket, then overflow is dropped", "cap 3, rate 1/s: 5 offers at t = 0", (m) => {
  const [b] = bucket(m, 3, 1);
  return [[[0, 1, 2, 3, 4].map((i) => b.offer(i)), b.size()], [[true, true, true, false, false], 3]];
});

test("no burst comes out: departures are spaced 1 / rate apart", "cap 3, rate 2/s: offer a, b, c at t = 0; drain at t = 10", (m) => {
  const [b, c] = bucket(m, 3, 2);
  for (const r of "abc") b.offer(r);
  c.t = 10;
  return [b.drain(), [[0.5, "a"], [1.0, "b"], [1.5, "c"]]];
});

test("the queue drains at a steady rate", "cap 3, rate 2/s, 3 queued at t = 0: size at t = 0.25, 0.5, 1.0, 1.5", (m) => {
  const [b, c] = bucket(m, 3, 2);
  for (const r of "abc") b.offer(r);
  const sizes = [0.25, 0.5, 1.0, 1.5].map((t) => { c.t = t; return b.size(); });
  return [sizes, [3, 2, 1, 0]];
});

test("once one request leaks out there is room for exactly one more", "cap 2, rate 1/s: a, b at t = 0; c at t = 0.5; c at t = 1", (m) => {
  const [b, c] = bucket(m, 2, 1);
  const got = [b.offer("a"), b.offer("b")];
  c.t = 0.5; got.push(b.offer("c"));
  c.t = 1.0; got.push(b.offer("c"), b.offer("d"));
  c.t = 10;
  return [[got, b.drain().map(([t]) => t)], [[true, true, false, true, false], [1, 2, 3]]];
});

test("an idle period empties the bucket and it accepts a full burst again", "cap 3, rate 1/s: 4 offers at t = 0, 4 more at t = 10", (m) => {
  const [b, c] = bucket(m, 3, 1);
  const first = [0, 1, 2, 3].map((i) => b.offer(i));
  c.t = 10;
  const empty = b.size();
  const second = [4, 5, 6, 7].map((i) => b.offer(i));
  return [[first, empty, second], [[true, true, true, false], 0, [true, true, true, false]]];
});

test("a request into an idle bucket leaves one interval after it arrives", "cap 2, rate 4/s: offer x at t = 5; drain at t = 6", (m) => {
  const [b, c] = bucket(m, 2, 4, 5);
  b.offer("x");
  c.t = 6;
  return [b.drain(), [[5.25, "x"]]];
});

test("arrivals exactly at the leak rate are never dropped, even with capacity 1", "cap 1, rate 2/s: 100 offers, one every 0.5 s", (m) => {
  const [b, c] = bucket(m, 1, 2);
  let ok = 0;
  for (let i = 0; i < 100; i++) { c.t = i * 0.5; if (b.offer(i)) ok++; }
  return [ok, 100];
});

test("arrivals 4x faster than the rate: accepted = drained so far + capacity", "cap 2, rate 1/s: 40 offers, one every 0.25 s; drain at t = 100", (m) => {
  const [b, c] = bucket(m, 2, 1);
  let ok = 0;
  for (let i = 0; i < 40; i++) { c.t = i * 0.25; if (b.offer(i)) ok++; }
  c.t = 100;
  return [[ok, b.drain().map(([t]) => t)], [11, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]]];
});

test("drain returns each request once, in arrival order", "cap 4, rate 1/s: offer 1..4; drain at t = 2.5 and again", (m) => {
  const [b, c] = bucket(m, 4, 1);
  for (const r of [1, 2, 3, 4]) b.offer(r);
  c.t = 2.5;
  const first = b.drain().map(([, r]) => r);
  return [[first, b.drain(), b.size()], [[1, 2], [], 2]];
});

test("a clock stepping backwards neither leaks nor crashes", "cap 2, rate 1/s: offer a at t = 5; clock goes to t = 1; then t = 6.5", (m) => {
  const [b, c] = bucket(m, 2, 1, 5);
  b.offer("a");
  c.t = 1;
  const during = [b.size(), b.drain(), b.offer("b")];
  c.t = 6.5;
  return [[during, b.drain()], [[1, [], true], [[6, "a"]]]];
});

test("capacity 1 holds a single request", "cap 1, rate 1/s: 2 offers at t = 0", (m) => {
  const [b] = bucket(m, 1, 1);
  return [[b.offer("a"), b.offer("b"), b.size()], [true, false, 1]];
});

test("100,000 offers at twice the rate stay fast", "cap 100, rate 1024/s, one offer every 1/2048 s", (m) => {
  const [b, c] = bucket(m, 100, 1024);
  let ok = 0;
  for (let i = 0; i < 100000; i++) { c.t = i / 2048; if (b.offer(i)) ok++; }
  return [[ok, b.size()], [50099, 100]];
});
