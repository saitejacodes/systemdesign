// P1: a (send to P2), c.  P2: receive a, b (send to P3).  P3: x, receive b.
function diagramLamport(m) {
  const p1 = new m.LamportClock(), p2 = new m.LamportClock(), p3 = new m.LamportClock();
  const a = p1.send(), x = p3.tick(), r2 = p2.receive(a), b = p2.send(), c = p1.tick(), r3 = p3.receive(b);
  return { a, x, r2, b, c, r3 };
}
function diagramVector(m) {
  const p1 = new m.VectorClock(0, 3), p2 = new m.VectorClock(1, 3), p3 = new m.VectorClock(2, 3);
  const a = p1.send(), x = p3.increment(), r2 = p2.receive(a), b = p2.send(), c = p1.increment(), r3 = p3.receive(b);
  return { a, x, r2, b, c, r3 };
}

test("Lamport: each local event increments the counter", "tick() x3", (m) => {
  const c = new m.LamportClock();
  return [[c.tick(), c.tick(), c.tick()], [1, 2, 3]];
});

test("Lamport: receive jumps past a sender that is ahead", "local 0; receive(5)", (m) => [new m.LamportClock().receive(5), 6]);

test("Lamport: receive from a sender that is behind still advances", "local at 10; receive(3)", (m) => {
  const c = new m.LamportClock();
  for (let i = 0; i < 10; i++) c.tick();
  return [c.receive(3), 11];
});

test("Lamport: three-process diagram", "P1 a→P2, P3 x, P2 recv a, P2 b→P3, P1 c, P3 recv b", (m) =>
  [diagramLamport(m), { a: 1, x: 1, r2: 2, b: 3, c: 2, r3: 4 }]);

test("vector: a local event bumps only its own entry", "new VectorClock(1, 3).increment() x2", (m) => {
  const v = new m.VectorClock(1, 3);
  return [[v.increment(), v.increment()], [[0, 1, 0], [0, 2, 0]]];
});

test("vector: receive merges element-wise, then increments", "P2 at [0,0,3,0] receives [2,5,1,0]", (m) => {
  const v = new m.VectorClock(2, 4);
  for (let i = 0; i < 3; i++) v.increment();
  return [v.receive([2, 5, 1, 0]), [2, 5, 4, 0]];
});

test("vector: three-process diagram", "same diagram as the Lamport test", (m) =>
  [diagramVector(m), { a: [1, 0, 0], x: [0, 0, 1], r2: [1, 1, 0], b: [1, 2, 0], c: [2, 0, 0], r3: [1, 2, 2] }]);

test("compare: before, after and equal", "[1,0,0] vs [1,2,2]; reverse; [1,2,0] vs itself", (m) =>
  [[m.compare([1, 0, 0], [1, 2, 2]), m.compare([1, 2, 2], [1, 0, 0]), m.compare([1, 2, 0], [1, 2, 0])], ["before", "after", "equal"]]);

test("compare: neither dominates means concurrent", "[1,1,0] vs [0,0,1]; [2,0,0] vs [1,2,2]", (m) =>
  [[m.compare([1, 1, 0], [0, 0, 1]), m.compare([2, 0, 0], [1, 2, 2])], ["concurrent", "concurrent"]]);

test("Lamport orders events that vector clocks prove concurrent", "diagram: c (P1) vs r3 (P3); x (P3) vs c (P1)", (m) => {
  const L = diagramLamport(m), V = diagramVector(m);
  return [[L.c < L.r3, m.compare(V.c, V.r3), m.compare(V.x, V.c), m.compare(V.a, V.r3)], [true, "concurrent", "concurrent", "before"]];
});

test("merge is an element-wise max that leaves its inputs alone", "merge([3,0,2], [1,4,2])", (m) => {
  const a = [3, 0, 2], b = [1, 4, 2];
  return [[m.merge(a, b), a, b], [[3, 4, 2], [3, 0, 2], [1, 4, 2]]];
});

test("a sent vector is a snapshot, not a live reference", "msg = send(); increment(); msg unchanged", (m) => {
  const v = new m.VectorClock(0, 2);
  const msg = v.send();
  v.increment();
  msg.push(99);
  return [[msg.slice(0, 2), v.value()], [[1, 0], [2, 0]]];
});

test("vectors of different lengths are rejected", "compare([1,0], [1,0,0])", (m) => [() => m.compare([1, 0], [1, 0, 0]), raises("RangeError")]);
