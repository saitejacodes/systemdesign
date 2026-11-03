#include <cstdint>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// In C++ a proof is a vector of (side, hash) pairs, diff returns a vector<int>, an empty tree or mismatched diff
// throws std::invalid_argument, and a bad proof index throws std::out_of_range. Strings are treated as UTF-8 bytes.
using Step = std::pair<std::string, std::string>;

// 64-bit FNV-1a over the bytes of text, as 16 lowercase hex digits. Given: you don't need to change it.
std::string fnv1a64(const std::string& text) {
    uint64_t h = 0xcbf29ce484222325ULL;
    for (unsigned char b : text) h = (h ^ b) * 0x100000001b3ULL;
    char buf[17];
    std::snprintf(buf, sizeof buf, "%016llx", (unsigned long long)h);
    return buf;
}

// std::string(1, '\0') because "\0" + s would be empty.
std::string leafHash(const std::string& data) { return fnv1a64(std::string(1, '\0') + data); }
std::string nodeHash(const std::string& left, const std::string& right) { return fnv1a64(std::string(1, '\1') + left + right); }

class MerkleTree {
public:
    std::vector<std::vector<std::string>> levels; // levels[0] = leaf hashes, back() = {root}
    int compared = 0;

    explicit MerkleTree(const std::vector<std::string>& leaves) {
        // TODO: throw std::invalid_argument on an empty vector. Build levels bottom-up:
        // pair neighbours with nodeHash; an odd last node is promoted unchanged
        std::vector<std::string> level;
        for (const auto& x : leaves) level.push_back(leafHash(x));
        levels.push_back(level);
    }

    std::string root() const {
        // TODO: the single hash on the top level
        return levels[0].empty() ? "" : levels[0][0];
    }

    std::vector<Step> proof(int i) const {
        // TODO: throw std::out_of_range if i is out of range; walk up collecting {"L" or "R", sibling hash},
        // skipping levels where the node has no sibling
        return {};
    }

    std::vector<int> diff(const MerkleTree& other) {
        // TODO: throw std::invalid_argument if the leaf counts differ; compare from the root down, descending only
        // where hashes differ; count every node pair compared in `compared`; return sorted leaf indices
        return {};
    }
};

bool verify(const std::string& leaf, const std::vector<Step>& proof, const std::string& root) {
    // TODO: rehash from leafHash(leaf) up the proof and compare with root
    return false;
}
