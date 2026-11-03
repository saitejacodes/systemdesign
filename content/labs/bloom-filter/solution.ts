const FNV_OFFSET = 0x811c9dc5; // seed for h1 (the standard FNV-1a offset basis)
const FNV_PRIME = 0x01000193;  // also used as the seed for h2

// FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32.
export function fnv1a32(data: string, seed: number = FNV_OFFSET): number {
  let h = seed >>> 0;
  for (const b of new TextEncoder().encode(data)) h = Math.imul(h ^ b, FNV_PRIME) >>> 0;
  return h;
}

// MurmurHash3's 32-bit finalizer, so every input bit affects every output bit.
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Bits m and hash count k for n items at false-positive rate p.
export function optimalParams(n: number, p: number): [number, number] {
  if (!(n >= 1) || !(p > 0 && p < 1)) throw new RangeError("need n >= 1 and 0 < p < 1");
  const m = Math.ceil((-n * Math.log(p)) / Math.log(2) ** 2);
  const k = Math.max(1, Math.round((m / n) * Math.log(2)));
  return [m, k];
}

export class BloomFilter {
  readonly m: number;
  readonly k: number;
  private bits: Uint8Array;

  constructor(n: number, p: number) {
    [this.m, this.k] = optimalParams(n, p);
    this.bits = new Uint8Array(Math.ceil(this.m / 8));
  }

  // Kirsch–Mitzenmacher: k positions from two hashes, g_i = (h1 + i * h2) mod m.
  // h1 + i * h2 stays below 2^53, so plain number arithmetic is exact.
  indexes(item: string): number[] {
    const h1 = fmix32(fnv1a32(item, FNV_OFFSET));
    const h2 = fmix32(fnv1a32(item, FNV_PRIME));
    const out: number[] = [];
    for (let i = 0; i < this.k; i++) out.push((h1 + i * h2) % this.m);
    return out;
  }

  add(item: string): void {
    for (const i of this.indexes(item)) this.bits[i >>> 3] |= 1 << (i & 7);
  }

  // One clear bit proves the item was never added; all set means "probably".
  mightContain(item: string): boolean {
    return this.indexes(item).every((i) => (this.bits[i >>> 3] & (1 << (i & 7))) !== 0);
  }

  // (1 - e^(-k * count / m))^k: the false-positive rate after `count` insertions.
  expectedFpRate(count: number): number {
    return (1 - Math.exp((-this.k * count) / this.m)) ** this.k;
  }
}
