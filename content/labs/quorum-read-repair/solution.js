class QuorumError extends Error {
  constructor(message) { super(message); this.name = "QuorumError"; }
}

class QuorumStore {
  constructor(n, w, r) {
    if (!(n >= 1 && w >= 1 && w <= n && r >= 1 && r <= n)) throw new RangeError("need n >= 1, 1 <= w <= n and 1 <= r <= n");
    this.n = n; this.w = w; this.r = r;
    this.replicas = Array.from({ length: n }, () => new Map()); // per replica: key -> [version, value]
    this.down = new Array(n).fill(false);
  }

  setDown(i, down = true) { this.down[i] = down; }

  // Pigeonhole: a read quorum and a write quorum must share a replica iff R + W > N.
  overlaps() { return this.r + this.w > this.n; }

  replicaValue(i, key) { return this.replicas[i].get(key) ?? null; }

  // A replica keeps whichever version is newest; an older or equal write is acknowledged but ignored.
  store(i, key, version, value) {
    const cur = this.replicas[i].get(key);
    if (cur === undefined || version > cur[0]) this.replicas[i].set(key, [version, value]);
  }

  write(key, value, version) {
    let acks = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.down[i]) { this.store(i, key, version, value); acks++; }
    }
    // Replicas that did accept the write keep it even if the quorum fails: there is no rollback.
    if (acks < this.w) throw new QuorumError(`write got ${acks} acks, needs ${this.w}`);
    return acks;
  }

  read(key, order = null) {
    const ids = order ?? [...Array(this.n).keys()];
    const contacted = ids.filter((i) => !this.down[i]).slice(0, this.r);
    if (contacted.length < this.r) throw new QuorumError(`read reached ${contacted.length} replicas, needs ${this.r}`);
    const answers = contacted.map((i) => this.replicas[i].get(key));
    let newest = null;
    for (const a of answers) if (a !== undefined && (newest === null || a[0] > newest[0])) newest = a;
    if (newest === null) return null;
    // Read repair: push the newest version to every contacted replica that returned something older.
    contacted.forEach((i, k) => {
      const a = answers[k];
      if (a === undefined || a[0] < newest[0]) this.store(i, key, newest[0], newest[1]);
    });
    return [newest[0], newest[1]];
  }
}

module.exports = { QuorumStore, QuorumError };
