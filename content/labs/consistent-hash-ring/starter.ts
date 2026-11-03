const FNV_OFFSET = 0x811c9dc5; // 2166136261
const FNV_PRIME = 0x01000193;  // 16777619

// The hash is given (and must stay exactly like this so every language agrees).
// FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32.
export function fnv1a32(data: string, seed: number = FNV_OFFSET): number {
  let h = seed >>> 0;
  for (const b of new TextEncoder().encode(data)) h = Math.imul(h ^ b, FNV_PRIME) >>> 0;
  return h;
}

// MurmurHash3's 32-bit finalizer: spreads FNV's weak low-bit differences across all 32 bits.
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Ring position of a node label or key: an integer in [0, 2^32).
export const hash32 = (s: string): number => fmix32(fnv1a32(s));

interface Point { pos: number; node: string }

export class HashRing {
  constructor(readonly vnodes: number = 100) {
    // TODO: throw a RangeError if vnodes < 1
    // TODO: a sorted array of Point, and the Set of node names
  }

  addNode(node: string): void {
    // TODO: no-op if already present; else add points hash32(`${node}#${i}`) for i in 0..vnodes-1, kept sorted
  }

  removeNode(node: string): void {
    // TODO: throw an Error if unknown; else drop all of its points
  }

  getNode(key: string): string {
    // TODO: throw an Error on an empty ring
    // TODO: binary-search the first point with pos >= hash32(key); wrap past the end
    return "";
  }

  nodes(): string[] {
    // TODO: the node names, sorted
    return [];
  }
}
