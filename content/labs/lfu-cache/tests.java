import java.util.*;

public class LabTests {
    public static void main(String[] args) {
        T.test("get on a missing key returns -1", "new LFUCache(2).get(1)", () -> T.eq(new LFUCache(2).get(1), -1));

        T.test("put then get returns the value", "put(1, 10); get(1)", () -> {
            LFUCache c = new LFUCache(2); c.put(1, 10);
            T.eq(c.get(1), 10);
        });

        T.test("evicts the least frequently used key", "cap 2: put 1, put 2, get 1, put 3", () -> {
            LFUCache c = new LFUCache(2); c.put(1, 10); c.put(2, 20); c.get(1); c.put(3, 30);
            T.eq(List.of(c.get(2), c.get(1), c.get(3)), List.of(-1, 10, 30));
        });

        T.test("a frequency tie evicts the least recently used key", "cap 3: put 1, 2, 3; get 3, get 1, get 2; put 4", () -> {
            LFUCache c = new LFUCache(3); c.put(1, 1); c.put(2, 2); c.put(3, 3);
            c.get(3); c.get(1); c.get(2); // all at freq 2; 3 is now the least recent of them
            c.put(4, 4);
            T.eq(List.of(c.get(3), c.get(1), c.get(2), c.get(4)), List.of(-1, 1, 2, 4));
        });

        T.test("an update changes the value and counts as a use", "cap 2: put 1, put 2, put 1=99, put 3", () -> {
            LFUCache c = new LFUCache(2); c.put(1, 10); c.put(2, 20); c.put(1, 99); c.put(3, 30);
            T.eq(List.of(c.freq(1), c.get(1), c.get(2), c.get(3)), List.of(2, 99, -1, 30));
        });

        T.test("a new key is the next victim, not an older hot key", "cap 2: put 1, get 1 x3, put 2, put 3", () -> {
            LFUCache c = new LFUCache(2); c.put(1, 10);
            for (int i = 0; i < 3; i++) c.get(1);
            c.put(2, 20); c.put(3, 30);
            T.eq(List.of(c.get(1), c.get(2), c.get(3)), List.of(10, -1, 30));
        });

        T.test("min_freq moves up when its bucket empties", "cap 2: put 1, put 2, get 1, get 2, get 2, put 3", () -> {
            LFUCache c = new LFUCache(2); c.put(1, 1); c.put(2, 2);
            c.get(1); c.get(2); c.get(2); // freq(1) = 2, freq(2) = 3: no key left at freq 1
            c.put(3, 3); // must evict 1, the lowest at freq 2
            T.eq(List.of(c.get(1), c.freq(2), c.freq(3)), List.of(-1, 3, 1));
        });

        T.test("freq() counts uses, and a miss changes nothing", "cap 2: put 1, get 1, get 1, get 9", () -> {
            LFUCache c = new LFUCache(2); c.put(1, 1); c.get(1); c.get(1); c.get(9);
            T.eq(List.of(c.freq(1), c.freq(9)), List.of(3, 0));
        });

        T.test("capacity 0 stores nothing", "cap 0: put 1; get 1", () -> {
            LFUCache c = new LFUCache(0); c.put(1, 10);
            T.eq(List.of(c.get(1), c.freq(1)), List.of(-1, 0));
        });

        T.test("capacity 1 keeps only the newest key", "cap 1: put 1, get 1, put 2", () -> {
            LFUCache c = new LFUCache(1); c.put(1, 10); c.get(1); c.put(2, 20);
            T.eq(List.of(c.get(1), c.get(2)), List.of(-1, 20));
        });

        T.test("a longer sequence (LeetCode 460 shape)", "cap 2: put 1, put 2, get 1, put 3, get 2, get 3, put 4, get 1, get 3, get 4", () -> {
            LFUCache c = new LFUCache(2); List<Integer> out = new ArrayList<>();
            c.put(1, 1); c.put(2, 2); out.add(c.get(1));
            c.put(3, 3); out.add(c.get(2)); out.add(c.get(3));
            c.put(4, 4); out.add(c.get(1)); out.add(c.get(3)); out.add(c.get(4));
            T.eq(out, List.of(1, -1, 3, -1, 3, 4));
        });

        T.test("100,000 operations stay fast (O(1) each)", "cap 1000, 100k mixed ops", () -> {
            LFUCache c = new LFUCache(1000); int hits = 0;
            for (int i = 0; i < 50000; i++) { c.put(i % 3000, i); if (c.get((i * 7) % 3000) != -1) hits++; }
            int size = 0; for (int k = 0; k < 3000; k++) if (c.freq(k) > 0) size++;
            T.eq(List.of(size, hits > 0 ? 1 : 0), List.of(1000, 1));
        });

        T.summary();
    }
}
