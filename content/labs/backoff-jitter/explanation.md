When a call fails, retrying immediately is usually wrong: if the failure was overload, a wave of instant retries makes it worse. **Exponential backoff** waits longer after each failure. But clients that failed together, after the same blip, back off by the same amounts and retry *together*, in synchronised spikes. **Jitter** randomises each wait so the retries spread out.

Marc Brooker's 2015 AWS Architecture Blog post "Exponential Backoff And Jitter" compared the variants in a simulation of many clients contending for one resource. With `base` the first delay, `cap` the maximum and `attempt` counting from 0:

```text
No jitter:           sleep = min(cap, base * 2^attempt)
Full jitter:         sleep = random_between(0, min(cap, base * 2^attempt))
Equal jitter:        temp  = min(cap, base * 2^attempt)
                     sleep = temp / 2 + random_between(0, temp / 2)
Decorrelated jitter: sleep = min(cap, random_between(base, previous_sleep * 3))
```

Plain backoff did clearly worst. Full jitter and decorrelated jitter both did well, with full jitter doing the least total work; equal jitter guarantees a minimum wait at the cost of slightly more clustering. The AWS SDKs' standard retry mode uses exponential backoff with jitter. With `base = 100 ms` and `cap = 5 s`, attempt 3 draws from 0–800 ms (average 400 ms): if 10,000 clients fail at once, full jitter spreads them over 800 ms instead of sending all 10,000 at t + 800 ms.

The cap matters as much as the curve. Without it, attempt 20 waits 100 ms × 2^20, about 29 hours. Jitter also never fixes **how many** retries arrive, only when: amplification across layers and retry budgets are separate controls.

## Your task

Times are plain numbers (the tests use milliseconds). `rand` is a zero-argument function returning a float in [0, 1); the tests inject constants (`0`, `0.5`, `1`) for exact answers and a seeded generator for distribution checks, so never call `random.random`/`Math.random` directly.

- `exponential(attempt, base, cap)`: `min(cap, base * 2^attempt)`. It must still return `cap` for a huge attempt such as 2,000 (no overflow error).
- `full_jitter(attempt, base, cap, rand)` (`fullJitter`): `rand() * window`.
- `equal_jitter(attempt, base, cap, rand)` (`equalJitter`): `window / 2 + rand() * window / 2`.
- `decorrelated_jitter(prev, base, cap, rand)` (`decorrelatedJitter`): `min(cap, base + rand() * (3 * prev - base))`. The caller keeps `prev`, starting from `base`.
- `retry(fn, max_attempts, sleep, *, base=100, cap=5000, rand=random.random, retryable=None)`; in JavaScript `retry(fn, maxAttempts, sleep, { base, cap, rand, retryable })`:
  - calls `fn()` up to `max_attempts` times in total and returns its first successful result;
  - between attempts calls `sleep(full_jitter(attempt, …))`, where `attempt` is the index of the attempt that just failed (so the first retry waits in the `base` window). `sleep` is injected: the tests pass a function that records its argument;
  - retries only errors for which `retryable(e)` is true. The default retries `RetryableError` only; anything else (think `400` or a validation failure) is raised at once with no sleep;
  - after the last attempt, raises the last error unchanged;
  - `max_attempts < 1` raises `ValueError` (`RangeError` in JavaScript).
In Java the functions are static methods of `Backoff`, the error is `RetryableException`, and `retry` takes `base`, `cap` and `rand` positionally (plus an optional predicate); C++ has the same signatures as free functions, with `RetryableError` and `std::invalid_argument`.

## Going further

Production retry policies add what this lab leaves out. Honour **`Retry-After`** on a `429` or `503` instead of your own curve. Check the **deadline** before sleeping: a retry that cannot finish before the caller gives up is wasted load. Retry at **one layer** only, because attempts multiply (3 attempts at each of 3 layers is 27 calls at the bottom). Add a **retry budget**: Google's SRE book describes capping retries at about 10% of a client's requests, alongside a per-request limit of three attempts, so a struggling service sees at most 1.1× normal load. Above all, retry only **idempotent** operations, or send an idempotency key, because a timeout tells you only that you stopped waiting, not that nothing happened.
