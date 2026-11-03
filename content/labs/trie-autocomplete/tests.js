const SAMPLE = [["car", 5], ["cart", 3], ["care", 8], ["cat", 2], ["dog", 4]];
const build = (m, pairs) => { const t = new m.Trie(); for (const [w, x] of pairs) t.insert(w, x); return t; };

test("an empty trie has no completions", "new Trie().topK('a', 5)", (m) => [new m.Trie().topK("a", 5), []]);

test("insert then topK returns the word and its weight", "insert('car', 5); topK('c', 3)", (m) => {
  const t = new m.Trie(); t.insert("car", 5);
  return [t.topK("c", 3), [["car", 5]]];
});

test("results are sorted by weight, heaviest first", "car 5, cart 3, care 8, cat 2, dog 4; topK('ca', 10)", (m) =>
  [build(m, SAMPLE).topK("ca", 10), [["care", 8], ["car", 5], ["cart", 3], ["cat", 2]]]);

test("equal weights are ordered alphabetically", "beta 2, alpha 2, gamma 2, delta 5; topK('', 4)", (m) =>
  [build(m, [["beta", 2], ["alpha", 2], ["gamma", 2], ["delta", 5]]).topK("", 4), [["delta", 5], ["alpha", 2], ["beta", 2], ["gamma", 2]]]);

test("re-inserting a word adds to its weight", "insert('cat', 2); insert('cat'); insert('cat', 4)", (m) => {
  const t = build(m, SAMPLE); t.insert("cat"); t.insert("cat", 4);
  return [[t.weight("cat"), t.topK("ca", 2)], [7, [["care", 8], ["cat", 7]]]];
});

test("k limits the number of results", "sample; topK('ca', 2)", (m) => [build(m, SAMPLE).topK("ca", 2), [["care", 8], ["car", 5]]]);

test("k larger than the matches returns all of them", "sample; topK('do', 50)", (m) => [build(m, SAMPLE).topK("do", 50), [["dog", 4]]]);

test("an unknown prefix returns []", "sample; topK('cx', 5), topK('zebra', 5)", (m) => {
  const t = build(m, SAMPLE);
  return [[t.topK("cx", 5), t.topK("zebra", 5)], [[], []]];
});

test("the empty prefix matches every word", "sample; topK('', 10)", (m) =>
  [build(m, SAMPLE).topK("", 10), [["care", 8], ["car", 5], ["dog", 4], ["cart", 3], ["cat", 2]]]);

test("a prefix that is not a word has weight 0 and is never suggested", "insert('cart', 3); weight('ca'), topK('c', 5)", (m) => {
  const t = new m.Trie(); t.insert("cart", 3);
  return [[t.weight("ca"), t.weight("cartwheel"), t.topK("c", 5)], [0, 0, [["cart", 3]]]];
});

test("the prefix itself is included when it is a word", "sample; topK('car', 5)", (m) =>
  [build(m, SAMPLE).topK("car", 5), [["care", 8], ["car", 5], ["cart", 3]]]);

test("k of 0 returns []", "sample; topK('c', 0)", (m) => [build(m, SAMPLE).topK("c", 0), []]);

test("20,000 words and 676 prefix queries stay fast", "20k distinct 4-letter words; topK for every 2-letter prefix", (m) => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const t = new m.Trie();
  for (let i = 0; i < 20000; i++) {
    const n = (i * 7919) % 26 ** 4; // 7919 is coprime with 26, so all words are distinct
    let w = "";
    for (let j = 0; j < 4; j++) w += letters[Math.floor(n / 26 ** j) % 26];
    t.insert(w, (i % 97) + 1);
  }
  let total = 0;
  for (const a of letters) for (const b of letters) total += t.topK(a + b, 1000).length;
  const top = t.topK("", 3).map(([, x]) => x);
  return [[total, t.topK("", 25000).length, top], [20000, 20000, [97, 97, 97]]];
});
