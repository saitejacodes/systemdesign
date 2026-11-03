#include <unordered_map>
#include <vector>

// Keys and values are ints in C++; get returns -1 on a miss.
class LRUCache {
    struct Node {
        int key = 0, value = 0;
        Node *prev = nullptr, *next = nullptr;
    };

    int capacity;
    std::unordered_map<int, Node*> map;
    Node head, tail;

    void unlink(Node* n) { n->prev->next = n->next; n->next->prev = n->prev; }
    void pushFront(Node* n) {
        n->prev = &head; n->next = head.next;
        head.next->prev = n; head.next = n;
    }

public:
    explicit LRUCache(int capacity) : capacity(capacity) { head.next = &tail; tail.prev = &head; }
    ~LRUCache() { for (auto& [k, n] : map) delete n; }
    LRUCache(const LRUCache&) = delete;
    LRUCache& operator=(const LRUCache&) = delete;

    int get(int key) {
        auto it = map.find(key);
        if (it == map.end()) return -1;
        unlink(it->second); pushFront(it->second);
        return it->second->value;
    }

    void put(int key, int value) {
        auto it = map.find(key);
        if (it != map.end()) { it->second->value = value; unlink(it->second); pushFront(it->second); return; }
        Node* n = new Node{key, value};
        map[key] = n;
        pushFront(n);
        if ((int)map.size() > capacity) {
            Node* lru = tail.prev;
            unlink(lru);
            map.erase(lru->key);
            delete lru;
        }
    }

    std::vector<int> keys() const {
        std::vector<int> out;
        for (Node* n = head.next; n != &tail; n = n->next) out.push_back(n->key);
        return out;
    }
};
