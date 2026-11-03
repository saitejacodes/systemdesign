A leaky bucket is a queue with a hole in the bottom. Requests are poured in at whatever rate clients send them; they drip out at exactly **R per second**; and if the bucket is already holding **capacity** requests, a new one overflows and is dropped. Whatever the input looks like, the output is an even stream with at least 1 / R seconds between departures.

That is the difference from a **token bucket**. Both cap the long-run rate at R, and both absorb a burst up to a size limit. But a token bucket with a full bucket of B tokens lets B requests through *at once*: the burst reaches the backend. A leaky bucket accepts the burst and then releases it one interval at a time: the burst becomes queueing delay. Reach for it when the thing behind the limiter needs a smooth rate (a legacy service, an outbound email or SMS provider with a strict per-second quota), and avoid it for interactive APIs, where a request waiting several intervals in a queue feels like an outage. NGINX's `limit_req` module describes itself as using the leaky bucket method: with `burst=N`, excess requests wait in a queue of N and are released at the configured rate, and `nodelay` changes it to admit the burst immediately.

There are two readings of the name. The **meter** form keeps only a water level that drains continuously and rejects a request that would overflow it; ATM networks' Generic Cell Rate Algorithm is this form, and it accepts exactly the same requests as a token bucket. This lab builds the **queue** form, which also controls *when* each accepted request leaves.

**No timer is needed.** When a request is accepted at time *t*, its departure time is already known:

`departure = max(t, previous departure) + 1 / R`

An idle bucket releases a new request one interval after it arrives; a busy one schedules it one interval after the request in front. Departure times only increase, so on every call you read the clock and release entries from the front of the queue until the next one is still in the future.

## Your task

Implement `LeakyBucket(capacity, leak_rate, now)` (JavaScript: `leakRate`), where `now` is a zero-argument function returning seconds:

- Raise `ValueError` (JavaScript: `RangeError`) unless `capacity ≥ 1` and `leak_rate > 0`.
- `offer(request)` first releases everything due by now. If `capacity` requests are still waiting, return `False` and drop it; otherwise schedule it with the formula above and return `True`.
- `size()` returns how many requests are waiting after releasing the due ones.
- `drain()` returns the requests that have left since the last `drain`, as `(departure_time, request)` pairs (JavaScript: `[departureTime, request]`) in FIFO order, and forgets them. A request leaves when its departure time is ≤ now.
- If the clock steps backwards, treat it as standing still: nothing leaks and nothing raises.

In Java and C++ requests are strings, the clock is a `DoubleSupplier` / `std::function<double()>`, and `drain` returns `Departure(time, request)` records / `(time, request)` pairs.

The tests check the spacing of departures, overflow drops, an idle period emptying the bucket, arrivals at exactly the leak rate never being dropped even with capacity 1, and 100,000 offers.

## Going further

A real leaky bucket sits in front of a worker that does the forwarding; here `drain()` stands in for it. Capacity sets the worst-case added latency, capacity ÷ R seconds, so size it from the delay clients will tolerate, not just from memory. In a distributed deployment the queue lives in one place (a gateway instance or a per-tenant worker), because a shared queue across nodes needs coordination on every request. Compare with the token bucket lab: same long-run rate, but the token bucket passes bursts through and needs no queue.
