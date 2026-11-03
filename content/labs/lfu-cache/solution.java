import java.util.*;

// Keys and values are ints in Java; get returns -1 on a miss.
class LFUCache {
    private static final class Entry {
        int value, freq;
        Entry(int value, int freq) { this.value = value; this.freq = freq; }
    }

    private final int capacity;
    private final Map<Integer, Entry> entries = new HashMap<>();
    // freq -> keys in insertion order (least recently used first)
    private final Map<Integer, LinkedHashSet<Integer>> buckets = new HashMap<>();
    private int minFreq = 0;

    LFUCache(int capacity) { this.capacity = capacity; }

    // Move key from bucket f to bucket f + 1, as its most recent entry.
    private void touch(int key, Entry e) {
        int f = e.freq;
        LinkedHashSet<Integer> b = buckets.get(f);
        b.remove(key);
        if (b.isEmpty()) {
            buckets.remove(f);
            if (minFreq == f) minFreq = f + 1; // the key is about to land there
        }
        e.freq = f + 1;
        buckets.computeIfAbsent(f + 1, x -> new LinkedHashSet<>()).add(key);
    }

    int get(int key) {
        Entry e = entries.get(key);
        if (e == null) return -1;
        touch(key, e);
        return e.value;
    }

    void put(int key, int value) {
        if (capacity <= 0) return;
        Entry e = entries.get(key);
        if (e != null) { e.value = value; touch(key, e); return; }
        if (entries.size() >= capacity) {
            // Lowest frequency first; within it, the least recently used key.
            LinkedHashSet<Integer> b = buckets.get(minFreq);
            int victim = b.iterator().next();
            b.remove(victim);
            if (b.isEmpty()) buckets.remove(minFreq);
            entries.remove(victim);
        }
        entries.put(key, new Entry(value, 1));
        buckets.computeIfAbsent(1, x -> new LinkedHashSet<>()).add(key);
        minFreq = 1;
    }

    int freq(int key) {
        Entry e = entries.get(key);
        return e == null ? 0 : e.freq;
    }
}
