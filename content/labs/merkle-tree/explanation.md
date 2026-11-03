A Merkle tree (Ralph Merkle's hash tree) hashes each data block into a leaf, then hashes each pair of hashes into a parent, up to a single **root**. Change any byte of any block and the root changes. That one property powers two very different jobs:

- **Anti-entropy.** Dynamo, Cassandra (`nodetool repair`) and Riak (active anti-entropy) keep a tree per key range on each replica. Two replicas exchange roots; if they match, the whole range is identical and nothing more is sent. If not, they compare children and descend **only into subtrees whose hashes differ**, so finding one bad block among 2¹⁶ leaves costs about 2 × 16 hash comparisons instead of 65,536.
- **Membership proofs.** To prove block *i* is in a tree, send the sibling hash at every level (about log₂ n hashes). The verifier rehashes from the block to the top and checks it reaches the trusted root. Bitcoin's light clients and Certificate Transparency logs (RFC 6962) work this way.

**Two details decide whether a tree is sound.** First, what happens to an odd node out. Bitcoin duplicates the last hash, which makes `[a, b, c]` and `[a, b, c, c]` share a root; that ambiguity was exploited as CVE-2012-2459. This lab **promotes** the odd node unchanged instead, which gives exactly the tree shape RFC 6962 defines. Second, **domain separation**: leaf hashes are taken over a 0x00 byte plus the data and inner hashes over a 0x01 byte plus the children, as in RFC 6962, so a leaf can never be passed off as an inner node.

## Your task

The hash is given: `fnv1a64(text)` is 64-bit FNV-1a (offset basis `0xcbf29ce484222325`, prime `0x100000001b3`) over the UTF-8 bytes, as 16 hex digits, so every language produces the same digests. `leaf_hash(data) = fnv1a64("\x00" + data)` and `node_hash(left, right) = fnv1a64("\x01" + left + right)`, where `left` and `right` are hex strings (JavaScript: `leafHash`, `nodeHash`). Implement:

- `MerkleTree(leaves)` over a non-empty list of strings; raise `ValueError` (JavaScript: `RangeError`) if it is empty. Pair nodes left to right on each level; an odd last node moves up unchanged.
- `root()` returns the root hash. A one-leaf tree's root is that leaf's hash.
- `proof(i)` returns a list of `(side, hash)` pairs from the leaf upward (JavaScript: `[side, hash]` arrays), where `side` is `"L"` if the sibling is on the left and `"R"` if on the right. Levels where the node has no sibling contribute nothing. Raise `IndexError` (JavaScript: `RangeError`) for an index outside the tree.
- `verify(leaf, proof, root)`, a module-level function, returns whether the proof leads from `leaf` to `root`.
- `diff(other)` returns the sorted indices of leaves whose hashes differ from the other tree's, starting at the root and descending only where hashes differ. Set `self.compared` (`this.compared`) to the number of node pairs it compared: 1 for identical trees, 7 for one difference among 8 leaves. Raise `ValueError` / `RangeError` if the leaf counts differ.

In Java the hash helpers and `verify` are static methods of `Merkle` and a proof step is a `Step(side, hash)` record; in C++ it is a `(side, hash)` pair. Errors are `IllegalArgumentException` / `std::invalid_argument` and `IndexOutOfBoundsException` / `std::out_of_range`.

## Going further

FNV-1a is fast but not collision-resistant: anyone can craft two blocks with the same 64-bit hash, so production trees use a cryptographic hash such as SHA-256 when an adversary might feed in data. For repair, a leaf usually covers a **range of keys** rather than one block, so the tree has a fixed depth however many keys there are. The trade-off is maintenance: a tree must be rebuilt or updated as data changes, and building one means reading the whole range from disk, which is why Cassandra repairs are scheduled jobs rather than continuous. Different leaf counts cannot be compared directly; real systems agree on the key-range split first, and Certificate Transparency adds consistency proofs to show that one append-only tree is a prefix of a larger one.
