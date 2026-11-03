const FNV_OFFSET = 0xcbf29ce484222325n, FNV_PRIME = 0x100000001b3n, MASK64 = (1n << 64n) - 1n;

// 64-bit FNV-1a over the UTF-8 bytes of text, as 16 lowercase hex digits. Given: you don't need to change it.
function fnv1a64(text) {
  let h = FNV_OFFSET;
  for (const b of new TextEncoder().encode(text)) h = ((h ^ BigInt(b)) * FNV_PRIME) & MASK64;
  return h.toString(16).padStart(16, "0");
}

const leafHash = (data) => fnv1a64("\x00" + data);
const nodeHash = (left, right) => fnv1a64("\x01" + left + right);

class MerkleTree {
  constructor(leaves) {
    // TODO: throw RangeError on an empty array. Build this.levels bottom-up:
    // levels[0] = leaf hashes; pair neighbours with nodeHash; an odd last node is promoted unchanged
    this.levels = [leaves.map(leafHash)];
    this.compared = 0;
  }

  root() {
    // TODO: the single hash on the top level
    return this.levels[0][0];
  }

  proof(i) {
    // TODO: throw RangeError if i is out of range; walk up collecting ["L" or "R", sibling hash],
    // skipping levels where the node has no sibling
    return [];
  }

  diff(other) {
    // TODO: throw RangeError if the leaf counts differ; compare from the root down, descending only
    // where hashes differ; count every node pair compared in this.compared; return sorted leaf indices
    return [];
  }
}

function verify(leaf, proof, root) {
  // TODO: rehash from leafHash(leaf) up the proof and compare with root
  return false;
}

module.exports = { fnv1a64, leafHash, nodeHash, MerkleTree, verify };
