class LamportClock {
  constructor() { this.time = 0; }

  /** A local event. */
  tick() { return ++this.time; }

  /** Sending is an event too; the returned timestamp travels with the message. */
  send() { return this.tick(); }

  /** Jump past the sender's timestamp so the receive is ordered after the send. */
  receive(t) { this.time = Math.max(this.time, t) + 1; return this.time; }
}

function check(a, b) {
  if (a.length !== b.length) throw new RangeError(`vector lengths differ: ${a.length} vs ${b.length}`);
}

/** Element-wise maximum: everything either side has seen. Inputs are not modified. */
function merge(a, b) {
  check(a, b);
  return a.map((x, i) => Math.max(x, b[i]));
}

function compare(a, b) {
  check(a, b);
  const aLeB = a.every((x, i) => x <= b[i]);
  const bLeA = a.every((x, i) => b[i] <= x);
  if (aLeB && bLeA) return "equal";
  if (aLeB) return "before"; // a happened before b
  if (bLeA) return "after";
  return "concurrent";       // each has seen something the other has not
}

class VectorClock {
  constructor(pid, n) { this.pid = pid; this.v = new Array(n).fill(0); }

  value() { return [...this.v]; } // a copy, so callers can't mutate our state

  /** A local event: bump only our own entry. */
  increment() { this.v[this.pid]++; return this.value(); }

  send() { return this.increment(); }

  receive(other) { this.v = merge(this.v, other); return this.increment(); }
}

module.exports = { LamportClock, VectorClock, merge, compare };
