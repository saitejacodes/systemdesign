class Node:
    __slots__ = ("children", "weight")

    def __init__(self):
        self.children = {}  # char -> Node
        self.weight = 0     # > 0 only where an inserted word ends


class Trie:
    def __init__(self):
        self.root = Node()

    def insert(self, word: str, weight: int = 1) -> None:
        # TODO: walk (creating nodes) to the end of word, then ADD weight to that node
        pass

    def weight(self, word: str) -> int:
        # TODO: walk the word; return the end node's weight, or 0 if the path is missing
        return 0

    def top_k(self, prefix: str, k: int):
        # TODO: walk to the prefix node (missing -> []), collect (word, weight) for every
        # word in its subtree, sort by weight descending then word ascending, keep k
        return []
