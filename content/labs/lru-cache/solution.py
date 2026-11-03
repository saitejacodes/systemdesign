class Node:
    def __init__(self, key=None, value=None):
        self.key, self.value = key, value
        self.prev = self.next = None


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.map = {}
        self.head, self.tail = Node(), Node()
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, n):
        n.prev.next, n.next.prev = n.next, n.prev

    def _push_front(self, n):
        n.prev, n.next = self.head, self.head.next
        self.head.next.prev = n
        self.head.next = n

    def get(self, key):
        n = self.map.get(key)
        if n is None:
            return -1
        self._unlink(n)
        self._push_front(n)
        return n.value

    def put(self, key, value) -> None:
        n = self.map.get(key)
        if n is not None:
            n.value = value
            self._unlink(n)
            self._push_front(n)
            return
        n = self.map[key] = Node(key, value)
        self._push_front(n)
        if len(self.map) > self.capacity:
            lru = self.tail.prev
            self._unlink(lru)
            del self.map[lru.key]

    def keys(self):
        out, n = [], self.head.next
        while n is not self.tail:
            out.append(n.key)
            n = n.next
        return out
