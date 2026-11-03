from collections import OrderedDict


class LFUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        # TODO: key -> [value, freq]; freq -> OrderedDict of keys (least recently used first); min_freq

    def get(self, key):
        # TODO: on a hit, move the key from bucket f to bucket f + 1 and return its value; else -1
        return -1

    def put(self, key, value) -> None:
        # TODO: capacity 0 ignores everything
        # TODO: an existing key: update the value and count it as a use
        # TODO: a new key in a full cache: evict the oldest key in the min_freq bucket first,
        #       then insert with freq 1 and reset min_freq to 1
        pass

    def freq(self, key) -> int:
        # TODO: the key's current count, or 0 if absent (must not change anything)
        return 0
