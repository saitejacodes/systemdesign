// A fake clock: tests move time by setting clock.t (seconds).
const makeClock = (t = 0) => { const c = { t }; c.now = () => c.t; return c; };
const r6 = (x) => Math.round(x * 1e6) / 1e6;

test("a new bucket starts full: capacity requests pass, the next is refused", "B=10, R=1; 11 requests at t=0", (m) => {
  const b = new m.TokenBucket(10, 1, makeClock().now);
  const results = Array.from({ length: 11 }, () => b.allow());
  return [[results.filter(Boolean).length, results[10]], [10, false]];
});

test("lesson example: burst of 15, then 2 tokens a second later", "B=10, R=2; 15 at t=0, 3 at t=1", (m) => {
  const c = makeClock(); const b = new m.TokenBucket(10, 2, c.now);
  let burst = 0; for (let i = 0; i < 15; i++) burst += b.allow() ? 1 : 0;
  c.t = 1;
  let later = 0; for (let i = 0; i < 3; i++) later += b.allow() ? 1 : 0;
  return [[burst, later], [10, 2]];
});

test("refill never exceeds capacity", "B=10, R=5; drain, idle 1000 s", (m) => {
  const c = makeClock(); const b = new m.TokenBucket(10, 5, c.now);
  for (let i = 0; i < 10; i++) b.allow();
  c.t = 1000;
  return [b.tokens(), approx(10)];
});

test("refill is fractional", "B=1, R=0.5; allow at t=0, 1, 2", (m) => {
  const c = makeClock(); const b = new m.TokenBucket(1, 0.5, c.now);
  const a0 = b.allow();
  c.t = 1; const a1 = b.allow(), half = b.tokens();
  c.t = 2; const a2 = b.allow();
  return [[a0, a1, r6(half), a2], [true, false, 0.5, true]];
});

test("a weighted request takes cost tokens; a refused one takes none", "B=10, R=0; allow(4) x3, allow(2)", (m) => {
  const b = new m.TokenBucket(10, 0, makeClock().now);
  const out = [b.allow(4), b.allow(4), b.allow(4)];
  const left = b.tokens();
  out.push(b.allow(2));
  return [[out, r6(left)], [[true, true, false, true], 2]];
});

test("cost > capacity is always refused, even when full", "B=5, R=1; idle 100 s; allow(6)", (m) => {
  const c = makeClock(); const b = new m.TokenBucket(5, 1, c.now);
  c.t = 100;
  return [[b.allow(6), r6(b.tokens())], [false, 5]];
});

test("clock going backwards mints no tokens and is not credited twice", "B=10, R=2; drain at t=10; t=5; t=10.5", (m) => {
  const c = makeClock(10); const b = new m.TokenBucket(10, 2, c.now);
  for (let i = 0; i < 10; i++) b.allow();
  c.t = 5; // NTP stepped the clock back 5 s
  const back = [b.allow(), r6(b.tokens())];
  c.t = 10.5; // only 0.5 s past the last real refill: exactly 1 token
  const fwd = [b.allow(), r6(b.tokens())];
  return [[back, fwd], [[false, 0], [true, 0]]];
});

test("refill_rate 0 never refills", "B=2, R=0; drain; idle 1e6 s", (m) => {
  const c = makeClock(); const b = new m.TokenBucket(2, 0, c.now);
  b.allow(); b.allow();
  c.t = 1e6;
  return [b.allow(), false];
});

test("sustained rate converges to B + R*T", "B=5, R=4; a request every 0.125 s for 10 s (81 requests)", (m) => {
  const c = makeClock(); const b = new m.TokenBucket(5, 4, c.now);
  let allowed = 0;
  for (let i = 0; i < 81; i++) { c.t = i * 0.125; allowed += b.allow() ? 1 : 0; }
  return [allowed, 5 + 4 * 10];
});

test("tokens() only reads: it never consumes", "B=3, R=1; tokens() twice", (m) => {
  const b = new m.TokenBucket(3, 1, makeClock().now);
  b.allow();
  return [[r6(b.tokens()), r6(b.tokens()), b.allow(), b.allow(), b.allow()], [2, 2, true, true, false]];
});

test("allow(0) is rejected with RangeError", "allow(0)", (m) => {
  const b = new m.TokenBucket(3, 1, makeClock().now);
  return [() => b.allow(0), raises("RangeError")];
});

test("capacity 0 is rejected with RangeError", "new TokenBucket(0, 1, now)", (m) => [() => new m.TokenBucket(0, 1, makeClock().now), raises("RangeError")]);
