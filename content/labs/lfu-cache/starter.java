import java.util.*;

// Keys and values are ints in Java; get returns -1 on a miss.
class LFUCache {
    private final int capacity;

    LFUCache(int capacity) {
        this.capacity = capacity;
        // TODO: key -> (value, freq); freq -> LinkedHashSet of keys (least recently used first); minFreq
    }

    int get(int key) {
        // TODO: on a hit, move the key from bucket f to bucket f + 1 and return its value; else -1
        return -1;
    }

    void put(int key, int value) {
        // TODO: capacity 0 ignores everything
        // TODO: an existing key: update the value and count it as a use
        // TODO: a new key in a full cache: evict the oldest key in the minFreq bucket first,
        //       then insert with freq 1 and reset minFreq to 1
    }

    int freq(int key) {
        // TODO: the key's current count, or 0 if absent (must not change anything)
        return 0;
    }
}
