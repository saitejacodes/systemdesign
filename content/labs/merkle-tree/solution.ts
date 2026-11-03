const FNV_OFFSET = 0xcbf29ce484222325n, FNV_PRIME = 0x100000001b3n, MASK64 = (1n << 64n) - 1n;

export type Side = "L" | "R";
export type ProofStep = [side: Side, hash: string];

// 64-bit FNV-1a over the UTF-8 bytes of text, as 16 lowercase hex digits. Fast, not cryptographic.
export function fnv1a64(text: string): string {
  let h = FNV_OFFSET;
  for (const b of new TextEncoder().encode(text)) h = ((h ^ BigInt(b)) * FNV_PRIME) & MASK64;
  return h.toString(16).padStart(16, "0");
}

export const leafHash = (data: string): string => fnv1a64("\x00" + data); // 0x00 / 0x01 prefixes keep a leaf from posing as an inner node
export const nodeHash = (left: string, right: string): string => fnv1a64("\x01" + left + right);

export class MerkleTree {
  readonly levels: string[][]; // levels[0] = leaf hashes, levels[levels.length - 1] = [root]
  compared = 0;

  constructor(leaves: string[]) {
    if (!leaves.length) throw new RangeError("a Merkle tree needs at least one leaf");
    let level = leaves.map(leafHash);
    this.levels = [level];
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i + 1 < level.length; i += 2) next.push(nodeHash(level[i], level[i + 1]));
      if (level.length % 2) next.push(level[level.length - 1]); // odd node out is promoted unchanged, not duplicated
      this.levels.push(next);
      level = next;
    }
  }

  root(): string { return this.levels[this.levels.length - 1][0]; }

  proof(i: number): ProofStep[] {
    if (!(Number.isInteger(i) && i >= 0 && i < this.levels[0].length)) throw new RangeError("leaf index out of range");
    const path: ProofStep[] = [];
    for (const level of this.levels.slice(0, -1)) {
      const sib = i ^ 1;
      if (sib < level.length) path.push([sib < i ? "L" : "R", level[sib]]); // a promoted node has no sibling here
      i = Math.floor(i / 2);
    }
    return path;
  }

  diff(other: MerkleTree): number[] {
    if (this.levels[0].length !== other.levels[0].length) throw new RangeError("trees must have the same number of leaves");
    this.compared = 0;
    const out: number[] = [];
    const walk = (depth: number, j: number): void => {
      this.compared++;
      if (this.levels[depth][j] === other.levels[depth][j]) return; // identical subtree: skip every leaf under it
      if (depth === 0) { out.push(j); return; }
      walk(depth - 1, 2 * j);
      if (2 * j + 1 < this.levels[depth - 1].length) walk(depth - 1, 2 * j + 1);
    };
    walk(this.levels.length - 1, 0);
    return out;
  }
}

export function verify(leaf: string, proof: ProofStep[], root: string): boolean {
  let h = leafHash(leaf);
  for (const [side, sib] of proof) h = side === "L" ? nodeHash(sib, h) : nodeHash(h, sib);
  return h === root;
}
