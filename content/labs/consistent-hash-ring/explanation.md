With `node = hash(key) mod N`, changing N remaps almost everything: going from 3 to 4 nodes moves about **3/4** of keys, and from 10 to 9 about 90%. For a cache, every moved key is a miss that falls through to the database at once. **Consistent hashing** (Karger et al., 1997, built for distributed web caching) places **nodes and keys on the same circle** of 2³² positions. A key belongs to the **first node clockwise** from it, so when a node joins or leaves, only the keys in its arcs move: about **1/N**, the minimum possible.

Amazon's Dynamo, Apache Cassandra and Riak partition data this way. memcached clients use the "ketama" scheme to pick a server per key. Cassandra's `num_tokens` setting is the number of virtual nodes per machine.

## Virtual nodes

With one point per node, the arcs between points are uneven by chance. One node can own twice the ring of another, and when it dies its whole arc lands on a single neighbour. **Virtual nodes** place each physical node at V points, labelled `node#0 … node#(V−1)`. Each node's share is then the sum of V small arcs, so the imbalance shrinks roughly as 1/√V, and a failed node's load is spread over many neighbours. Weighting is free: give a bigger machine more vnodes.

## The hash (identical in every language)

Positions come from `hash32(s) = fmix32(fnv1a32(s))`, over the **UTF-8 bytes** of `s`:

- **FNV-1a, 32-bit:** start from the offset basis `h = 0x811C9DC5`. For each byte, `h = (h XOR byte) × 0x01000193 mod 2³²`. The published test vectors are `"" → 0x811c9dc5`, `"a" → 0xe40c292c`, `"foobar" → 0xbf9cf968`.
- **fmix32** (MurmurHash3's finalizer): `h ^= h >> 16; h *= 0x85EBCA6B; h ^= h >> 13; h *= 0xC2B2AE35; h ^= h >> 16`, all mod 2³².

The finalizer matters. On its own, FNV-1a gives labels that differ only in the last character (`node-D#17`, `node-D#18`) positions too close together. With this lab's test keys and FNV-1a alone, a fourth node's 100 vnodes clump together and it takes 45% of the keys instead of 25%. This code is given in the starter; don't change it, or Python and JavaScript will disagree.

## Your task

Implement `HashRing(vnodes=100)`:

- `add_node(node)` adds the points `hash32(f"{node}#{i}")` for `i` in `0..vnodes−1`. Adding a node that is already present does nothing (it must not double its vnodes).
- `remove_node(node)` removes all of its points. An unknown node raises `KeyError` in Python; in JavaScript it throws an `Error`.
- `get_node(key)` returns the owner: the first point whose position is **≥** `hash32(key)`, using binary search. Past the last point it **wraps around** to the first. An empty ring raises `LookupError` in Python; in JavaScript it throws an `Error`.
- `nodes()` returns the node names, sorted.
- Keep points sorted by `(position, node name)`, so a hash collision still has one defined winner. `vnodes < 1` raises `ValueError` in Python or throws `RangeError` in JavaScript.

JavaScript, TypeScript, Java and C++ use `addNode`, `removeNode` and `getNode`. Java keeps the hashes in a `Hashing` class as unsigned values in a `long`. Its empty ring throws `NoSuchElementException` and an unknown node throws `IllegalArgumentException`. In C++, an empty ring throws `std::out_of_range` and an unknown node throws `std::invalid_argument`. The tests check minimal movement on both add and remove, even spread with 100 vnodes, wraparound, and that insertion order doesn't matter.

## Going further

- **Replication.** Dynamo-style stores write each key to the next R **distinct physical** nodes clockwise (skipping more vnodes of a node already chosen): the preference list.
- **Membership is the hard part.** The algorithm is deterministic, so two clients with different node lists send the same key to different nodes. Real systems spread membership by gossip (Cassandra) or a coordination service.
- **Alternatives.** Rendezvous (highest-random-weight) hashing needs no ring, but each lookup is O(N). Jump consistent hash (Lamping and Veach, 2014) uses no memory but only supports numbered buckets added or removed at the end. Google's Maglev builds a lookup table for O(1) lookups with near-perfect balance.
- **Hot keys.** The ring balances keys, not traffic: one viral key still lands on one node.
