export type Departure<R> = [departureTime: number, request: R];

// A bounded FIFO queue that forwards one request every 1 / leakRate seconds.
export class LeakyBucket<R = unknown> {
  private readonly interval: number;
  private queue: Departure<R>[] = []; // departure times strictly increasing
  private head = 0;                   // index of the first waiting entry (avoids O(n) shift)
  private out: Departure<R>[] = [];   // requests that have leaked out but not been drained yet
  private lastDeparture = -Infinity;
  private t = -Infinity;

  constructor(private readonly capacity: number, leakRate: number, private readonly now: () => number) {
    if (!(capacity >= 1 && leakRate > 0)) throw new RangeError("capacity must be >= 1 and leakRate > 0");
    this.interval = 1 / leakRate;
  }

  private leak(): void {
    this.t = Math.max(this.t, this.now()); // a clock that steps backwards is treated as standing still
    while (this.head < this.queue.length && this.queue[this.head][0] <= this.t) this.out.push(this.queue[this.head++]);
    if (this.head > 1024 && this.head * 2 > this.queue.length) { this.queue = this.queue.slice(this.head); this.head = 0; }
  }

  offer(request: R): boolean {
    this.leak();
    if (this.queue.length - this.head >= this.capacity) return false; // overflow: the bucket is full, drop it
    // Leave one interval after the previous departure, or one interval after arriving if the bucket was idle.
    const departure = Math.max(this.t, this.lastDeparture) + this.interval;
    this.queue.push([departure, request]);
    this.lastDeparture = departure;
    return true;
  }

  size(): number {
    this.leak();
    return this.queue.length - this.head;
  }

  drain(): Departure<R>[] {
    this.leak();
    const out = this.out;
    this.out = [];
    return out;
  }
}
