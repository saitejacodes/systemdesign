#include <algorithm>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

// In C++, topK returns a vector of (word, weight) pairs.
class Trie {
    struct Node {
        std::map<char, std::unique_ptr<Node>> children; // owned: freed with the trie
        int weight = 0;                                 // > 0 only where an inserted word ends
    };

    Node root;

    const Node* find(const std::string& prefix) const {
        const Node* node = &root;
        for (char ch : prefix) {
            auto it = node->children.find(ch);
            if (it == node->children.end()) return nullptr;
            node = it->second.get();
        }
        return node;
    }

public:
    void insert(const std::string& word, int weight = 1) {
        Node* node = &root;
        for (char ch : word) {
            auto& child = node->children[ch];
            if (!child) child = std::make_unique<Node>();
            node = child.get();
        }
        node->weight += weight; // re-inserting accumulates popularity
    }

    int weight(const std::string& word) const {
        const Node* n = find(word);
        return n ? n->weight : 0;
    }

    std::vector<std::pair<std::string, int>> topK(const std::string& prefix, int k) const {
        std::vector<std::pair<std::string, int>> found;
        const Node* start = find(prefix);
        if (!start || k <= 0) return found;
        // Iterative DFS over the prefix's subtree, carrying the characters spelled so far.
        std::vector<std::pair<const Node*, std::string>> stack{{start, prefix}};
        while (!stack.empty()) {
            auto [n, spelled] = stack.back();
            stack.pop_back();
            if (n->weight > 0) found.emplace_back(spelled, n->weight);
            for (const auto& [ch, child] : n->children) stack.emplace_back(child.get(), spelled + ch);
        }
        // Heaviest first, ties broken alphabetically.
        std::sort(found.begin(), found.end(), [](const auto& a, const auto& b) {
            return a.second != b.second ? a.second > b.second : a.first < b.first;
        });
        if ((int)found.size() > k) found.resize(k);
        return found;
    }
};
