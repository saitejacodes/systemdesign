const blocks = (n, prefix = "block-") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

test("fnv1a64 matches the published FNV-1a 64-bit test vectors", "fnv1a64(''), fnv1a64('a'), fnv1a64('foobar')", (m) =>
  [[m.fnv1a64(""), m.fnv1a64("a"), m.fnv1a64("foobar")], ["cbf29ce484222325", "af63dc4c8601ec8c", "85944171f73967e8"]]);

test("one leaf: the root is the leaf hash; two leaves: the root is their node hash", "new MerkleTree(['only']), new MerkleTree(['a', 'b'])", (m) => {
  const one = new m.MerkleTree(["only"]), two = new m.MerkleTree(["a", "b"]);
  return [[one.root() === m.fnv1a64("\x00only"), two.root() === m.nodeHash(m.leafHash("a"), m.leafHash("b")), two.root()], [true, true, "4ed018693fe30ca0"]];
});

test("an odd last node is promoted, so [a, b, c] and [a, b, c, c] differ", "new MerkleTree(['a','b','c']) vs ['a','b','c','c']", (m) => {
  const t = new m.MerkleTree(["a", "b", "c"]);
  const expected = m.nodeHash(m.nodeHash(m.leafHash("a"), m.leafHash("b")), m.leafHash("c"));
  return [[t.root(), t.root() === expected, t.root() === new m.MerkleTree(["a", "b", "c", "c"]).root()], ["57c9daf1a831262e", true, false]];
});

test("changing or reordering any leaf changes the root", "8 blocks: edit each one in turn, then swap 0 and 1", (m) => {
  const base = blocks(8);
  const r = new m.MerkleTree(base).root();
  const changed = base.map((_, i) => new m.MerkleTree(base.map((x, k) => (k === i ? x + "x" : x))).root() !== r);
  const swapped = new m.MerkleTree([base[1], base[0], ...base.slice(2)]).root() !== r;
  return [[changed.every(Boolean), swapped], [true, true]];
});

test("every leaf's proof verifies, for trees of 1 to 9 leaves", "for n in 1..9, for i in 0..n-1: verify(leaf i, proof(i), root)", (m) => {
  let bad = 0;
  for (let n = 1; n <= 9; n++) {
    const xs = blocks(n), t = new m.MerkleTree(xs);
    for (let i = 0; i < n; i++) if (!m.verify(xs[i], t.proof(i), t.root())) bad++;
  }
  return [bad, 0];
});

test("proof shape: one sibling per level, none where a node was promoted", "8 leaves proof(5); 5 leaves proof(4); 1 leaf proof(0)", (m) => {
  const p8 = new m.MerkleTree(blocks(8, "b")).proof(5);
  const p5 = new m.MerkleTree(blocks(5, "b")).proof(4);
  return [[p8.map((p) => p[0]), p5.map((p) => p[0]), new m.MerkleTree(["x"]).proof(0).length], [["L", "R", "L"], ["L"], 0]];
});

test("a wrong leaf, a tampered proof or a wrong root fails verification", "8 blocks, leaf 3", (m) => {
  const xs = blocks(8), t = new m.MerkleTree(xs), p = t.proof(3);
  const forged = p.map(([s, h]) => [s, h]);
  forged[1] = [forged[1][0], m.fnv1a64("forged")];
  const flipped = p.map(([s, h]) => [s === "L" ? "R" : "L", h]);
  return [[m.verify(xs[3], p, t.root()), m.verify("block-x", p, t.root()), m.verify(xs[3], forged, t.root()),
    m.verify(xs[3], flipped, t.root()), m.verify(xs[3], p, m.fnv1a64("other"))], [true, false, false, false, false]];
});

test("identical trees: diff is empty after comparing only the roots", "diff of two trees over the same 64 blocks", (m) => {
  const a = new m.MerkleTree(blocks(64)), b = new m.MerkleTree(blocks(64));
  return [[a.diff(b), a.compared], [[], 1]];
});

test("one changed leaf among 8 is found with 1 + 2 * log2(8) comparisons", "8 blocks, block 5 edited", (m) => {
  const xs = blocks(8), ys = [...xs];
  ys[5] = "changed";
  const a = new m.MerkleTree(xs);
  return [[a.diff(new m.MerkleTree(ys)), a.compared], [[5], 7]];
});

test("diff finds every changed leaf and skips matching subtrees", "1024 blocks, blocks 3, 500 and 1023 edited", (m) => {
  const xs = blocks(1024), ys = [...xs];
  for (const i of [3, 500, 1023]) ys[i] += "!";
  const a = new m.MerkleTree(xs);
  const got = a.diff(new m.MerkleTree(ys));
  return [[got, a.compared <= 1 + 2 * 10 * 3], [[3, 500, 1023], true]];
});

test("diff reaches a change in a promoted (odd) leaf", "5 blocks, block 4 edited", (m) => {
  const xs = blocks(5);
  return [new m.MerkleTree(xs).diff(new m.MerkleTree([...xs.slice(0, 4), "changed"])), [4]];
});

test("diff of trees with different leaf counts raises", "new MerkleTree(4 blocks).diff(new MerkleTree(5 blocks))", (m) => {
  const a = new m.MerkleTree(blocks(4)), b = new m.MerkleTree(blocks(5));
  return [() => a.diff(b), raises("RangeError")];
});

test("a tree with no leaves raises", "new MerkleTree([])", (m) => [() => new m.MerkleTree([]), raises("RangeError")]);

test("a proof for a leaf that does not exist raises", "new MerkleTree(4 blocks).proof(4)", (m) => {
  const t = new m.MerkleTree(blocks(4));
  return [() => t.proof(4), raises("RangeError")];
});
