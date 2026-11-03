An LRU (least recently used) cache keeps at most `capacity` entries. When it is full and a new key arrives, it evicts the entry that was used longest ago. "Used" means read with `get` or written with `put`. Redis's `allkeys-lru` policy approximates this, and almost every in-process cache (Guava, Caffeine's window, Python's `functools.lru_cache`) starts from it.

Both operations must be **O(1)**. A plain dict can't tell you which key is oldest without scanning; a plain list can't find a key without scanning. The classic answer combines them:

- a **hash map** from key to a list node, for O(1) lookup;
- a **doubly linked list** ordered from most to least recent, so moving a node to the front and removing the last node are O(1) pointer changes.

Sentinel `head` and `tail` nodes mean the list is never empty, so insert and unlink need no special cases.

## Your task

Implement `LRUCache(capacity)` with:

- `get(key)` returns the value, or `-1` if the key is absent. A hit makes the key most recently used.
- `put(key, value)` inserts or updates. An update also makes the key most recently used. If inserting a new key makes the cache exceed `capacity`, evict the least recently used key first.
- `keys()` returns the keys from most to least recently used (the tests use it to check order).

In Java and C++ keys and values are `int`. Capacity is at least 1. Don't use `collections.OrderedDict` (or a JavaScript `Map`'s insertion order): the point is to build the structure yourself.

## Going further

Production caches rarely use exact LRU: Redis samples a few keys and evicts the oldest of the sample, because a global list costs memory and a lock. Caffeine uses W-TinyLFU, which adds a frequency filter so a one-off scan can't flush the hot set. Compare with the LFU lab.
