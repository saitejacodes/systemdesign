from collections import OrderedDict


class LFUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.entries = {}        # key -> [value, freq]
        self.buckets = {}        # freq -> OrderedDict of keys, least recently used first
        self.min_freq = 0

    def _touch(self, key):
        """Move key from bucket f to bucket f + 1 (as its most recent entry)."""
        entry = self.entries[key]
        f = entry[1]
        bucket = self.buckets[f]
        del bucket[key]
        if not bucket:
            del self.buckets[f]
            if self.min_freq == f:
                self.min_freq = f + 1   # the key just moved there, so f + 1 is non-empty
        entry[1] = f + 1
        self.buckets.setdefault(f + 1, OrderedDict())[key] = None

    def get(self, key):
        if key not in self.entries:
            return -1
        self._touch(key)
        return self.entries[key][0]

    def put(self, key, value) -> None:
        if self.capacity <= 0:
            return
        if key in self.entries:
            self.entries[key][0] = value
            self._touch(key)
            return
        if len(self.entries) >= self.capacity:
            # Lowest frequency first; within it, the least recently used key.
            bucket = self.buckets[self.min_freq]
            victim, _ = bucket.popitem(last=False)
            if not bucket:
                del self.buckets[self.min_freq]
            del self.entries[victim]
        self.entries[key] = [value, 1]
        self.buckets.setdefault(1, OrderedDict())[key] = None
        self.min_freq = 1

    def freq(self, key) -> int:
        entry = self.entries.get(key)
        return entry[1] if entry else 0
