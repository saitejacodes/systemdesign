import java.nio.charset.StandardCharsets;

// Hashes are unsigned 32-bit values held in a long; optimalParams returns {m, k}; bad input throws
// IllegalArgumentException.
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
        if (n < 1 || !(p > 0 && p < 1)) throw new IllegalArgumentException("need n >= 1 and 0 < p < 1");
        long m = (long) Math.ceil(-n * Math.log(p) / (Math.log(2) * Math.log(2)));
        long k = Math.max(1, Math.round((double) m / n * Math.log(2)));
        return new long[] {m, k};
    }

    final long m;
    final int k;
    private final byte[] bits;

    BloomFilter(long n, double p) {
        long[] mk = optimalParams(n, p);
        m = mk[0];
        k = (int) mk[1];
        bits = new byte[(int) ((m + 7) / 8)];
    }

    // Kirsch–Mitzenmacher: k positions from two hashes, g_i = (h1 + i * h2) mod m.
    long[] indexes(String item) {
        long h1 = Hashing.fmix32(Hashing.fnv1a32(item, Hashing.FNV_OFFSET));
        long h2 = Hashing.fmix32(Hashing.fnv1a32(item, Hashing.FNV_PRIME));
        long[] out = new long[k];
        for (int i = 0; i < k; i++) out[i] = (h1 + i * h2) % m;
        return out;
    }

    void add(String item) {
        for (long i : indexes(item)) bits[(int) (i >>> 3)] |= (byte) (1 << (i & 7));
    }

    // One clear bit proves the item was never added; all set means "probably".
    boolean mightContain(String item) {
        for (long i : indexes(item)) if ((bits[(int) (i >>> 3)] & (1 << (i & 7))) == 0) return false;
        return true;
    }

    // (1 - e^(-k * count / m))^k: the false-positive rate after `count` insertions.
    double expectedFpRate(long count) {
        return Math.pow(1 - Math.exp(-(double) k * count / m), k);
    }
}
