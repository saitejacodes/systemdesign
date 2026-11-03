class Node {
  constructor(key, value) { this.key = key; this.value = value; this.prev = null; this.next = null; }
}

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    this.head = new Node();
    this.tail = new Node();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  unlink(n) { n.prev.next = n.next; n.next.prev = n.prev; }

  pushFront(n) {
    n.prev = this.head; n.next = this.head.next;
    this.head.next.prev = n; this.head.next = n;
  }

  get(key) {
    const n = this.map.get(key);
    if (!n) return -1;
    this.unlink(n); this.pushFront(n);
    return n.value;
  }

  put(key, value) {
    const old = this.map.get(key);
    if (old) { old.value = value; this.unlink(old); this.pushFront(old); return; }
    const n = new Node(key, value);
    this.map.set(key, n);
    this.pushFront(n);
    if (this.map.size > this.capacity) {
      const lru = this.tail.prev;
      this.unlink(lru);
      this.map.delete(lru.key);
    }
  }

  keys() {
    const out = [];
    for (let n = this.head.next; n !== this.tail; n = n.next) out.push(n.key);
    return out;
  }
}

module.exports = { LRUCache };
