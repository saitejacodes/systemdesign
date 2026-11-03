A **fixed window** limiter counts requests per aligned clock window (`10:05:00–10:05:59`) and resets at each boundary. It is one counter per client, but it has a well-known hole: with a limit of 100 a minute, a client can send 100 requests at 10:05:59 and another 100 at 10:06:00, **200 requests in two seconds**. A **sliding window log** fixes that by storing every timestamp, at the cost of memory that grows with the limit.

The **sliding window counter** sits between them. Keep the counts of the **previous** and **current** fixed windows, and assume the previous window's requests were spread evenly across it. The share of it that still overlaps the sliding window `(t − window, t]` is `1 − elapsed / window`, so:

```
estimate = prev × (1 − elapsed / window) + curr
```

where `elapsed = t − start` and `start = floor(t / window) × window`. Cloudflare described exactly this design for its rate limiting in 2017 and reported that, measured against an exact count over 400 million requests, only 0.003% were wrongly allowed or limited.

Worked example (from the lesson): limit 100 a minute, 80 requests last minute, 30 so far this minute, 15 s (25%) in. Estimate = 80 × 0.75 + 30 = **90**, so the request is allowed. At 45 s in with 51 current requests, it is 80 × 0.25 + 51 = 71.

Invariants:

1. State is O(1) per client: `prev`, `curr` and the current window's start.
2. When `t` moves into the **next** window, `prev ← curr, curr ← 0`. When it **skips** a whole window or more, `prev ← 0` too: nothing from that far back overlaps.
3. At a boundary (`elapsed = 0`) the previous window counts in full, so the 200-in-two-seconds burst is held to 100.

## Your task

Implement `SlidingWindowCounter(limit, window)`; timestamps are passed explicitly in seconds.

- `estimate(t)` rolls the windows forward to `t` and returns the weighted count **before** any new request.
- `allow(t)` returns `false` if `estimate(t) ≥ limit`, and **does not count** a refused request. Otherwise it counts the request in the current window and returns `true`.
- Windows are aligned to multiples of `window` (`floor(t / window) × window`).
- Timestamps must be non-decreasing: a `t` earlier than the last one raises `ValueError` (Python) or throws `RangeError` (JavaScript). So do `limit ≤ 0` and `window ≤ 0`. Java throws `IllegalArgumentException` and C++ throws `std::invalid_argument` in both cases.

`FixedWindowCounter(limit, window)` is provided, already complete. The tests run the same boundary burst through both so you can see the difference. With limit 1, one request at t = 0 blocks t = 30 and t = 60 (weight 1.0 at the boundary), and t = 90 passes (weight 0.5).

## Going further

- **The approximation's error.** It is exact for evenly spread traffic and wrong for bursty traffic inside the previous window: 100 requests at the very end of it are only "half-forgotten" halfway through the current one. It can err either way, which is why it is described as approximate, not as "never over the limit".
- **Distributed.** Two counters per key map onto Redis directly: `INCR` the current window's key and `GET` the previous one, with a TTL of two windows so old keys clean themselves up. The read of `prev` and the increment of `curr` race slightly between servers; a Lua script makes them atomic.
- **Precision vs cost.** Smaller sub-windows (say 6 × 10 s in a minute) shrink the error further at the cost of more counters, converging on the sliding log.
- **Refused requests.** Counting refused requests too punishes clients that keep hammering: they never get back under the limit until they stop. Some APIs want that; most don't.
