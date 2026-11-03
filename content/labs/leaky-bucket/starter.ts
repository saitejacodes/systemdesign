export type Departure<R> = [departureTime: number, request: R];

// A bounded FIFO queue that forwards one request every 1 / leakRate seconds.
export class LeakyBucket<R = unknown> {
  private readonly interval: number;
  private queue: Departure<R>[] = [];
  private out: Departure<R>[] = []; // requests that have leaked out but not been drained yet

  constructor(private readonly capacity: number, leakRate: number, private readonly now: () => number) {
    // TODO: throw RangeError unless capacity >= 1 and leakRate > 0
    this.interval = 1 / leakRate;
  }

  private leak(): void {
    // TODO: read this.now() (never let it go backwards) and move every queued entry
    // whose departure time has passed into this.out
  }

  offer(request: R): boolean {
    // TODO: leak first; drop (return false) if capacity requests are waiting;
    // otherwise schedule its departure one interval after the previous departure
    // (or after now, if the bucket has been idle) and return true
    this.queue.push([0, request]);
    return true;
  }

  size(): number {
    // TODO: leak first, then count the waiting requests
    return this.queue.length;
  }

  drain(): Departure<R>[] {
    // TODO: leak first, then return and clear the [departureTime, request] pairs that have left
    return [];
  }
}
