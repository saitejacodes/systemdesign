#include <unordered_map>
#include <vector>

// Keys and values are ints in C++; get returns -1 on a miss.
class LRUCache {
    struct Node {
        int key = 0, value = 0;
        Node *prev = nullptr, *next = nullptr;
    };

    int capacity;
    // TODO: an unordered_map from key to Node* (lookup only), and sentinel head/tail nodes

public:
    explicit LRUCache(int capacity) : capacity(capacity) {
        // TODO: link the sentinels to each other
    }

    int get(int key) {
        // TODO: return the value and move the node to the front, or -1
        return -1;
    }

    void put(int key, int value) {
        // TODO: update or insert at the front; evict (and delete) from the back when over capacity
    }

    std::vector<int> keys() const {
        // TODO: walk from head to tail
        return {};
    }
};
