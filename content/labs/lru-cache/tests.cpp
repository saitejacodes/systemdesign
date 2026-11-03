#include <algorithm>
#include <vector>

int main() {
    using V = std::vector<int>;
    TEST("get on a missing key returns -1", "LRUCache(2).get(1)", [] { LRUCache c(2); EQ(c.get(1), -1); });

    TEST("put then get returns the value", "put(1, 10); get(1)", [] {
        LRUCache c(2); c.put(1, 10);
        EQ(c.get(1), 10);
    });

    TEST("evicts the least recently used key", "cap 2: put 1, put 2, put 3", [] {
        LRUCache c(2); c.put(1, 10); c.put(2, 20); c.put(3, 30);
        EQ((V{c.get(1), c.get(2), c.get(3)}), (V{-1, 20, 30}));
    });

    TEST("a get makes the key most recent, so the other key is evicted", "cap 2: put 1, put 2, get 1, put 3", [] {
        LRUCache c(2); c.put(1, 10); c.put(2, 20); c.get(1); c.put(3, 30);
        EQ((V{c.get(2), c.get(1), c.get(3)}), (V{-1, 10, 30}));
    });

    TEST("updating a key changes its value and makes it most recent", "cap 2: put 1, put 2, put 1=99, put 3", [] {
        LRUCache c(2); c.put(1, 10); c.put(2, 20); c.put(1, 99); c.put(3, 30);
        EQ((V{c.get(1), c.get(2)}), (V{99, -1}));
    });

    TEST("an update does not grow the cache", "cap 2: put 1 three times, put 2", [] {
        LRUCache c(2); for (int v = 0; v < 3; v++) c.put(1, v); c.put(2, 20);
        V k = c.keys(); std::sort(k.begin(), k.end());
        EQ(k, (V{1, 2}));
    });

    TEST("capacity 1 keeps only the newest key", "cap 1: put 1, put 2", [] {
        LRUCache c(1); c.put(1, 10); c.put(2, 20);
        EQ((V{c.get(1), c.get(2)}), (V{-1, 20}));
        EQ(c.keys(), V{2});
    });

    TEST("keys() lists most to least recent", "cap 3: put 1, 2, 3; get 1", [] {
        LRUCache c(3); c.put(1, 1); c.put(2, 2); c.put(3, 3); c.get(1);
        EQ(c.keys(), (V{1, 3, 2}));
    });

    TEST("a miss does not change the order", "cap 2: put 1, put 2, get 9, put 3", [] {
        LRUCache c(2); c.put(1, 1); c.put(2, 2); c.get(9); c.put(3, 3);
        EQ(c.keys(), (V{3, 2}));
    });

    TEST("100,000 operations stay fast (O(1) each)", "cap 1000, 100k mixed ops", [] {
        LRUCache c(1000);
        for (int i = 0; i < 100000; i++) { c.put(i % 5000, i); c.get((i * 7) % 5000); }
        EQ((int)c.keys().size(), 1000);
    });

    return lab::summary();
}
