const filled = (m, n, p, count) => { const b = new m.BloomFilter(n, p); for (let i = 0; i < count; i++) b.add(`item-${i}`); return b; };
const fpRate = (b, probes = 10000) => { let c = 0; for (let i = 0; i < probes; i++) if (b.mightContain(`probe-${i}`)) c++; return c / probes; };

test("sizing: n=1,000, p=1% gives m=9,586 bits, k=7", "optimalParams(1000, 0.01)", (m) => [m.optimalParams(1000, 0.01), [9586, 7]]);

test("sizing from the lesson: 100M IDs at 0.1% is about 14.4 bits per ID, k=10", "optimalParams(100_000_000, 0.001)", (m) => {
  const [bits, k] = m.optimalParams(100000000, 0.001);
  return [[k, Math.round((bits / 100000000) * 100) / 100], [10, 14.38]];
});

test("k is never 0: p=0.5 gives a single hash", "optimalParams(1000, 0.5)", (m) => [m.optimalParams(1000, 0.5), [1443, 1]]);

test("an empty filter contains nothing", "new BloomFilter(1000, 0.01); mightContain x 1,000", (m) => {
  const b = new m.BloomFilter(1000, 0.01);
  let any = false; for (let i = 0; i < 1000; i++) any = any || b.mightContain(`item-${i}`);
  return [any, false];
});

test("indexes use double hashing: (h1 + i*h2) mod m", "indexes('hello') for n=1000, p=0.01", (m) => {
  const b = new m.BloomFilter(1000, 0.01);
  const h1 = m.fmix32(m.fnv1a32("hello", 0x811c9dc5)), h2 = m.fmix32(m.fnv1a32("hello", 0x01000193));
  return [b.indexes("hello"), Array.from({ length: 7 }, (_, i) => (h1 + i * h2) % 9586)];
});

test("no false negatives: every added item is found", "n=2000, p=0.01; add 2,000 items", (m) => {
  const b = filled(m, 2000, 0.01, 2000);
  let all = true; for (let i = 0; i < 2000; i++) all = all && b.mightContain(`item-${i}`);
  return [all, true];
});

test("the measured false-positive rate is near the target", "n=2000, p=0.01; 10,000 non-member probes", (m) => [fpRate(filled(m, 2000, 0.01, 2000)), approx(0.01, 0.004)]);

test("at design load, the formula predicts p", "n=1000, p=0.01; expectedFpRate(1000)", (m) => [new m.BloomFilter(1000, 0.01).expectedFpRate(1000), approx(0.01, 0.0005)]);

test("overfilled 4x, false positives explode, as the formula predicts", "n=2000, p=0.01; add 8,000 items", (m) => {
  const b = filled(m, 2000, 0.01, 8000);
  const measured = fpRate(b), predicted = b.expectedFpRate(8000);
  return [[measured > 0.5, Math.abs(measured - predicted) < 0.05], [true, true]];
});

test("non-ASCII items hash their UTF-8 bytes", "fnv1a32('café'); add 'café'", (m) => {
  const b = new m.BloomFilter(100, 0.01);
  b.add("café");
  return [["0x" + m.fnv1a32("café").toString(16), b.mightContain("café"), b.indexes("café").join() !== b.indexes("cafe").join()], ["0xa82b5049", true, true]];
});

test("p = 1 is rejected with RangeError", "new BloomFilter(1000, 1.0)", (m) => [() => new m.BloomFilter(1000, 1.0), raises("RangeError")]);

test("n = 0 is rejected with RangeError", "new BloomFilter(0, 0.01)", (m) => [() => new m.BloomFilter(0, 0.01), raises("RangeError")]);
