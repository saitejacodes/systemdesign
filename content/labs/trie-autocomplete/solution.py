import heapq


class Node:
    __slots__ = ("children", "weight")

    def __init__(self):
        self.children = {}  # char -> Node
        self.weight = 0     # > 0 only where an inserted word ends


class Trie:
    def __init__(self):
        self.root = Node()

    def insert(self, word: str, weight: int = 1) -> None:
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, Node())
        node.weight += weight  # re-inserting accumulates popularity

    def _find(self, prefix: str):
        node = self.root
        for ch in prefix:
            node = node.children.get(ch)
            if node is None:
                return None
        return node

    def weight(self, word: str) -> int:
        node = self._find(word)
        return node.weight if node is not None else 0

    def top_k(self, prefix: str, k: int):
        node = self._find(prefix)
        if node is None or k <= 0:
            return []
        # Iterative DFS over the prefix's subtree, carrying the characters spelled so far.
        found, stack = [], [(node, prefix)]
        while stack:
            n, spelled = stack.pop()
            if n.weight > 0:
                found.append((spelled, n.weight))
            for ch, child in n.children.items():
                stack.append((child, spelled + ch))
        # Heaviest first, ties broken alphabetically: O(m log k).
        return heapq.nsmallest(k, found, key=lambda p: (-p[1], p[0]))
