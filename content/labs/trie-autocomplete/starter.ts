class TrieNode {
  children = new Map<string, TrieNode>(); // char -> node
  weight = 0;                             // > 0 only where an inserted word ends
}

export type Completion = [word: string, weight: number];

export class Trie {
  private root = new TrieNode();

  insert(word: string, weight = 1): void {
    // TODO: walk (creating nodes) to the end of word, then ADD weight to that node
  }

  weight(word: string): number {
    // TODO: walk the word; return the end node's weight, or 0 if the path is missing
    return 0;
  }

  topK(prefix: string, k: number): Completion[] {
    // TODO: walk to the prefix node (missing -> []), collect [word, weight] for every
    // word in its subtree, sort by weight descending then word ascending, keep k
    return [];
  }
}
