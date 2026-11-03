import java.nio.charset.StandardCharsets;
import java.util.*;

// Hashes are unsigned 32-bit values held in a long. An empty ring throws NoSuchElementException,
// an unknown node IllegalArgumentException.
// The hash is given (and must stay exactly like this so every language agrees).
final class Hashing {
    static final long FNV_OFFSET = 0x811C9DC5L; // 2166136261
    static final int FNV_PRIME = 0x01000193;    // 16777619

    // FNV-1a, 32-bit, over the UTF-8 bytes of `data`: h = (h XOR byte) * prime mod 2^32.
    static long fnv1a32(String data, long seed) {
        int h = (int) seed;
        for (byte b : data.getBytes(StandardCharsets.UTF_8)) h = (h ^ (b & 0xFF)) * FNV_PRIME;
        return h & 0xFFFFFFFFL;
    }

    static long fnv1a32(String data) { return fnv1a32(data, FNV_OFFSET); }

    // MurmurHash3's 32-bit finalizer: spreads FNV's weak low-bit differences across all 32 bits.
    static long fmix32(long x) {
        int h = (int) x;
        h ^= h >>> 16;
        h *= 0x85EBCA6B;
        h ^= h >>> 13;
        h *= 0xC2B2AE35;
        h ^= h >>> 16;
        return h & 0xFFFFFFFFL;
    }

    // Ring position of a node label or key: an integer in [0, 2^32).
    static long hash32(String s) { return fmix32(fnv1a32(s)); }
}

class HashRing {
    private final int vnodes;

    HashRing() { this(100); }

    HashRing(int vnodes) {
        // TODO: throw IllegalArgumentException if vnodes < 1
        this.vnodes = vnodes;
        // TODO: a list of (pos, node) points kept sorted by pos then node, and the set of node names
    }

    void addNode(String node) {
        // TODO: no-op if already present; else add points Hashing.hash32(node + "#" + i) for i in 0..vnodes-1
    }

    void removeNode(String node) {
        // TODO: throw IllegalArgumentException if unknown; else drop all of its points
    }

    String getNode(String key) {
        // TODO: throw NoSuchElementException on an empty ring
        // TODO: binary-search the first point with pos >= hash32(key); wrap past the end
        return "";
    }

    List<String> nodes() {
        // TODO: the node names, sorted
        return new ArrayList<>();
    }
}
