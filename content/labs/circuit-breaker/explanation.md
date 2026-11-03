A **circuit breaker** wraps calls to one dependency and stops making them when the dependency is clearly broken. A slow or dead service otherwise ties up a thread and a connection per caller until the caller runs out of both; with the breaker open, calls are rejected in microseconds (**failing fast**) and the caller runs a fallback instead. Michael Nygard popularised the pattern in *Release It!* (2007); Netflix's Hystrix made it standard on the JVM, and Resilience4j is its maintained successor.

The breaker is a three-state machine:

- **Closed.** Calls pass through and outcomes are recorded. Enough failures trip it to **open**.
- **Open.** Calls never reach the dependency; each is rejected with a specific error. After a cooldown (Resilience4j's default wait is 60 s) the breaker moves to **half-open**.
- **Half-open.** A limited number of trial calls are let through; everything else is still rejected. If the trials succeed, the breaker closes. If one fails, it opens again for a fresh cooldown.

Half-open is the part home-grown breakers skip and the part that matters most. A breaker that simply closes after the cooldown sends full traffic at a service that has just restarted with cold caches, knocks it over again, and flaps every cooldown period. A few trial calls let a recovering service prove itself on a trickle.

This lab trips on **consecutive failures** ("open after 5 failures in a row"), the simplest trip threshold. Resilience4j's default instead uses a failure *rate* over a sliding window of the last 100 calls, with a minimum number of calls before it evaluates.

## Your task

Implement `CircuitBreaker(failure_threshold=5, reset_timeout=30.0, half_open_max_calls=1, now=time.monotonic)` (in JavaScript `new CircuitBreaker({ failureThreshold, resetTimeout, halfOpenMaxCalls, now })`). `now()` returns seconds; the tests inject a fake clock, so never read the real time directly.

- `state()` returns `"closed"`, `"open"` or `"half_open"`. Open becomes half-open once `now() - opened_at >= reset_timeout`; compute that lazily here, with no timers.
- `allow_request()` (`allowRequest`) asks permission for one call. It raises `CircuitOpenError` when open, and when half-open with `half_open_max_calls` trials already admitted. Otherwise it returns, counting a trial if half-open.
- `record_success()` / `record_failure()` (`recordSuccess` / `recordFailure`) report the outcome:
  - closed: a success resets the consecutive-failure count; a failure increments it, and reaching `failure_threshold` opens the breaker at the current time;
  - half-open: any failure reopens it and restarts the cooldown; `half_open_max_calls` successes close it with a zeroed failure count.
- `call(fn)` does all of this around `fn()`: it raises `CircuitOpenError` **without calling `fn`** when not permitted, returns `fn()`'s result, and re-raises `fn`'s own exception unchanged after recording it.

In Java and C++ the constructor takes `(failureThreshold, resetTimeout, halfOpenMaxCalls, now)` positionally; Java's rejection is `CircuitOpenException`.

Rejections are not failures: they neither count towards the threshold nor extend the cooldown.

## Going further

Choose **what counts as a failure**. Timeouts must count, since a hanging dependency is the main thing a breaker protects you from. Client errors such as `400` or `404` should not, or one caller's bad input cuts everyone off from a healthy service. Resilience4j lets you list recorded and ignored exceptions, and also trips on a **slow-call rate**, catching degradation before calls start timing out.

**Place retries outside the breaker** so each attempt is recorded, and never retry a rejection (Resilience4j's `CallNotPermittedException`): it only spins. A breaker also reacts no faster than your timeout: with a 30 s timeout nothing trips for 30 s.

Breakers live per caller instance, so 50 instances with 10 trial calls each send 500 probes to a recovering service. A per-dependency breaker can't isolate one bad replica out of ten either: that is Envoy's **outlier detection**, which ejects individual hosts. For smoother behaviour than a hard switch, Google's SRE book describes **client-side adaptive throttling**, which rejects locally with probability `max(0, (requests − K·accepts) / (requests + 1))`.
