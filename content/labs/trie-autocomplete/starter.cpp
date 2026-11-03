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

public:
    void insert(const std::string& word, int weight = 1) {
        // TODO: walk (creating nodes with std::make_unique) to the end of word, then ADD weight
    }

    int weight(const std::string& word) const {
        // TODO: walk the word; return the end node's weight, or 0 if the path is missing
        return 0;
    }

    std::vector<std::pair<std::string, int>> topK(const std::string& prefix, int k) const {
        // TODO: walk to the prefix node (missing -> {}), collect (word, weight) for every
        // word in its subtree, sort by weight descending then word ascending, keep k
        return {};
    }
};
