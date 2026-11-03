import java.nio.charset.StandardCharsets;

// Hashes are unsigned 32-bit values held in a long; optimalParams returns {m, k}; bad input throws
// IllegalArgumentException.
// The hashes are given (and must stay exactly like this so every language agrees).
final class Hashing {
    static final long FNV_OFFSET = 0x811C9DC5L; // seed for h1 (the standard FNV-1a offset basis)
    static final long FNV_PRIME = 0x01000193L;  // also used as the seed for h2

    // FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32.
    static long fnv1a32(String data, long seed) {
        int h = (int) seed;
        for (byte b : data.getBytes(StandardCharsets.UTF_8)) h = (h ^ (b & 0xFF)) * 0x01000193;
        return h & 0xFFFFFFFFL;
    }

    // MurmurHash3's 32-bit finalizer, so every input bit affects every output bit.
    static long fmix32(long x) {
        int h = (int) x;
        h ^= h >>> 16;
        h *= 0x85EBCA6B;
        h ^= h >>> 13;
        h *= 0xC2B2AE35;
        h ^= h >>> 16;
        return h & 0xFFFFFFFFL;
    }
}

class BloomFilter {
    // Bits m and hash count k for n items at false-positive rate p.
    static long[] optimalParams(long n, double p) {
        // TODO: throw IllegalArgumentException unless n >= 1 and 0 < p < 1
        // TODO: m = ceil(-n ln p / (ln 2)^2), k = max(1, round((m / n) ln 2))
        return new long[] {0, 0};
    }

    final long m;
    final int k;

    BloomFilter(long n, double p) {
        long[] mk = optimalParams(n, p);
        m = mk[0];
        k = (int) mk[1];
        // TODO: a bit array of m bits (a byte[] of ceil(m / 8) bytes)
    }

    long[] indexes(String item) {
        // TODO: h1 = fmix32(fnv1a32(item, FNV_OFFSET)), h2 = fmix32(fnv1a32(item, FNV_PRIME))
        // TODO: return (h1 + i * h2) % m for i in 0..k-1
        return new long[0];
    }

    void add(String item) {
        // TODO: set every bit in indexes(item)
    }

    boolean mightContain(String item) {
        // TODO: true only if every bit in indexes(item) is set
        return false;
    }

    double expectedFpRate(long count) {
        // TODO: (1 - e^(-k * count / m))^k
        return 0;
    }
}
