const FNV_OFFSET = 0x811c9dc5; // 2166136261
const FNV_PRIME = 0x01000193;  // 16777619

// The hash is given (and must stay exactly like this so Python and JavaScript agree).
// FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32.
function fnv1a32(data, seed = FNV_OFFSET) {
  let h = seed >>> 0;
  for (const b of new TextEncoder().encode(data)) h = Math.imul(h ^ b, FNV_PRIME) >>> 0;
  return h;
}

// MurmurHash3's 32-bit finalizer: spreads FNV's weak low-bit differences across all 32 bits.
function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Ring position of a node label or key: an integer in [0, 2^32).
const hash32 = (s) => fmix32(fnv1a32(s));

class HashRing {
  constructor(vnodes = 100) {
    // TODO: throw a RangeError if vnodes < 1
    this.vnodes = vnodes;
    // TODO: a sorted array of { pos, node } points, and the Set of node names
  }

  addNode(node) {
    // TODO: no-op if already present; else add points hash32(`${node}#${i}`) for i in 0..vnodes-1, kept sorted
  }

  removeNode(node) {
    // TODO: throw an Error if unknown; else drop all of its points
  }

  getNode(key) {
    // TODO: throw an Error on an empty ring
    // TODO: binary-search the first point with pos >= hash32(key); wrap past the end
    return "";
  }

  nodes() {
    // TODO: the node names, sorted
    return [];
  }
}

module.exports = { fnv1a32, fmix32, hash32, HashRing };
