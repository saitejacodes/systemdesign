interface Entry<V> { value: V; freq: number }

export class LFUCache<K = unknown, V = unknown> {
  private entries = new Map<K, Entry<V>>();
  private buckets = new Map<number, Map<K, true>>(); // freq -> keys in insertion order (least recently used first)
  private minFreq = 0;

  constructor(private capacity: number) {}

  private addToBucket(f: number, key: K): void {
    let b = this.buckets.get(f);
    if (!b) { b = new Map(); this.buckets.set(f, b); }
    b.set(key, true);
  }

  // Move key from bucket f to bucket f + 1, as its most recent entry.
  private touch(key: K, e: Entry<V>): void {
    const f = e.freq;
    const b = this.buckets.get(f)!;
    b.delete(key);
    if (b.size === 0) {
      this.buckets.delete(f);
      if (this.minFreq === f) this.minFreq = f + 1; // the key is about to land there
    }
    e.freq = f + 1;
    this.addToBucket(f + 1, key);
  }

  get(key: K): V | -1 {
    const e = this.entries.get(key);
    if (!e) return -1;
    this.touch(key, e);
    return e.value;
  }

  put(key: K, value: V): void {
    if (this.capacity <= 0) return;
    const e = this.entries.get(key);
    if (e) { e.value = value; this.touch(key, e); return; }
    if (this.entries.size >= this.capacity) {
      // Lowest frequency first; within it, the least recently used key (the Map's first entry).
      const b = this.buckets.get(this.minFreq)!;
      const victim = b.keys().next().value as K;
      b.delete(victim);
      if (b.size === 0) this.buckets.delete(this.minFreq);
      this.entries.delete(victim);
    }
    this.entries.set(key, { value, freq: 1 });
    this.addToBucket(1, key);
    this.minFreq = 1;
  }

  freq(key: K): number {
    return this.entries.get(key)?.freq ?? 0;
  }
}
