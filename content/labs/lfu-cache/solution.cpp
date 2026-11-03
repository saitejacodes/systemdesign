#include <list>
#include <unordered_map>

// Keys and values are ints in C++; get returns -1 on a miss.
class LFUCache {
    struct Entry {
        int value, freq;
        std::list<int>::iterator pos; // where the key sits in its bucket
    };

    int capacity;
    int minFreq = 0;
    std::unordered_map<int, Entry> entries;
    // freq -> keys, least recently used at the front, most recent at the back
    std::unordered_map<int, std::list<int>> buckets;

    // Move key from bucket f to bucket f + 1, as its most recent entry.
    void touch(int key, Entry& e) {
        int f = e.freq;
        auto& b = buckets[f];
        b.erase(e.pos);
        if (b.empty()) {
            buckets.erase(f);
            if (minFreq == f) minFreq = f + 1; // the key is about to land there
        }
        e.freq = f + 1;
        auto& nb = buckets[f + 1];
        e.pos = nb.insert(nb.end(), key);
    }

public:
    explicit LFUCache(int capacity) : capacity(capacity) {}

    int get(int key) {
        auto it = entries.find(key);
        if (it == entries.end()) return -1;
        touch(key, it->second);
        return it->second.value;
    }

    void put(int key, int value) {
        if (capacity <= 0) return;
        auto it = entries.find(key);
        if (it != entries.end()) { it->second.value = value; touch(key, it->second); return; }
        if ((int)entries.size() >= capacity) {
            // Lowest frequency first; within it, the least recently used key.
            auto& b = buckets[minFreq];
            int victim = b.front();
            b.pop_front();
            if (b.empty()) buckets.erase(minFreq);
            entries.erase(victim);
        }
        auto& ones = buckets[1];
        entries[key] = Entry{value, 1, ones.insert(ones.end(), key)};
        minFreq = 1;
    }

    int freq(int key) const {
        auto it = entries.find(key);
        return it == entries.end() ? 0 : it->second.freq;
    }
};
