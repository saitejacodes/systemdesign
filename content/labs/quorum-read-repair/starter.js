class QuorumError extends Error {
  constructor(message) { super(message); this.name = "QuorumError"; }
}

class QuorumStore {
  constructor(n, w, r) {
    // TODO: throw RangeError unless n >= 1, 1 <= w <= n and 1 <= r <= n
    this.n = n; this.w = w; this.r = r;
    this.replicas = Array.from({ length: n }, () => new Map()); // per replica: key -> [version, value]
    this.down = new Array(n).fill(false);
  }

  setDown(i, down = true) { this.down[i] = down; }

  overlaps() {
    // TODO: is every read quorum guaranteed to share a replica with every write quorum?
    return false;
  }

  replicaValue(i, key) { return this.replicas[i].get(key) ?? null; }

  write(key, value, version) {
    // TODO: store on every up replica (a replica keeps only the newest version),
    // count acks, throw QuorumError if acks < w, otherwise return acks
    return 0;
  }

  read(key, order = null) {
    // TODO: contact the first r up replicas in `order` (default 0..n-1); throw QuorumError if fewer;
    // return the newest [version, value] or null, and repair contacted replicas that were stale
    return null;
  }
}

module.exports = { QuorumStore, QuorumError };
