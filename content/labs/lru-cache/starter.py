class Node:
    def __init__(self, key=None, value=None):
        self.key, self.value = key, value
        self.prev = self.next = None


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        # TODO: a dict from key to Node, and sentinel head/tail nodes linked to each other

    def get(self, key):
        # TODO: return the value and move the node to the front, or -1
        return -1

    def put(self, key, value) -> None:
        # TODO: update or insert at the front; evict from the back when over capacity
        pass

    def keys(self):
        # TODO: walk from head to tail
        return []
