class Node<K, V> {
  prev: Node<K, V> | null = null;
  next: Node<K, V> | null = null;
  constructor(public key?: K, public value?: V) {}
}

export class LRUCache<K = unknown, V = unknown> {
  private map = new Map<K, Node<K, V>>();
  private head = new Node<K, V>();
  private tail = new Node<K, V>();

  constructor(private capacity: number) {
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  private unlink(n: Node<K, V>) { n.prev!.next = n.next; n.next!.prev = n.prev; }

  private pushFront(n: Node<K, V>) {
    n.prev = this.head; n.next = this.head.next;
    this.head.next!.prev = n; this.head.next = n;
  }

  get(key: K): V | -1 {
    const n = this.map.get(key);
    if (!n) return -1;
    this.unlink(n); this.pushFront(n);
    return n.value as V;
  }

  put(key: K, value: V): void {
    const old = this.map.get(key);
    if (old) { old.value = value; this.unlink(old); this.pushFront(old); return; }
    const n = new Node(key, value);
    this.map.set(key, n);
    this.pushFront(n);
    if (this.map.size > this.capacity) {
      const lru = this.tail.prev!;
      this.unlink(lru);
      this.map.delete(lru.key as K);
    }
  }

  keys(): K[] {
    const out: K[] = [];
    for (let n = this.head.next!; n !== this.tail; n = n.next!) out.push(n.key as K);
    return out;
  }
}
