// A bounded FIFO queue that forwards one request every 1 / leakRate seconds.
class LeakyBucket {
  constructor(capacity, leakRate, now) {
    if (!(capacity >= 1 && leakRate > 0)) throw new RangeError("capacity must be >= 1 and leakRate > 0");
    this.capacity = capacity;
    this.interval = 1 / leakRate;
    this.now = now;
    this.queue = []; // [departureTime, request], departure times strictly increasing
    this.head = 0;   // index of the first waiting entry (avoids O(n) shift)
    this.out = [];   // requests that have leaked out but not been drained yet
    this.lastDeparture = -Infinity;
    this.t = -Infinity;
  }

  leak() {
    this.t = Math.max(this.t, this.now()); // a clock that steps backwards is treated as standing still
    while (this.head < this.queue.length && this.queue[this.head][0] <= this.t) this.out.push(this.queue[this.head++]);
    if (this.head > 1024 && this.head * 2 > this.queue.length) { this.queue = this.queue.slice(this.head); this.head = 0; }
  }

  offer(request) {
    this.leak();
    if (this.queue.length - this.head >= this.capacity) return false; // overflow: the bucket is full, drop it
    // Leave one interval after the previous departure, or one interval after arriving if the bucket was idle.
    const departure = Math.max(this.t, this.lastDeparture) + this.interval;
    this.queue.push([departure, request]);
    this.lastDeparture = departure;
    return true;
  }

  size() {
    this.leak();
    return this.queue.length - this.head;
  }

  drain() {
    this.leak();
    const out = this.out;
    this.out = [];
    return out;
  }
}

module.exports = { LeakyBucket };
