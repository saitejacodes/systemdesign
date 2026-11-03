// A bounded FIFO queue that forwards one request every 1 / leakRate seconds.
class LeakyBucket {
  constructor(capacity, leakRate, now) {
    // TODO: throw RangeError unless capacity >= 1 and leakRate > 0
    this.capacity = capacity;
    this.interval = 1 / leakRate;
    this.now = now;
    this.queue = []; // [departureTime, request]
    this.out = [];   // requests that have leaked out but not been drained yet
  }

  leak() {
    // TODO: read the clock (never let it go backwards) and move every queued entry
    // whose departure time has passed into this.out
  }

  offer(request) {
    // TODO: leak first; drop (return false) if capacity requests are waiting;
    // otherwise schedule its departure one interval after the previous departure
    // (or after now, if the bucket has been idle) and return true
    this.queue.push([0, request]);
    return true;
  }

  size() {
    // TODO: leak first, then count the waiting requests
    return this.queue.length;
  }

  drain() {
    // TODO: leak first, then return and clear the [departureTime, request] pairs that have left
    return [];
  }
}

module.exports = { LeakyBucket };
