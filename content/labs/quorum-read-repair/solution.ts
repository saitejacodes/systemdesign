export type Versioned<V> = [version: number, value: V];

export class QuorumError extends Error {
  constructor(message: string) { super(message); this.name = "QuorumError"; }
}

export class QuorumStore<K = unknown, V = unknown> {
  private replicas: Map<K, Versioned<V>>[];
  private down: boolean[];

  constructor(readonly n: number, readonly w: number, readonly r: number) {
    if (!(n >= 1 && w >= 1 && w <= n && r >= 1 && r <= n)) throw new RangeError("need n >= 1, 1 <= w <= n and 1 <= r <= n");
    this.replicas = Array.from({ length: n }, () => new Map<K, Versioned<V>>());
    this.down = new Array<boolean>(n).fill(false);
  }

  setDown(i: number, down = true): void { this.down[i] = down; }

  // Pigeonhole: a read quorum and a write quorum must share a replica iff R + W > N.
  overlaps(): boolean { return this.r + this.w > this.n; }

  replicaValue(i: number, key: K): Versioned<V> | null { return this.replicas[i].get(key) ?? null; }

  // A replica keeps whichever version is newest; an older or equal write is acknowledged but ignored.
  private store(i: number, key: K, version: number, value: V): void {
    const cur = this.replicas[i].get(key);
    if (cur === undefined || version > cur[0]) this.replicas[i].set(key, [version, value]);
  }

  write(key: K, value: V, version: number): number {
    let acks = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.down[i]) { this.store(i, key, version, value); acks++; }
    }
    // Replicas that did accept the write keep it even if the quorum fails: there is no rollback.
    if (acks < this.w) throw new QuorumError(`write got ${acks} acks, needs ${this.w}`);
    return acks;
  }

  read(key: K, order: number[] | null = null): Versioned<V> | null {
    const ids = order ?? [...Array(this.n).keys()];
    const contacted = ids.filter((i) => !this.down[i]).slice(0, this.r);
    if (contacted.length < this.r) throw new QuorumError(`read reached ${contacted.length} replicas, needs ${this.r}`);
    const answers = contacted.map((i) => this.replicas[i].get(key));
    let newest: Versioned<V> | null = null;
    for (const a of answers) if (a !== undefined && (newest === null || a[0] > newest[0])) newest = a;
    if (newest === null) return null;
    const best: Versioned<V> = newest;
    // Read repair: push the newest version to every contacted replica that returned something older.
    contacted.forEach((i, k) => {
      const a = answers[k];
      if (a === undefined || a[0] < best[0]) this.store(i, key, best[0], best[1]);
    });
    return [best[0], best[1]];
  }
}
