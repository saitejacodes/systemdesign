class LamportClock {
  constructor() { this.time = 0; }

  tick() {
    // TODO: a local event increments the counter; return it
    return this.time;
  }

  send() {
    // TODO: sending is an event: tick and return the timestamp to attach
    return this.time;
  }

  receive(t) {
    // TODO: counter = max(counter, t) + 1; return it
    return this.time;
  }
}

function merge(a, b) {
  // TODO: element-wise max as a NEW array; RangeError if the lengths differ
  return [...a];
}

function compare(a, b) {
  // TODO: "equal", "before" (a <= b everywhere), "after", or "concurrent";
  // RangeError if the lengths differ
  return "equal";
}

class VectorClock {
  constructor(pid, n) { this.pid = pid; this.v = new Array(n).fill(0); }

  value() { return [...this.v]; }

  increment() {
    // TODO: bump only this process's entry; return a copy
    return this.value();
  }

  send() {
    // TODO: an increment whose copy travels with the message
    return this.value();
  }

  receive(other) {
    // TODO: merge with the received vector, then increment; return a copy
    return this.value();
  }
}

module.exports = { LamportClock, VectorClock, merge, compare };
