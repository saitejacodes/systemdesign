#include <algorithm>
#include <cstdint>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// An empty ring throws std::out_of_range; an unknown node or vnodes < 1 throws std::invalid_argument.
constexpr uint32_t FNV_OFFSET = 0x811C9DC5u; // 2166136261
constexpr uint32_t FNV_PRIME = 0x01000193u;  // 16777619

// FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32.
inline uint32_t fnv1a32(const std::string& data, uint32_t seed = FNV_OFFSET) {
    uint32_t h = seed;
    for (unsigned char b : data) h = (h ^ b) * FNV_PRIME;
    return h;
}

// MurmurHash3's 32-bit finalizer: spreads FNV's weak low-bit differences across all 32 bits.
inline uint32_t fmix32(uint32_t h) {
    h ^= h >> 16;
    h *= 0x85EBCA6Bu;
    h ^= h >> 13;
    h *= 0xC2B2AE35u;
    h ^= h >> 16;
    return h;
}

// Ring position of a node label or key: an integer in [0, 2^32).
inline uint32_t hash32(const std::string& s) { return fmix32(fnv1a32(s)); }

class HashRing {
    int vnodes;
    std::vector<std::pair<uint32_t, std::string>> points; // sorted by (pos, node)
    std::set<std::string> members;

public:
    explicit HashRing(int vnodes = 100) : vnodes(vnodes) {
        if (vnodes < 1) throw std::invalid_argument("vnodes must be >= 1");
    }

    void addNode(const std::string& node) {
        if (!members.insert(node).second) return; // adding again must not double its vnodes
        for (int i = 0; i < vnodes; i++) points.emplace_back(hash32(node + "#" + std::to_string(i)), node);
        std::sort(points.begin(), points.end());
    }

    void removeNode(const std::string& node) {
        if (members.erase(node) == 0) throw std::invalid_argument("unknown node " + node);
        points.erase(std::remove_if(points.begin(), points.end(), [&](const auto& p) { return p.second == node; }), points.end());
    }

    std::string getNode(const std::string& key) const {
        if (points.empty()) throw std::out_of_range("the ring is empty");
        // First point clockwise at or after the key's position; past the last point, wrap to 0.
        uint32_t h = hash32(key);
        auto it = std::lower_bound(points.begin(), points.end(), h, [](const auto& p, uint32_t v) { return p.first < v; });
        return it == points.end() ? points.front().second : it->second;
    }

    std::vector<std::string> nodes() const { return {members.begin(), members.end()}; }
};
