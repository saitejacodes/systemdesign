import java.nio.charset.StandardCharsets;
import java.util.*;

// Hashes are unsigned 32-bit values held in a long. An empty ring throws NoSuchElementException,
// an unknown node IllegalArgumentException.
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
    private record Point(long pos, String node) {}
    private static final Comparator<Point> ORDER = Comparator.comparingLong(Point::pos).thenComparing(Point::node);

    private final int vnodes;
    private List<Point> points = new ArrayList<>(); // sorted by (pos, node)
    private final Set<String> members = new HashSet<>();

    HashRing() { this(100); }

    HashRing(int vnodes) {
        if (vnodes < 1) throw new IllegalArgumentException("vnodes must be >= 1");
        this.vnodes = vnodes;
    }

    // Index of the first point with pos >= h (points.size() if none).
    private int lowerBound(long h) {
        int lo = 0, hi = points.size();
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (points.get(mid).pos() < h) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    void addNode(String node) {
        if (!members.add(node)) return; // adding again must not double its vnodes
        for (int i = 0; i < vnodes; i++) points.add(new Point(Hashing.hash32(node + "#" + i), node));
        points.sort(ORDER);
    }

    void removeNode(String node) {
        if (!members.remove(node)) throw new IllegalArgumentException("unknown node " + node);
        points.removeIf(p -> p.node().equals(node));
    }

    String getNode(String key) {
        if (points.isEmpty()) throw new NoSuchElementException("the ring is empty");
        // First point clockwise at or after the key's position; past the last point, wrap to 0.
        return points.get(lowerBound(Hashing.hash32(key)) % points.size()).node();
    }

    List<String> nodes() {
        List<String> out = new ArrayList<>(members);
        Collections.sort(out);
        return out;
    }
}
