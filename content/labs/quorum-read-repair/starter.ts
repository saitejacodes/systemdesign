export type Versioned<V> = [version: number, value: V];

export class QuorumError extends Error {
  constructor(message: string) { super(message); this.name = "QuorumError"; }
}

export class QuorumStore<K = unknown, V = unknown> {
  private replicas: Map<K, Versioned<V>>[];
  private down: boolean[];

  constructor(readonly n: number, readonly w: number, readonly r: number) {
    // TODO: throw RangeError unless n >= 1, 1 <= w <= n and 1 <= r <= n
    this.replicas = Array.from({ length: n }, () => new Map<K, Versioned<V>>());
    this.down = new Array<boolean>(n).fill(false);
  }

  setDown(i: number, down = true): void { this.down[i] = down; }

  overlaps(): boolean {
    // TODO: is every read quorum guaranteed to share a replica with every write quorum?
    return false;
  }

  replicaValue(i: number, key: K): Versioned<V> | null { return this.replicas[i].get(key) ?? null; }

  write(key: K, value: V, version: number): number {
    // TODO: store on every up replica (a replica keeps only the newest version),
    // count acks, throw QuorumError if acks < w, otherwise return acks
    return 0;
  }

  read(key: K, order: number[] | null = null): Versioned<V> | null {
    // TODO: contact the first r up replicas in `order` (default 0..n-1); throw QuorumError if fewer;
    // return the newest [version, value] or null, and repair contacted replicas that were stale
    return null;
  }
}
