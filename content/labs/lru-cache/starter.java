import java.util.*;

// Keys and values are ints in Java; get returns -1 on a miss.
class LRUCache {
    private static final class Node {
        int key, value;
        Node prev, next;
        Node(int key, int value) { this.key = key; this.value = value; }
    }

    private final int capacity;

    LRUCache(int capacity) {
        this.capacity = capacity;
        // TODO: a HashMap from key to Node (lookup only), and sentinel head/tail nodes linked to each other
    }

    int get(int key) {
        // TODO: return the value and move the node to the front, or -1
        return -1;
    }

    void put(int key, int value) {
        // TODO: update or insert at the front; evict from the back when over capacity
    }

    List<Integer> keys() {
        // TODO: walk from head to tail
        return new ArrayList<>();
    }
}
