#include <cstdint>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// In C++ a proof is a vector of (side, hash) pairs, diff returns a vector<int>, an empty tree or mismatched diff
// throws std::invalid_argument, and a bad proof index throws std::out_of_range. Strings are treated as UTF-8 bytes.
using Step = std::pair<std::string, std::string>;

// 64-bit FNV-1a over the bytes of text, as 16 lowercase hex digits. uint64_t wraps mod 2^64, as FNV needs.
std::string fnv1a64(const std::string& text) {
    uint64_t h = 0xcbf29ce484222325ULL;
    for (unsigned char b : text) h = (h ^ b) * 0x100000001b3ULL;
    char buf[17];
    std::snprintf(buf, sizeof buf, "%016llx", (unsigned long long)h);
    return buf;
}

// 0x00 / 0x01 prefixes keep a leaf from posing as an inner node. std::string(1, '\0') because "\0" + s would be empty.
std::string leafHash(const std::string& data) { return fnv1a64(std::string(1, '\0') + data); }
std::string nodeHash(const std::string& left, const std::string& right) { return fnv1a64(std::string(1, '\1') + left + right); }

class MerkleTree {
public:
    std::vector<std::vector<std::string>> levels; // levels[0] = leaf hashes, back() = {root}
    int compared = 0;

    explicit MerkleTree(const std::vector<std::string>& leaves) {
        if (leaves.empty()) throw std::invalid_argument("a Merkle tree needs at least one leaf");
        std::vector<std::string> level;
        for (const auto& x : leaves) level.push_back(leafHash(x));
        levels.push_back(level);
        while (level.size() > 1) {
            std::vector<std::string> next;
            for (size_t i = 0; i + 1 < level.size(); i += 2) next.push_back(nodeHash(level[i], level[i + 1]));
            if (level.size() % 2) next.push_back(level.back()); // odd node out is promoted unchanged, not duplicated
            levels.push_back(next);
            level = next;
        }
    }

    std::string root() const { return levels.back()[0]; }

    std::vector<Step> proof(int i) const {
        if (i < 0 || i >= (int)levels[0].size()) throw std::out_of_range("leaf index out of range");
        std::vector<Step> path;
        for (size_t d = 0; d + 1 < levels.size(); d++) {
            int sib = i ^ 1;
            if (sib < (int)levels[d].size()) path.push_back({sib < i ? "L" : "R", levels[d][sib]}); // promoted: no sibling
            i /= 2;
        }
        return path;
    }

    std::vector<int> diff(const MerkleTree& other) {
        if (levels[0].size() != other.levels[0].size()) throw std::invalid_argument("trees must have the same number of leaves");
        compared = 0;
        std::vector<int> out;
        walk(other, (int)levels.size() - 1, 0, out);
        return out;
    }

private:
    void walk(const MerkleTree& other, int depth, int j, std::vector<int>& out) {
        compared++;
        if (levels[depth][j] == other.levels[depth][j]) return; // identical subtree: skip every leaf under it
        if (depth == 0) { out.push_back(j); return; }
        walk(other, depth - 1, 2 * j, out);
        if (2 * j + 1 < (int)levels[depth - 1].size()) walk(other, depth - 1, 2 * j + 1, out);
    }
};

bool verify(const std::string& leaf, const std::vector<Step>& proof, const std::string& root) {
    std::string h = leafHash(leaf);
    for (const auto& [side, sib] : proof) h = side == "L" ? nodeHash(sib, h) : nodeHash(h, sib);
    return h == root;
}
