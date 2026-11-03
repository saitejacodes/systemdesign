import java.util.*;

// Keys and values are Strings and versions are longs in Java; read returns a Versioned record or null,
// and an invalid configuration throws IllegalArgumentException.
record Versioned(long version, String value) {}

class QuorumError extends RuntimeException {
    QuorumError(String message) { super(message); }
}

class QuorumStore {
    final int n, w, r;
    private final List<Map<String, Versioned>> replicas = new ArrayList<>();
    private final boolean[] down;

    QuorumStore(int n, int w, int r) {
        // TODO: throw IllegalArgumentException unless n >= 1, 1 <= w <= n and 1 <= r <= n
        this.n = n; this.w = w; this.r = r;
        for (int i = 0; i < n; i++) replicas.add(new HashMap<>());
        down = new boolean[n];
    }

    void setDown(int i, boolean isDown) { down[i] = isDown; }
    void setDown(int i) { setDown(i, true); }

    boolean overlaps() {
        // TODO: is every read quorum guaranteed to share a replica with every write quorum?
        return false;
    }

    Versioned replicaValue(int i, String key) { return replicas.get(i).get(key); }

    int write(String key, String value, long version) {
        // TODO: store on every up replica (a replica keeps only the newest version),
        // count acks, throw QuorumError if acks < w, otherwise return acks
        return 0;
    }

    Versioned read(String key) {
        List<Integer> all = new ArrayList<>();
        for (int i = 0; i < n; i++) all.add(i);
        return read(key, all);
    }

    Versioned read(String key, List<Integer> order) {
        // TODO: contact the first r up replicas in order; throw QuorumError if fewer;
        // return the newest Versioned or null, and repair contacted replicas that were stale
        return null;
    }
}
