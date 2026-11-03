const FNV_OFFSET = 0xcbf29ce484222325n, FNV_PRIME = 0x100000001b3n, MASK64 = (1n << 64n) - 1n;

export type Side = "L" | "R";
export type ProofStep = [side: Side, hash: string];

// 64-bit FNV-1a over the UTF-8 bytes of text, as 16 lowercase hex digits. Given: you don't need to change it.
export function fnv1a64(text: string): string {
  let h = FNV_OFFSET;
  for (const b of new TextEncoder().encode(text)) h = ((h ^ BigInt(b)) * FNV_PRIME) & MASK64;
  return h.toString(16).padStart(16, "0");
}

export const leafHash = (data: string): string => fnv1a64("\x00" + data);
export const nodeHash = (left: string, right: string): string => fnv1a64("\x01" + left + right);

export class MerkleTree {
  readonly levels: string[][]; // levels[0] = leaf hashes, levels[levels.length - 1] = [root]
  compared = 0;

  constructor(leaves: string[]) {
    // TODO: throw RangeError on an empty array. Build this.levels bottom-up:
    // pair neighbours with nodeHash; an odd last node is promoted unchanged
    this.levels = [leaves.map(leafHash)];
  }

  root(): string {
    // TODO: the single hash on the top level
    return this.levels[0][0];
  }

  proof(i: number): ProofStep[] {
    // TODO: throw RangeError if i is out of range; walk up collecting ["L" or "R", sibling hash],
    // skipping levels where the node has no sibling
    return [];
  }

  diff(other: MerkleTree): number[] {
    // TODO: throw RangeError if the leaf counts differ; compare from the root down, descending only
    // where hashes differ; count every node pair compared in this.compared; return sorted leaf indices
    return [];
  }
}

export function verify(leaf: string, proof: ProofStep[], root: string): boolean {
  // TODO: rehash from leafHash(leaf) up the proof and compare with root
  return false;
}
