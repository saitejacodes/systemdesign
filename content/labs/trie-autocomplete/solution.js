class Node {
  constructor() {
    this.children = new Map(); // char -> Node
    this.weight = 0;           // > 0 only where an inserted word ends
  }
}

class Trie {
  constructor() { this.root = new Node(); }

  insert(word, weight = 1) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new Node());
      node = node.children.get(ch);
    }
    node.weight += weight; // re-inserting accumulates popularity
  }

  find(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (!node) return null;
    }
    return node;
  }

  weight(word) {
    const node = this.find(word);
    return node ? node.weight : 0;
  }

  topK(prefix, k) {
    const node = this.find(prefix);
    if (!node || k <= 0) return [];
    // Iterative DFS over the prefix's subtree, carrying the characters spelled so far.
    const found = [];
    const stack = [[node, prefix]];
    while (stack.length) {
      const [n, spelled] = stack.pop();
      if (n.weight > 0) found.push([spelled, n.weight]);
      for (const [ch, child] of n.children) stack.push([child, spelled + ch]);
    }
    // Heaviest first, ties broken by code-point order (not localeCompare).
    found.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return found.slice(0, k);
  }
}

module.exports = { Trie };
