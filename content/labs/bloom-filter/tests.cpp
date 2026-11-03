#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

using MK = std::pair<uint64_t, int>;
using U = std::vector<uint64_t>;

static BloomFilter filled(uint64_t n, double p, int count) {
    BloomFilter b(n, p);
    for (int i = 0; i < count; i++) b.add("item-" + std::to_string(i));
    return b;
}

static double fpRate(const BloomFilter& b) {
    int c = 0;
    for (int i = 0; i < 10000; i++) if (b.mightContain("probe-" + std::to_string(i))) c++;
    return c / 10000.0;
}

int main() {
    TEST("sizing: n=1,000, p=1% gives m=9,586 bits, k=7", "optimalParams(1000, 0.01)", [] {
        EQ(optimalParams(1000, 0.01), (MK{9586, 7}));
    });

    TEST("sizing from the lesson: 100M IDs at 0.1% is about 14.4 bits per ID, k=10", "optimalParams(100'000'000, 0.001)", [] {
        auto mk = optimalParams(100000000, 0.001);
        EQ(mk.second, 10);
        APPROX(mk.first / 1e8, 14.38, 0.005);
    });

    TEST("k is never 0: p=0.5 gives a single hash", "optimalParams(1000, 0.5)", [] {
        EQ(optimalParams(1000, 0.5), (MK{1443, 1}));
    });

    TEST("an empty filter contains nothing", "BloomFilter(1000, 0.01); mightContain x 1,000", [] {
        BloomFilter b(1000, 0.01);
        bool any = false;
        for (int i = 0; i < 1000; i++) any = any || b.mightContain("item-" + std::to_string(i));
        EQ(any, false);
    });

    TEST("indexes use double hashing: (h1 + i*h2) mod m", "indexes('hello') for n=1000, p=0.01", [] {
        BloomFilter b(1000, 0.01);
        uint64_t h1 = fmix32(fnv1a32("hello", 0x811C9DC5u));
        uint64_t h2 = fmix32(fnv1a32("hello", 0x01000193u));
        U want;
        for (uint64_t i = 0; i < 7; i++) want.push_back((h1 + i * h2) % 9586);
        EQ(b.indexes("hello"), want);
    });

    TEST("no false negatives: every added item is found", "n=2000, p=0.01; add 2,000 items", [] {
        BloomFilter b = filled(2000, 0.01, 2000);
        bool all = true;
        for (int i = 0; i < 2000; i++) all = all && b.mightContain("item-" + std::to_string(i));
        EQ(all, true);
    });

    TEST("the measured false-positive rate is near the target", "n=2000, p=0.01; 10,000 non-member probes", [] {
        APPROX(fpRate(filled(2000, 0.01, 2000)), 0.01, 0.004);
    });

    TEST("at design load, the formula predicts p", "n=1000, p=0.01; expectedFpRate(1000)", [] {
        APPROX(BloomFilter(1000, 0.01).expectedFpRate(1000), 0.01, 0.0005);
    });

    TEST("overfilled 4x, false positives explode, as the formula predicts", "n=2000, p=0.01; add 8,000 items", [] {
        BloomFilter b = filled(2000, 0.01, 8000);
        double measured = fpRate(b);
        double predicted = b.expectedFpRate(8000);
        EQ(measured > 0.5, true);
        APPROX(measured, predicted, 0.05);
    });

    TEST("non-ASCII items hash their UTF-8 bytes", "fnv1a32('café'); add 'café'", [] {
        BloomFilter b(100, 0.01);
        b.add("café");
        EQ(fnv1a32("café"), 0xa82b5049u);
        EQ(b.mightContain("café"), true);
        EQ(b.indexes("café") != b.indexes("cafe"), true);
    });

    TEST("p = 1 throws std::invalid_argument", "BloomFilter(1000, 1.0)", [] {
        RAISES(std::invalid_argument, [] { BloomFilter b(1000, 1.0); });
    });

    TEST("n = 0 throws std::invalid_argument", "BloomFilter(0, 0.01)", [] {
        RAISES(std::invalid_argument, [] { BloomFilter b(0, 0.01); });
    });

    return lab::summary();
}
