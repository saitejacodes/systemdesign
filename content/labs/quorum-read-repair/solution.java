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
        if (!(n >= 1 && w >= 1 && w <= n && r >= 1 && r <= n))
            throw new IllegalArgumentException("need n >= 1, 1 <= w <= n and 1 <= r <= n");
        this.n = n; this.w = w; this.r = r;
        for (int i = 0; i < n; i++) replicas.add(new HashMap<>());
        down = new boolean[n];
    }

    void setDown(int i, boolean isDown) { down[i] = isDown; }
    void setDown(int i) { setDown(i, true); }

    // Pigeonhole: a read quorum and a write quorum must share a replica iff R + W > N.
    boolean overlaps() { return r + w > n; }

    Versioned replicaValue(int i, String key) { return replicas.get(i).get(key); }

    // A replica keeps whichever version is newest; an older or equal write is acknowledged but ignored.
    private void store(int i, String key, Versioned v) {
        Versioned cur = replicas.get(i).get(key);
        if (cur == null || v.version() > cur.version()) replicas.get(i).put(key, v);
    }

    int write(String key, String value, long version) {
        int acks = 0;
        for (int i = 0; i < n; i++) {
            if (!down[i]) { store(i, key, new Versioned(version, value)); acks++; }
        }
        // Replicas that did accept the write keep it even if the quorum fails: there is no rollback.
        if (acks < w) throw new QuorumError("write got " + acks + " acks, needs " + w);
        return acks;
    }

    Versioned read(String key) {
        List<Integer> all = new ArrayList<>();
        for (int i = 0; i < n; i++) all.add(i);
        return read(key, all);
    }

    Versioned read(String key, List<Integer> order) {
        List<Integer> contacted = new ArrayList<>();
        for (int i : order) if (!down[i] && contacted.size() < r) contacted.add(i);
        if (contacted.size() < r) throw new QuorumError("read reached " + contacted.size() + " replicas, needs " + r);
        Versioned newest = null;
        List<Versioned> answers = new ArrayList<>();
        for (int i : contacted) {
            Versioned a = replicas.get(i).get(key);
            answers.add(a);
            if (a != null && (newest == null || a.version() > newest.version())) newest = a;
        }
        if (newest == null) return null;
        // Read repair: push the newest version to every contacted replica that returned something older.
        for (int k = 0; k < contacted.size(); k++) {
            Versioned a = answers.get(k);
            if (a == null || a.version() < newest.version()) store(contacted.get(k), key, newest);
        }
        return newest;
    }
}
