import java.util.*;

public class LabTests {
    public static void main(String[] args) {
        T.test("get on a missing key returns -1", "new LRUCache(2).get(1)", () -> T.eq(new LRUCache(2).get(1), -1));

        T.test("put then get returns the value", "put(1, 10); get(1)", () -> {
            LRUCache c = new LRUCache(2); c.put(1, 10);
            T.eq(c.get(1), 10);
        });

        T.test("evicts the least recently used key", "cap 2: put 1, put 2, put 3", () -> {
            LRUCache c = new LRUCache(2); c.put(1, 10); c.put(2, 20); c.put(3, 30);
            T.eq(List.of(c.get(1), c.get(2), c.get(3)), List.of(-1, 20, 30));
        });

        T.test("a get makes the key most recent, so the other key is evicted", "cap 2: put 1, put 2, get 1, put 3", () -> {
            LRUCache c = new LRUCache(2); c.put(1, 10); c.put(2, 20); c.get(1); c.put(3, 30);
            T.eq(List.of(c.get(2), c.get(1), c.get(3)), List.of(-1, 10, 30));
        });

        T.test("updating a key changes its value and makes it most recent", "cap 2: put 1, put 2, put 1=99, put 3", () -> {
            LRUCache c = new LRUCache(2); c.put(1, 10); c.put(2, 20); c.put(1, 99); c.put(3, 30);
            T.eq(List.of(c.get(1), c.get(2)), List.of(99, -1));
        });

        T.test("an update does not grow the cache", "cap 2: put 1 three times, put 2", () -> {
            LRUCache c = new LRUCache(2); for (int v = 0; v < 3; v++) c.put(1, v); c.put(2, 20);
            List<Integer> k = new ArrayList<>(c.keys()); Collections.sort(k);
            T.eq(k, List.of(1, 2));
        });

        T.test("capacity 1 keeps only the newest key", "cap 1: put 1, put 2", () -> {
            LRUCache c = new LRUCache(1); c.put(1, 10); c.put(2, 20);
            T.eq(List.of(c.get(1), c.get(2)), List.of(-1, 20));
            T.eq(c.keys(), List.of(2));
        });

        T.test("keys() lists most to least recent", "cap 3: put 1, 2, 3; get 1", () -> {
            LRUCache c = new LRUCache(3); c.put(1, 1); c.put(2, 2); c.put(3, 3); c.get(1);
            T.eq(c.keys(), List.of(1, 3, 2));
        });

        T.test("a miss does not change the order", "cap 2: put 1, put 2, get 9, put 3", () -> {
            LRUCache c = new LRUCache(2); c.put(1, 1); c.put(2, 2); c.get(9); c.put(3, 3);
            T.eq(c.keys(), List.of(3, 2));
        });

        T.test("100,000 operations stay fast (O(1) each)", "cap 1000, 100k mixed ops", () -> {
            LRUCache c = new LRUCache(1000);
            for (int i = 0; i < 100000; i++) { c.put(i % 5000, i); c.get((i * 7) % 5000); }
            T.eq(c.keys().size(), 1000);
        });

        T.summary();
    }
}
