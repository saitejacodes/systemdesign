const FNV_OFFSET = 0x811c9dc5; // 2166136261
const FNV_PRIME = 0x01000193;  // 16777619

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
  private points: Point[] = []; // sorted by (pos, node)
  private members = new Set<string>();

  constructor(readonly vnodes: number = 100) {
    if (!(vnodes >= 1)) throw new RangeError("vnodes must be >= 1");
  }

  // Index of the first point with pos >= h (points.length if none).
  private lowerBound(h: number): number {
    let lo = 0, hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.points[mid].pos < h) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  addNode(node: string): void {
    if (this.members.has(node)) return; // adding again must not double its vnodes
    this.members.add(node);
    for (let i = 0; i < this.vnodes; i++) this.points.push({ pos: hash32(`${node}#${i}`), node });
    this.points.sort((a, b) => a.pos - b.pos || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
  }

  removeNode(node: string): void {
    if (!this.members.has(node)) throw new Error(`unknown node ${node}`);
    this.members.delete(node);
    this.points = this.points.filter((p) => p.node !== node);
  }

  getNode(key: string): string {
    if (this.points.length === 0) throw new Error("the ring is empty");
    // First point clockwise at or after the key's position; past the last point, wrap to 0.
    return this.points[this.lowerBound(hash32(key)) % this.points.length].node;
  }

  nodes(): string[] { return [...this.members].sort(); }
}
