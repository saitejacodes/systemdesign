const KEYS = Array.from({ length: 10000 }, (_, i) => `key-${i}`);
const NODES = ["node-A", "node-B", "node-C"];
const ring = (m, nodes, vnodes = 100) => { const r = new m.HashRing(vnodes); for (const n of nodes) r.addNode(n); return r; };
const hex = (x) => "0x" + x.toString(16);

test("FNV-1a 32-bit matches the published test vectors (UTF-8 bytes)", "fnv1a32('') / 'a' / 'foobar' / 'café'; hash32('a')", (m) => [
  [m.fnv1a32(""), m.fnv1a32("a"), m.fnv1a32("foobar"), m.fnv1a32("café"), m.hash32("a")].map(hex),
  ["0x811c9dc5", "0xe40c292c", "0xbf9cf968", "0xa82b5049", "0x1a80b1b3"],
]);

test("an empty ring throws an Error", "new HashRing().getNode('k')", (m) => {
  const r = new m.HashRing();
  return [() => r.getNode("k"), raises("Error")];
});

test("a single node owns every key", "add node-A; 1,000 keys", (m) => {
  const r = ring(m, ["node-A"]);
  return [[...new Set(KEYS.slice(0, 1000).map((k) => r.getNode(k)))], ["node-A"]];
});

test("keys past the last point wrap around to the first", "vnodes=1, nodes A, B, C (C has the lowest position); keys k1 (above all points), k9 (below all)", (m) => {
  const r = ring(m, ["A", "B", "C"], 1);
  return [[r.getNode("k1"), r.getNode("k9"), r.getNode("k0")], ["C", "C", "A"]];
});

test("ownership does not depend on the order nodes were added", "add A, B, C vs C, A, B", (m) => {
  const a = ring(m, NODES), b = ring(m, [...NODES].reverse());
  return [KEYS.every((k) => a.getNode(k) === b.getNode(k)), true];
});

test("100 vnodes spread keys evenly: each of 4 nodes owns 25% +/- 8%", "4 nodes x 100 vnodes, 10,000 keys", (m) => {
  const r = ring(m, [...NODES, "node-D"]);
  const share = new Map();
  for (const k of KEYS) { const n = r.getNode(k); share.set(n, (share.get(n) || 0) + 1); }
  return [share.size === 4 && [...share.values()].every((c) => c / KEYS.length >= 0.17 && c / KEYS.length <= 0.33), true];
});

test("adding a 4th node moves about 1/4 of keys, all of them to the new node", "3 -> 4 nodes, 100 vnodes, 10,000 keys", (m) => {
  const r = ring(m, NODES);
  const before = new Map(KEYS.map((k) => [k, r.getNode(k)]));
  r.addNode("node-D");
  const moved = KEYS.filter((k) => r.getNode(k) !== before.get(k));
  const frac = moved.length / KEYS.length;
  return [[frac >= 0.15 && frac <= 0.35, moved.every((k) => r.getNode(k) === "node-D")], [true, true]];
});

test("removing a node moves only that node's keys", "4 -> 3 nodes (remove node-B)", (m) => {
  const r = ring(m, [...NODES, "node-D"]);
  const before = new Map(KEYS.map((k) => [k, r.getNode(k)]));
  r.removeNode("node-B");
  const moved = KEYS.filter((k) => r.getNode(k) !== before.get(k));
  const ownedByB = KEYS.filter((k) => before.get(k) === "node-B");
  return [[moved.join() === ownedByB.join(), KEYS.some((k) => r.getNode(k) === "node-B")], [true, false]];
});

test("for contrast, hash mod N moves about 3/4 of keys going from 3 to 4", "hash32(key) % 3 vs % 4", (m) => {
  const frac = KEYS.filter((k) => m.hash32(k) % 3 !== m.hash32(k) % 4).length / KEYS.length;
  return [frac, approx(0.75, 0.03)];
});

test("adding a node twice does not double its vnodes", "add A, B, A; remove A once", (m) => {
  const r = ring(m, ["A", "B", "A"]);
  r.removeNode("A");
  return [[r.nodes(), [...new Set(KEYS.slice(0, 500).map((k) => r.getNode(k)))]], [["B"], ["B"]]];
});

test("removing an unknown node throws an Error", "removeNode('ghost')", (m) => {
  const r = ring(m, NODES);
  return [() => r.removeNode("ghost"), raises("Error")];
});

test("removing the last node leaves an empty ring", "add A; remove A; getNode", (m) => {
  const r = ring(m, ["A"]);
  r.removeNode("A");
  return [() => r.getNode("k"), raises("Error")];
});
