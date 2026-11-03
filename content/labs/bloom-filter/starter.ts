const FNV_OFFSET = 0x811c9dc5; // seed for h1 (the standard FNV-1a offset basis)
const FNV_PRIME = 0x01000193;  // also used as the seed for h2

// The hashes are given (and must stay exactly like this so every language agrees).
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
  // TODO: throw a RangeError unless n >= 1 and 0 < p < 1
  // TODO: m = ceil(-n ln p / (ln 2)^2), k = max(1, round((m / n) ln 2))
  return [0, 0];
}

export class BloomFilter {
  readonly m: number;
  readonly k: number;

  constructor(n: number, p: number) {
    [this.m, this.k] = optimalParams(n, p);
    // TODO: a bit array of m bits (a Uint8Array of ceil(m / 8) bytes)
  }

  indexes(item: string): number[] {
    // TODO: h1 = fmix32(fnv1a32(item, FNV_OFFSET)), h2 = fmix32(fnv1a32(item, FNV_PRIME))
    // TODO: return [(h1 + i * h2) % m for i in 0..k-1]
    return [];
  }

  add(item: string): void {
    // TODO: set every bit in indexes(item)
  }

  mightContain(item: string): boolean {
    // TODO: true only if every bit in indexes(item) is set
    return false;
  }

  expectedFpRate(count: number): number {
    // TODO: (1 - e^(-k * count / m))^k
    return 0;
  }
}
