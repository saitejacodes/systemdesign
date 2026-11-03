class Node {
  constructor(key, value) { this.key = key; this.value = value; this.prev = null; this.next = null; }
}

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    // TODO: a Map from key to Node (used only for lookup, not for order), and sentinel head/tail nodes
  }

  get(key) {
    // TODO: return the value and move the node to the front, or -1
    return -1;
  }

  put(key, value) {
    // TODO: update or insert at the front; evict from the back when over capacity
  }

  keys() {
    // TODO: walk from head to tail
    return [];
  }
}

module.exports = { LRUCache };
