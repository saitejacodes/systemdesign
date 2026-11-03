class LFUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.entries = new Map(); // key -> { value, freq }
    this.buckets = new Map(); // freq -> Map of keys in insertion order (least recently used first)
    this.minFreq = 0;
  }

  addToBucket(f, key) {
    let b = this.buckets.get(f);
    if (!b) { b = new Map(); this.buckets.set(f, b); }
    b.set(key, true);
  }

  // Move key from bucket f to bucket f + 1, as its most recent entry.
  touch(key) {
    const e = this.entries.get(key);
    const f = e.freq;
    const b = this.buckets.get(f);
    b.delete(key);
    if (b.size === 0) {
      this.buckets.delete(f);
      if (this.minFreq === f) this.minFreq = f + 1; // the key is about to land there
    }
    e.freq = f + 1;
    this.addToBucket(f + 1, key);
  }

  get(key) {
    const e = this.entries.get(key);
    if (!e) return -1;
    this.touch(key);
    return e.value;
  }

  put(key, value) {
    if (this.capacity <= 0) return;
    const e = this.entries.get(key);
    if (e) { e.value = value; this.touch(key); return; }
    if (this.entries.size >= this.capacity) {
      // Lowest frequency first; within it, the least recently used key (the Map's first entry).
      const b = this.buckets.get(this.minFreq);
      const victim = b.keys().next().value;
      b.delete(victim);
      if (b.size === 0) this.buckets.delete(this.minFreq);
      this.entries.delete(victim);
    }
    this.entries.set(key, { value, freq: 1 });
    this.addToBucket(1, key);
    this.minFreq = 1;
  }

  freq(key) {
    const e = this.entries.get(key);
    return e ? e.freq : 0;
  }
}

module.exports = { LFUCache };
