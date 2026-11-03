#include <algorithm>
#include <cstdint>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// An empty ring throws std::out_of_range; an unknown node or vnodes < 1 throws std::invalid_argument.
// The hash is given (and must stay exactly like this so every language agrees).
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
    // TODO: a vector of (pos, node) points kept sorted, and the set of node names

public:
    explicit HashRing(int vnodes = 100) : vnodes(vnodes) {
        // TODO: throw std::invalid_argument if vnodes < 1
    }

    void addNode(const std::string& node) {
        // TODO: no-op if already present; else add points hash32(node + "#" + std::to_string(i)) for i in 0..vnodes-1
    }

    void removeNode(const std::string& node) {
        // TODO: throw std::invalid_argument if unknown; else drop all of its points
    }

    std::string getNode(const std::string& key) const {
        // TODO: throw std::out_of_range on an empty ring
        // TODO: binary-search (std::lower_bound) the first point with pos >= hash32(key); wrap past the end
        return "";
    }

    std::vector<std::string> nodes() const {
        // TODO: the node names, sorted
        return {};
    }
};
