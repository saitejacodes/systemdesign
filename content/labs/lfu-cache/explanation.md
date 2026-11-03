An LFU (least frequently used) cache keeps at most `capacity` entries and, when full, evicts the entry with the **lowest access count**. Where LRU asks "what was used longest ago?", LFU asks "what has been used least?". That makes it **scan-resistant**: a key read 50,000 times survives a batch job that touches a million keys once each, which would flush an LRU cache completely.

Redis has offered `allkeys-lfu` and `volatile-lfu` since 4.0. It does not keep exact counts: it stores an 8-bit logarithmic counter per key that also decays over time (`lfu-log-factor`, `lfu-decay-time`), and evicts by sampling. Caffeine (Java) uses W-TinyLFU, which estimates frequency with a Count-Min-style sketch and uses it as an admission filter. Both exist because exact LFU has two known weaknesses, covered below. First, build the exact version.

## The O(1) structure

A min-heap on frequency is the obvious design, but it costs O(log n) per operation. The trick that makes LFU O(1) (described by Shah, Mitra and Matani in 2010) is that a key's count only ever **increases by exactly one**, so it only ever moves from bucket `f` to bucket `f + 1`. Keep:

- `entries`: key → `(value, freq)`;
- `buckets`: freq → the keys with that freq, **ordered from least to most recently used**;
- `min_freq`: the lowest frequency that currently has a non-empty bucket.

Invariants after every operation:

1. Every key in `entries` appears in exactly one bucket, the one matching its freq.
2. No bucket is empty (delete it when its last key leaves).
3. `min_freq` names the bucket the next eviction comes from.

`min_freq` never needs a scan. A hit can only raise it by one (when the key leaves the last slot of the `min_freq` bucket), and a new insert always resets it to 1.

## Your task

Implement `LFUCache(capacity)` with:

- `get(key)` returns the value, or `-1` if absent. A hit increments the key's frequency.
- `put(key, value)` inserts or updates. **An update counts as a use**: it increments the frequency and makes the key the most recent in its new bucket. A new key starts at frequency 1.
- When inserting a **new** key into a full cache, first evict the key with the lowest frequency. **Ties go to the least recently used** key within that frequency.
- `freq(key)` returns the key's current count, or `0` if absent. It is a read-only probe for the tests and must not change anything.

In Java and C++, keys and values are `int`s.

Edge cases the tests check:

- **Capacity 0**: every `put` is ignored and every `get` returns `-1`.
- A miss changes nothing.
- A brand-new key has the lowest possible count, so with capacity 2 it is evicted before an older key that was read three times.
- Both `get` and `put` stay O(1): a 100,000-operation run must finish quickly.

Each bucket may be an insertion-ordered container (a Python `OrderedDict`, a JavaScript `Map`): appending moves a key to the "most recent" end and the first entry is the least recent. Hand-built linked lists, as in the LRU lab, work too.

## Going further

- **It never forgets.** Yesterday's viral key keeps its huge count and squats in the cache. Production LFUs **decay** counts: Redis lowers a key's counter for every `lfu-decay-time` minutes it sits idle; TinyLFU periodically halves every counter in its sketch ("reset"), so popularity is measured over a recent window.
- **New entries are fragile.** At count 1 a new key is always the next victim, even if it is about to be hot. Redis starts new keys at `LFU_INIT_VAL` (5) rather than 0 so they get a grace period; W-TinyLFU puts new keys in a small LRU window first and only admits them to the main space if the sketch says they are hotter than the would-be victim.
- **Memory.** Exact counts cost a counter plus bucket links per key. A Count-Min sketch with 4-bit counters, as in TinyLFU, tracks frequencies for far more keys than the cache holds in a few bytes each.
- Compare hit ratios on a trace: LRU wins on recency-driven workloads (sessions, feeds), LFU on stable popularity (product catalogues, static assets).
