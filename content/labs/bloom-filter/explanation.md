A **Bloom filter** (Burton Bloom, 1970) answers "is this item in the set?" with either **definitely not** or **probably yes**, in a few bits per item, however long the items are. It has **no false negatives**: an added item is always found. The false-positive rate is tunable. In the lesson's cache-penetration defence, every valid ID goes into the filter, and a request for an ID the filter has never seen gets a 404 without touching the cache or the database. Cassandra, HBase, LevelDB and RocksDB keep one per SSTable so a read can skip files that can't contain the key. Redis Stack and Redis 8 offer `BF.ADD` and `BF.EXISTS`.

## How it works

An array of **m bits**, all 0, and **k** hash positions per item:

- `add(x)` sets the k bits at `g₀(x) … g_{k−1}(x)`.
- `might_contain(x)` returns true only if **all** k bits are set. One clear bit proves `x` was never added.

After inserting n items, a given bit is still 0 with probability ≈ `e^(−kn/m)`, so the false-positive rate is

```
p ≈ (1 − e^(−kn/m))^k
```

That is minimised at **k = (m/n) ln 2**, where about half the bits are set. Solving for m gives the sizing rules from the lesson:

```
m = ⌈ −n · ln p / (ln 2)² ⌉        k = round((m / n) · ln 2), at least 1
```

At p = 1% that is about 9.6 bits per item and k = 7. At 0.1% it is about 14.4 bits and k = 10. Each 10× cut in p costs only about 4.8 more bits per item.

**Double hashing.** Computing k independent hashes is expensive. Kirsch and Mitzenmacher ("Less Hashing, Same Performance", 2006) showed that two are enough: `gᵢ(x) = (h1(x) + i · h2(x)) mod m` gives the same asymptotic false-positive rate. Guava's `BloomFilter` does this with the two halves of a 128-bit MurmurHash3.

## Your task

The hashes are given in the starter and must not change, so every language gets the same bits:

- `fnv1a32(s, seed)`: FNV-1a, 32-bit, over the **UTF-8 bytes** of `s`. Start with `h = seed`. For each byte, `h = (h XOR byte) × 0x01000193 mod 2³²`.
- `fmix32(h)`: MurmurHash3's finalizer (`h ^= h>>16; h *= 0x85EBCA6B; h ^= h>>13; h *= 0xC2B2AE35; h ^= h>>16`, mod 2³²).
- `h1 = fmix32(fnv1a32(s, 0x811C9DC5))` and `h2 = fmix32(fnv1a32(s, 0x01000193))`.

Implement:

- `optimal_params(n, p)` returns `(m, k)` using the formulas above. It raises `ValueError` (Python) or throws `RangeError` (JavaScript) unless `n ≥ 1` and `0 < p < 1`.
- `BloomFilter(n, p)` exposes `m` and `k`. It packs the bits 8 per byte (`ceil(m/8)` bytes).
- `indexes(item)` returns the k positions `(h1 + i·h2) mod m` for `i = 0 … k−1`, in order.
- `add(item)` and `might_contain(item)` (`mightContain` in the other languages).
- `expected_fp_rate(count)` returns `(1 − e^(−k·count/m))^k` (`expectedFpRate` in the other languages).

Java puts the hashes in a `Hashing` class (unsigned values in a `long`), makes `optimalParams` a static method of `BloomFilter` returning `{m, k}`, and throws `IllegalArgumentException`. C++ returns a `std::pair` and throws `std::invalid_argument`.

The tests check the sizing (n = 1,000 and p = 1% give m = 9,586 and k = 7), that no added item is ever missed, and that the **measured** false-positive rate on 10,000 non-members is within ±0.4 points of 1%. A filter loaded with 4× its design n reaches a false-positive rate above 50%, matching the formula.

## Going further

- **No deletes.** Clearing a bit could erase another item. Counting Bloom filters keep a small counter per position (usually 4 bits), at 4× the memory. Cuckoo filters (Fan et al., 2014) support deletes in similar space at low p.
- **Size for growth.** Overfilling is the classic failure: the rate climbs steeply past n. Scalable Bloom filters add new, tighter layers as they fill, and Redis's `BF.RESERVE` has an `EXPANSION` option.
- **Keep it in sync.** Every create must also add to the filter; only a rebuild forgets deleted IDs.
- **Locality.** k random bit positions mean k cache misses. Blocked Bloom filters (as in RocksDB's newer format) keep all k bits in one cache line, for a slightly higher p.
