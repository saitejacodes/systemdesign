/**
 * Circuit breaker for one model replica.
 *
 *   closed     normal. Count consecutive failures; FAILURE_THRESHOLD in a row opens the breaker.
 *   open       the router skips this replica for COOLDOWN_MS; requests go elsewhere instead of timing out here.
 *   half-open  after the cooldown, exactly one request is let through as a probe. Success closes the breaker;
 *              failure opens it again for another cooldown.
 *
 * "Failure" includes slow: a first token slower than SLOW_TTFT_MS counts as a failure. A replica that is up, passes
 * /health and answers 5x slower than its peers (a gray failure: CPU throttled, a noisy neighbour, a bad disk) never
 * trips an error-only breaker, and least-outstanding routing can even prefer it once its queue drains.
 */
export type BreakerState = "closed" | "open" | "half_open";

export class Breaker {
  state: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;

  constructor(
    readonly name: string,
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  /** May the router send a request here now? In half-open, only one probe at a time. */
  allow(now = Date.now()): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open" && now - this.openedAt >= this.cooldownMs) this.state = "half_open";
    if (this.state === "half_open" && !this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }
    return false;
  }

  success(): void {
    this.failures = 0;
    this.probeInFlight = false;
    this.state = "closed";
  }

  failure(now = Date.now()): void {
    this.probeInFlight = false;
    this.failures++;
    if (this.state === "half_open" || this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = now;
    }
  }

  /** A request that never ran (shed by admission, client cancelled) says nothing about health: free the probe. */
  release(): void {
    this.probeInFlight = false;
  }
}
