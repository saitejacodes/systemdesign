A **token bucket** holds up to **B** tokens (the capacity, or burst size) and gains **R** tokens per second (the refill rate). Each request spends one token, or `cost` tokens for an expensive call. With too few tokens, the request is refused. The result is the shape most APIs want: an idle client can **burst** up to B requests at once, and a busy one is held to a long-run average of **R per second**.

It is the most widely deployed limiter. AWS API Gateway documents its throttling as a token bucket with a "rate" and a "burst". Stripe's public write-up on its rate limiters says its per-user request limiter is a token bucket. Linux traffic control ships it as `tbf`, the Token Bucket Filter. Guava's `RateLimiter` stores "permits" the same way, though it makes callers wait instead of refusing them.

## The core idea: refill lazily

You never need a background timer. Store two numbers per client: `tokens` and `last` (when you last refilled). On every call, credit the time since then:

```
tokens = min(B, tokens + (now − last) × R)
last   = now
```

That is O(1) time and O(1) space per client, which is why the same logic fits in one Redis Lua script: read two fields, refill, decide, write two fields, atomically.

Invariants:

1. `0 ≤ tokens ≤ B` at all times. The `min` is what stops an idle week from banking a million tokens.
2. Tokens are **fractional**. With R = 0.5, one second after draining the bucket holds 0.5 tokens: not enough for a request, but it counts towards the next one.
3. Over any interval of length T, at most **B + R·T** requests pass. That bound is what you quote in a design review.

Worked example (from the lesson): B = 10, R = 2. A client idle for a minute sends 15 requests at once: 10 pass, 5 are refused. One second later 2 tokens have arrived, so 2 more pass.

## Your task

Implement `TokenBucket(capacity, refill_rate, now)` where `now` is a zero-argument function returning the current time in seconds. Every read of time must go through it: the tests drive a fake clock.

- The bucket **starts full** and records `now()` as its first refill time.
- `allow(cost=1)` refills, then takes `cost` tokens and returns `true` if there are enough; otherwise it returns `false` and **takes nothing**.
- `cost > capacity` is **always refused**, even with a full bucket. (Partially filling and waiting would never succeed.)
- `tokens()` refills and returns the current count without consuming anything.
- **Clock going backwards** (an NTP step, a VM migration): if `now() <= last`, add nothing and keep the later `last`. Otherwise the stretch between the old and new clock readings would be credited twice when time catches up.
- Raise `ValueError` (Python) or throw `RangeError` (JavaScript) for `cost <= 0`, `capacity <= 0` or `refill_rate < 0`.

In Java, `now` is a `DoubleSupplier` and bad arguments throw `IllegalArgumentException`. In C++, `now` is a `std::function<double()>` and bad arguments throw `std::invalid_argument`.

`refill_rate = 0` is legal: a one-shot allowance that never refills.

## Going further

- **Where the state lives.** One process: a dict of buckets. Many servers: Redis, with the refill-and-take step in a Lua script, since `GET` then `SET` lets two servers spend the same token.
- **GCRA.** The Generic Cell Rate Algorithm (from ATM networks) is a token bucket stored as **one** timestamp, the "theoretical arrival time". `redis-cell` and several API gateways use it. It avoids floating-point token counts and makes `Retry-After` a subtraction.
- **Retry-After.** When refusing, `(cost − tokens) / R` seconds is exactly how long until the request would pass. Returning it lets clients back off precisely.
- **Precision.** Repeatedly adding `elapsed × R` accumulates float error over months of uptime. Production code often stores integer micro-tokens or nanosecond timestamps instead.
- Compare with the **leaky bucket** lab, which never bursts: it queues and drains at exactly R.
