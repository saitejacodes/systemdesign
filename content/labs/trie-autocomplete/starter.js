class Node {
  constructor() {
    this.children = new Map(); // char -> Node
    this.weight = 0;           // > 0 only where an inserted word ends
  }
}

class Trie {
  constructor() { this.root = new Node(); }

  insert(word, weight = 1) {
    // TODO: walk (creating nodes) to the end of word, then ADD weight to that node
  }

  weight(word) {
    // TODO: walk the word; return the end node's weight, or 0 if the path is missing
    return 0;
  }

  topK(prefix, k) {
    // TODO: walk to the prefix node (missing -> []), collect [word, weight] for every
    // word in its subtree, sort by weight descending then word ascending, keep k
    return [];
  }
}

module.exports = { Trie };
