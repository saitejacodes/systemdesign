function store(m, n, w, r, down = []) {
  const s = new m.QuorumStore(n, w, r);
  for (const i of down) s.setDown(i);
  return s;
}

function combinations(xs, k) {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [h, ...t] = xs;
  return [...combinations(t, k - 1).map((c) => [h, ...c]), ...combinations(t, k)];
}

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

test("an impossible configuration is rejected", "new QuorumStore(3, 4, 2) and new QuorumStore(3, 2, 0)", (m) => [() => {
  try { new m.QuorumStore(3, 2, 0); } catch (e) { if (e.name === "RangeError") new m.QuorumStore(3, 4, 2); }
}, raises("RangeError")]);

test("overlaps() is true exactly when R + W > N", "(3,2,2) (3,3,1) (3,1,1) (5,3,3) (5,2,3)", (m) => {
  const cfgs = [[3, 2, 2], [3, 3, 1], [3, 1, 1], [5, 3, 3], [5, 2, 3]];
  return [cfgs.map((c) => new m.QuorumStore(...c).overlaps()), [true, true, false, true, false]];
});

test("write then read returns the newest [version, value]", "(3,2,2): write v1, write v2, read", (m) => {
  const s = store(m, 3, 2, 2);
  s.write("k", "a", 1);
  const acks = s.write("k", "b", 2);
  return [[acks, s.read("k")], [3, [2, "b"]]];
});

test("reading a key nobody has returns null", "(3,2,2): read('missing')", (m) => [store(m, 3, 2, 2).read("missing"), null]);

test("a write with fewer than W replicas up raises", "(3,2,2), replicas 1 and 2 down: write", (m) => {
  const s = store(m, 3, 2, 2, [1, 2]);
  return [() => s.write("k", "a", 1), raises("QuorumError")];
});

test("a failed write is not rolled back on the replica that took it", "(3,2,2), 1 and 2 down: write fails; inspect replica 0", (m) => {
  const s = store(m, 3, 2, 2, [1, 2]);
  try { s.write("seat", "Maya", 1); } catch (e) { if (e.name !== "QuorumError") throw e; }
  return [[s.replicaValue(0, "seat"), s.replicaValue(1, "seat")], [[1, "Maya"], null]];
});

test("a read with fewer than R replicas up raises", "(3,2,2), replicas 0 and 2 down: read", (m) => {
  const s = store(m, 3, 2, 2);
  s.write("k", "a", 1);
  s.setDown(0); s.setDown(2);
  return [() => s.read("k"), raises("QuorumError")];
});

test("an older version arriving late does not overwrite a newer one", "write v5 then write v3", (m) => {
  const s = store(m, 3, 2, 2);
  s.write("k", "new", 5);
  const acks = s.write("k", "old", 3);
  return [[acks, s.read("k"), s.replicaValue(2, "k")], [3, [5, "new"], [5, "new"]]];
});

test("R + W > N: a read reaches the latest write even after a replica missed it", "(3,2,2): 2 misses v2; then 0 down; read hits 1, 2", (m) => {
  const s = store(m, 3, 2, 2);
  s.write("k", "v1", 1);
  s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
  s.setDown(0);
  return [s.read("k"), [2, "v2"]];
});

test("every write quorum meets every read quorum for (5,3,3)", "all 10 write sets x all 120 read orders", (m) => {
  let stale = 0;
  const all = [0, 1, 2, 3, 4];
  for (const ws of combinations(all, 3)) {
    for (const order of permutations(all)) {
      const s = store(m, 5, 3, 3);
      s.write("k", "old", 1);
      for (const i of all) if (!ws.includes(i)) s.setDown(i);
      s.write("k", "new", 2);
      for (const i of all) s.setDown(i, false);
      const got = s.read("k", order);
      if (!got || got[0] !== 2 || got[1] !== "new") stale++;
    }
  }
  return [stale, 0];
});

test("W = 1, R = 1: a read can miss an acknowledged write", "(3,1,1): write v2 lands on 0 only; read from 1", (m) => {
  const s = store(m, 3, 1, 1);
  s.write("k", "v1", 1);
  s.setDown(1); s.setDown(2);
  const acks = s.write("k", "v2", 2);
  s.setDown(1, false); s.setDown(2, false);
  return [[acks, s.read("k", [1, 0, 2])], [1, [1, "v1"]]];
});

test("read repair updates the stale replica it contacted", "(3,2,2): 2 misses v2; read order [2, 0]", (m) => {
  const s = store(m, 3, 2, 2);
  s.write("k", "v1", 1);
  s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
  const before = s.replicaValue(2, "k");
  const got = s.read("k", [2, 0, 1]);
  return [[before, got, s.replicaValue(2, "k")], [[1, "v1"], [2, "v2"], [2, "v2"]]];
});

test("read repair does not touch replicas outside the read quorum", "(3,2,2): 2 misses v2; read order [0, 1]", (m) => {
  const s = store(m, 3, 2, 2);
  s.write("k", "v1", 1);
  s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
  s.read("k", [0, 1, 2]);
  return [s.replicaValue(2, "k"), [1, "v1"]];
});

test("a replica missing the key entirely is repaired too", "(3,2,2): 1 down for the only write; read order [1, 0]", (m) => {
  const s = store(m, 3, 2, 2, [1]);
  s.write("k", "v1", 7);
  s.setDown(1, false);
  s.read("k", [1, 0, 2]);
  return [s.replicaValue(1, "k"), [7, "v1"]];
});
