import java.util.*;

// Keys and values are ints in Java; get returns -1 on a miss.
class LRUCache {
    private static final class Node {
        int key, value;
        Node prev, next;
        Node(int key, int value) { this.key = key; this.value = value; }
    }

    private final int capacity;
    private final Map<Integer, Node> map = new HashMap<>();
    private final Node head = new Node(0, 0), tail = new Node(0, 0);

    LRUCache(int capacity) {
        this.capacity = capacity;
        head.next = tail;
        tail.prev = head;
    }

    private void unlink(Node n) { n.prev.next = n.next; n.next.prev = n.prev; }

    private void pushFront(Node n) {
        n.prev = head; n.next = head.next;
        head.next.prev = n; head.next = n;
    }

    int get(int key) {
        Node n = map.get(key);
        if (n == null) return -1;
        unlink(n); pushFront(n);
        return n.value;
    }

    void put(int key, int value) {
        Node old = map.get(key);
        if (old != null) { old.value = value; unlink(old); pushFront(old); return; }
        Node n = new Node(key, value);
        map.put(key, n);
        pushFront(n);
        if (map.size() > capacity) {
            Node lru = tail.prev;
            unlink(lru);
            map.remove(lru.key);
        }
    }

    List<Integer> keys() {
        List<Integer> out = new ArrayList<>();
        for (Node n = head.next; n != tail; n = n.next) out.add(n.key);
        return out;
    }
}
