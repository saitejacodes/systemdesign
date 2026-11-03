Twitter built **Snowflake** in 2010 when moving tweet storage off MySQL left it without a central counter for IDs. Each generator mints IDs locally, with no network call, by packing three fields into one 64-bit integer:

| Bits | Field | Range |
|---|---|---|
| 1 | sign | always 0, so the ID is a positive signed 64-bit integer |
| 41 | milliseconds since a custom epoch | 2^41 ms ≈ 69.7 years |
| 10 | worker (machine) ID | 0 to 1,023 |
| 12 | sequence within one millisecond | 0 to 4,095 |

```text
id = (now_ms - epoch) << 22 | worker_id << 12 | sequence
```

Because time occupies the high bits, IDs from one worker sort in creation order, and IDs from different workers sort *roughly* by time (k-sortable: only as well as their clocks agree). One worker can mint 4,096 IDs per millisecond, about 4.1 million a second. Twitter's epoch is `1288834974657` (2010-11-04 01:42:54.657 UTC); Discord uses the same layout counted from the first moment of 2015. Choosing an epoch near launch day is what makes 41 bits last decades.

Uniqueness rests on two invariants: **no two live generators share a worker ID**, and **one generator never issues the same (timestamp, sequence) pair twice**. The second is where the clock bites. If the wall clock steps backwards (NTP correcting a fast clock, a VM resuming from a pause) and the generator trusts it, it walks through milliseconds it already used, resets the sequence to 0 and re-issues old IDs. Nothing notices until an insert fails on a duplicate key.

## Your task

Implement `Snowflake(worker_id, now, epoch=TWITTER_EPOCH)` (`new Snowflake(workerId, now, epoch)` in JavaScript), where `now()` returns the current Unix time in integer milliseconds. The tests pass a fake clock, so read time **only** through `now()`.

- `next_id()` (`nextId()`) returns the next ID:
  - clock **behind** the last timestamp used → raise `ClockMovedBackwardsError` (Twitter's original generator also refused);
  - **same** millisecond → increment the sequence; if it overflows past 4,095, call `now()` repeatedly until it returns a later millisecond, then use sequence 0 there;
  - **new** millisecond → sequence 0.
- After a backwards error the generator keeps its state, so once the clock catches up it continues from where it was, without duplicates.
- `parse(id, epoch=TWITTER_EPOCH)` returns `{"timestamp", "worker_id", "sequence"}` (`{ timestamp, workerId, sequence }` in JavaScript), with `timestamp` in Unix milliseconds.
- A worker ID outside 0..1023, or a clock reading before the epoch (or 2^41 ms after it), raises `ValueError` (`RangeError` in JavaScript).

Java uses `long` IDs, a `LongSupplier` clock, `ClockMovedBackwardsException` and `IllegalArgumentException`, and `Snowflake.parse` returns a `Parts` record; C++ uses `int64_t`, `ClockMovedBackwards` and `std::invalid_argument`.

**JavaScript note:** a Snowflake ID uses 63 bits, but a JavaScript `number` is a 64-bit float that is exact only up to 2^53 − 1. An ID minted in 2026 is about 2^61, so `Number` arithmetic would silently round it and produce duplicates. Do all ID arithmetic in **BigInt** (`1n << 22n`, `BigInt(workerId)`) and return a BigInt; `parse` may return plain numbers, since each field fits easily. The same limit is why Twitter's API added string `id_str` fields and Discord's API sends IDs as strings: serialise 64-bit IDs as strings in JSON.

## Going further

Refusing is correct but turns a clock step into an outage for that worker. Refinements: **wait out** small regressions and refuse only big ones, or issue from `max(now, last)`, borrowing from the future until real time catches up. Prevent most steps at the source by configuring NTP to slew rather than step, and persist the last timestamp (or sleep briefly on startup) so a restart can't hide a regression that happened while the process was down.

Worker IDs need an allocator once machines are dynamic: Twitter's Snowflake used ZooKeeper; a lease in etcd, ZooKeeper or a database row works, and a generator that loses its lease must stop minting. The bit split is a tunable: Instagram's 2012 scheme used 41 timestamp bits, 13 shard bits and 10 sequence bits, generated inside each PostgreSQL shard, so an ID also routes a lookup to its shard.
