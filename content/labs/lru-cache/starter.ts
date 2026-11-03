class Node<K, V> {
  prev: Node<K, V> | null = null;
  next: Node<K, V> | null = null;
  constructor(public key?: K, public value?: V) {}
}

export class LRUCache<K = unknown, V = unknown> {
  constructor(private capacity: number) {
    // TODO: a Map from key to Node (used only for lookup, not for order), and sentinel head/tail nodes
  }

  get(key: K): V | -1 {
    // TODO: return the value and move the node to the front, or -1
    return -1;
  }

  put(key: K, value: V): void {
    // TODO: update or insert at the front; evict from the back when over capacity
  }

  keys(): K[] {
    // TODO: walk from head to tail
    return [];
  }
}
