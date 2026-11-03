class TrieNode {
  children = new Map<string, TrieNode>(); // char -> node
  weight = 0;                             // > 0 only where an inserted word ends
}

export type Completion = [word: string, weight: number];

export class Trie {
  private root = new TrieNode();

  insert(word: string, weight = 1): void {
    let node = this.root;
    for (const ch of word) {
      let next = node.children.get(ch);
      if (!next) { next = new TrieNode(); node.children.set(ch, next); }
      node = next;
    }
    node.weight += weight; // re-inserting accumulates popularity
  }

  private find(prefix: string): TrieNode | null {
    let node: TrieNode | undefined = this.root;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (!node) return null;
    }
    return node;
  }

  weight(word: string): number {
    return this.find(word)?.weight ?? 0;
  }

  topK(prefix: string, k: number): Completion[] {
    const node = this.find(prefix);
    if (!node || k <= 0) return [];
    // Iterative DFS over the prefix's subtree, carrying the characters spelled so far.
    const found: Completion[] = [];
    const stack: [TrieNode, string][] = [[node, prefix]];
    while (stack.length) {
      const [n, spelled] = stack.pop()!;
      if (n.weight > 0) found.push([spelled, n.weight]);
      for (const [ch, child] of n.children) stack.push([child, spelled + ch]);
    }
    // Heaviest first, ties broken by code-point order (not localeCompare).
    found.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return found.slice(0, k);
  }
}
