#include <algorithm>
#include <cmath>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// optimalParams returns {m, k}; bad input throws std::invalid_argument.
// The hashes are given (and must stay exactly like this so every language agrees).
constexpr uint32_t FNV_OFFSET = 0x811C9DC5u; // seed for h1 (the standard FNV-1a offset basis)
constexpr uint32_t FNV_PRIME = 0x01000193u;  // also used as the seed for h2

// FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32.
inline uint32_t fnv1a32(const std::string& data, uint32_t seed = FNV_OFFSET) {
    uint32_t h = seed;
    for (unsigned char b : data) h = (h ^ b) * FNV_PRIME;
    return h;
}

// MurmurHash3's 32-bit finalizer, so every input bit affects every output bit.
inline uint32_t fmix32(uint32_t h) {
    h ^= h >> 16;
    h *= 0x85EBCA6Bu;
    h ^= h >> 13;
    h *= 0xC2B2AE35u;
    h ^= h >> 16;
    return h;
}

// Bits m and hash count k for n items at false-positive rate p.
inline std::pair<uint64_t, int> optimalParams(uint64_t n, double p) {
    // TODO: throw std::invalid_argument unless n >= 1 and 0 < p < 1
    // TODO: m = ceil(-n ln p / (ln 2)^2), k = max(1, round((m / n) ln 2))
    return {0, 0};
}

class BloomFilter {
public:
    uint64_t m;
    int k;

    BloomFilter(uint64_t n, double p) {
        auto mk = optimalParams(n, p);
        m = mk.first;
        k = mk.second;
        // TODO: a bit array of m bits (a std::vector<uint8_t> of ceil(m / 8) bytes)
    }

    std::vector<uint64_t> indexes(const std::string& item) const {
        // TODO: h1 = fmix32(fnv1a32(item, FNV_OFFSET)), h2 = fmix32(fnv1a32(item, FNV_PRIME))
        // TODO: return (h1 + i * h2) % m for i in 0..k-1 (use 64-bit arithmetic)
        return {};
    }

    void add(const std::string& item) {
        // TODO: set every bit in indexes(item)
    }

    bool mightContain(const std::string& item) const {
        // TODO: true only if every bit in indexes(item) is set
        return false;
    }

    double expectedFpRate(uint64_t count) const {
        // TODO: (1 - e^(-k * count / m))^k
        return 0;
    }
};
