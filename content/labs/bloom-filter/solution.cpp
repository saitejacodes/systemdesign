#include <algorithm>
#include <cmath>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// optimalParams returns {m, k}; bad input throws std::invalid_argument.
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
    if (n < 1 || !(p > 0 && p < 1)) throw std::invalid_argument("need n >= 1 and 0 < p < 1");
    const double ln2 = std::log(2.0);
    auto m = (uint64_t)std::ceil(-(double)n * std::log(p) / (ln2 * ln2));
    int k = std::max(1, (int)std::lround((double)m / (double)n * ln2));
    return {m, k};
}

class BloomFilter {
    std::vector<uint8_t> bits;

public:
    uint64_t m;
    int k;

    BloomFilter(uint64_t n, double p) {
        auto mk = optimalParams(n, p);
        m = mk.first;
        k = mk.second;
        bits.assign((m + 7) / 8, 0);
    }

    // Kirsch–Mitzenmacher: k positions from two hashes, g_i = (h1 + i * h2) mod m.
    std::vector<uint64_t> indexes(const std::string& item) const {
        uint64_t h1 = fmix32(fnv1a32(item, FNV_OFFSET));
        uint64_t h2 = fmix32(fnv1a32(item, FNV_PRIME));
        std::vector<uint64_t> out;
        for (int i = 0; i < k; i++) out.push_back((h1 + (uint64_t)i * h2) % m);
        return out;
    }

    void add(const std::string& item) {
        for (uint64_t i : indexes(item)) bits[i >> 3] |= (uint8_t)(1u << (i & 7));
    }

    // One clear bit proves the item was never added; all set means "probably".
    bool mightContain(const std::string& item) const {
        for (uint64_t i : indexes(item)) if (!(bits[i >> 3] & (1u << (i & 7)))) return false;
        return true;
    }

    // (1 - e^(-k * count / m))^k: the false-positive rate after `count` insertions.
    double expectedFpRate(uint64_t count) const {
        return std::pow(1 - std::exp(-(double)k * (double)count / (double)m), k);
    }
};
