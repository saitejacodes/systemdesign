const E = 1288834974657; // Twitter's epoch (the default)

// A fake clock that returns each value in turn, then repeats the last one.
const clock = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const parts = (m, id) => { const p = m.parse(id); return [p.timestamp - E, p.sequence]; };

test("bit layout: timestamp << 22 | worker << 12 | sequence", "worker 1, clock = epoch + 1 ms", (m) =>
  [new m.Snowflake(1, clock(E + 1)).nextId(), (1n << 22n) | (1n << 12n)]);

test("parse recovers timestamp, worker and sequence", "worker 513, clock = epoch + 123456789", (m) => {
  const g = new m.Snowflake(513, clock(E + 123456789));
  return [m.parse(g.nextId()), { timestamp: E + 123456789, workerId: 513, sequence: 0 }];
});

test("IDs in the same millisecond bump the sequence", "3 IDs, clock fixed at epoch + 50", (m) => {
  const g = new m.Snowflake(7, clock(E + 50));
  const ids = [g.nextId(), g.nextId(), g.nextId()];
  return [[ids.map((i) => m.parse(i).sequence), ids[2] - ids[0]], [[0, 1, 2], 2n]];
});

test("a new millisecond resets the sequence to 0", "clock: epoch+50, +50, +51", (m) => {
  const g = new m.Snowflake(7, clock(E + 50, E + 50, E + 51));
  const ids = [g.nextId(), g.nextId(), g.nextId()];
  return [ids.map((i) => parts(m, i)), [[50, 0], [50, 1], [51, 0]]];
});

test("10,000 IDs are unique and strictly increasing", "clock advances 1 ms every 3 reads", (m) => {
  let reads = 0;
  const g = new m.Snowflake(42, () => E + Math.floor(++reads / 3));
  const ids = Array.from({ length: 10000 }, () => g.nextId());
  return [ids.every((x, i) => i === 0 || ids[i - 1] < x), true];
});

test("sequence overflow waits for the next millisecond", "clock stuck at T for 5,000 reads, then T+1; 4,097 IDs", (m) => {
  let reads = 0;
  const T = E + 1000;
  const g = new m.Snowflake(3, () => (++reads <= 5000 ? T : T + 1));
  const ids = Array.from({ length: 4097 }, () => g.nextId());
  const increasing = ids.every((x, i) => i === 0 || ids[i - 1] < x);
  return [[m.parse(ids[4095]), m.parse(ids[4096]), increasing], [
    { timestamp: T, workerId: 3, sequence: 4095 },
    { timestamp: T + 1, workerId: 3, sequence: 0 },
    true,
  ]];
});

test("a clock that moves backwards raises ClockMovedBackwardsError", "clock: epoch+100, then epoch+99", (m) => {
  const g = new m.Snowflake(1, clock(E + 100, E + 99));
  g.nextId();
  return [() => g.nextId(), raises("ClockMovedBackwardsError")];
});

test("after the clock catches up, IDs continue without a duplicate", "clock: +100, +95 (raises), +100, +101", (m) => {
  const g = new m.Snowflake(1, clock(E + 100, E + 95, E + 100, E + 101));
  const first = g.nextId();
  let raised = false;
  try { g.nextId(); } catch (e) { raised = e.name === "ClockMovedBackwardsError"; }
  const later = [g.nextId(), g.nextId()];
  return [[raised, [first, ...later].map((i) => parts(m, i))], [true, [[100, 0], [100, 1], [101, 0]]]];
});

test("worker IDs outside 0..1023 are rejected", "new Snowflake(1024, ...)", (m) =>
  [() => new m.Snowflake(1024, clock(E)), raises("RangeError")]);

test("two workers in the same millisecond never collide", "workers 0 and 1, same clock reading", (m) => {
  const ia = new m.Snowflake(0, clock(E + 9)).nextId(), ib = new m.Snowflake(1, clock(E + 9)).nextId();
  return [[ia !== ib, ib - ia], [true, 1n << 12n]];
});

test("late timestamps give IDs above 2^53 that still round-trip", "clock = epoch + 2^40, worker 1023", (m) => {
  const i = new m.Snowflake(1023, clock(E + 2 ** 40)).nextId();
  return [[typeof i, i > 2n ** 53n, m.parse(i)], ["bigint", true, { timestamp: E + 2 ** 40, workerId: 1023, sequence: 0 }]];
});

test("a custom epoch shifts the timestamp field", "Discord's epoch 1420070400000 (2015-01-01), clock = epoch + 1000", (m) => {
  const D = 1420070400000;
  const i = new m.Snowflake(0, clock(D + 1000), D).nextId();
  return [[i, m.parse(i, D).timestamp], [1000n << 22n, D + 1000]];
});

test("a clock before the epoch is rejected", "clock = epoch - 1", (m) => {
  const g = new m.Snowflake(0, clock(E - 1));
  return [() => g.nextId(), raises("RangeError")];
});
