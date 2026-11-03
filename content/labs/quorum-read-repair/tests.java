import java.util.*;

public class LabTests {
    static QuorumStore store(int n, int w, int r, int... down) {
        QuorumStore s = new QuorumStore(n, w, r);
        for (int i : down) s.setDown(i);
        return s;
    }

    static List<List<Integer>> permutations(List<Integer> xs) {
        if (xs.size() <= 1) return List.of(xs);
        List<List<Integer>> out = new ArrayList<>();
        for (int i = 0; i < xs.size(); i++) {
            List<Integer> rest = new ArrayList<>(xs); Integer h = rest.remove(i);
            for (List<Integer> p : permutations(rest)) { List<Integer> q = new ArrayList<>(); q.add(h); q.addAll(p); out.add(q); }
        }
        return out;
    }

    static Versioned v(long version, String value) { return new Versioned(version, value); }

    public static void main(String[] args) {
        T.test("an impossible configuration is rejected", "new QuorumStore(3, 4, 2) and new QuorumStore(3, 2, 0)", () -> {
            T.raises(IllegalArgumentException.class, () -> new QuorumStore(3, 4, 2));
            T.raises(IllegalArgumentException.class, () -> new QuorumStore(3, 2, 0));
        });

        T.test("overlaps() is true exactly when R + W > N", "(3,2,2) (3,3,1) (3,1,1) (5,3,3) (5,2,3)", () -> {
            int[][] cfgs = {{3, 2, 2}, {3, 3, 1}, {3, 1, 1}, {5, 3, 3}, {5, 2, 3}};
            List<Boolean> got = new ArrayList<>();
            for (int[] c : cfgs) got.add(new QuorumStore(c[0], c[1], c[2]).overlaps());
            T.eq(got, List.of(true, true, false, true, false));
        });

        T.test("write then read returns the newest (version, value)", "(3,2,2): write v1, write v2, read", () -> {
            QuorumStore s = store(3, 2, 2);
            s.write("k", "a", 1);
            int acks = s.write("k", "b", 2);
            T.eq(acks, 3);
            T.eq(s.read("k"), v(2, "b"));
        });

        T.test("reading a key nobody has returns null", "(3,2,2): read(\"missing\")", () -> T.eq(store(3, 2, 2).read("missing"), null));

        T.test("a write with fewer than W replicas up raises", "(3,2,2), replicas 1 and 2 down: write", () -> {
            QuorumStore s = store(3, 2, 2, 1, 2);
            T.raises(QuorumError.class, () -> s.write("k", "a", 1));
        });

        T.test("a failed write is not rolled back on the replica that took it", "(3,2,2), 1 and 2 down: write fails; inspect replica 0", () -> {
            QuorumStore s = store(3, 2, 2, 1, 2);
            try { s.write("seat", "Maya", 1); } catch (QuorumError e) { /* expected */ }
            T.eq(s.replicaValue(0, "seat"), v(1, "Maya"));
            T.eq(s.replicaValue(1, "seat"), null);
        });

        T.test("a read with fewer than R replicas up raises", "(3,2,2), replicas 0 and 2 down: read", () -> {
            QuorumStore s = store(3, 2, 2);
            s.write("k", "a", 1);
            s.setDown(0); s.setDown(2);
            T.raises(QuorumError.class, () -> s.read("k"));
        });

        T.test("an older version arriving late does not overwrite a newer one", "write v5 then write v3", () -> {
            QuorumStore s = store(3, 2, 2);
            s.write("k", "new", 5);
            T.eq(s.write("k", "old", 3), 3);
            T.eq(s.read("k"), v(5, "new"));
            T.eq(s.replicaValue(2, "k"), v(5, "new"));
        });

        T.test("R + W > N: a read reaches the latest write even after a replica missed it", "(3,2,2): 2 misses v2; then 0 down; read hits 1, 2", () -> {
            QuorumStore s = store(3, 2, 2);
            s.write("k", "v1", 1);
            s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
            s.setDown(0);
            T.eq(s.read("k"), v(2, "v2"));
        });

        T.test("every write quorum meets every read quorum for (5,3,3)", "all 10 write sets x all 120 read orders", () -> {
            int stale = 0;
            List<List<Integer>> orders = permutations(List.of(0, 1, 2, 3, 4));
            for (int a = 0; a < 5; a++) for (int b = a + 1; b < 5; b++) for (int c = b + 1; c < 5; c++) {
                Set<Integer> ws = Set.of(a, b, c);
                for (List<Integer> order : orders) {
                    QuorumStore s = store(5, 3, 3);
                    s.write("k", "old", 1);
                    for (int i = 0; i < 5; i++) if (!ws.contains(i)) s.setDown(i);
                    s.write("k", "new", 2);
                    for (int i = 0; i < 5; i++) s.setDown(i, false);
                    if (!v(2, "new").equals(s.read("k", order))) stale++;
                }
            }
            T.eq(stale, 0);
        });

        T.test("W = 1, R = 1: a read can miss an acknowledged write", "(3,1,1): write v2 lands on 0 only; read from 1", () -> {
            QuorumStore s = store(3, 1, 1);
            s.write("k", "v1", 1);
            s.setDown(1); s.setDown(2);
            T.eq(s.write("k", "v2", 2), 1);
            s.setDown(1, false); s.setDown(2, false);
            T.eq(s.read("k", List.of(1, 0, 2)), v(1, "v1"));
        });

        T.test("read repair updates the stale replica it contacted", "(3,2,2): 2 misses v2; read order [2, 0]", () -> {
            QuorumStore s = store(3, 2, 2);
            s.write("k", "v1", 1);
            s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
            T.eq(s.replicaValue(2, "k"), v(1, "v1"));
            T.eq(s.read("k", List.of(2, 0, 1)), v(2, "v2"));
            T.eq(s.replicaValue(2, "k"), v(2, "v2"));
        });

        T.test("read repair does not touch replicas outside the read quorum", "(3,2,2): 2 misses v2; read order [0, 1]", () -> {
            QuorumStore s = store(3, 2, 2);
            s.write("k", "v1", 1);
            s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
            s.read("k", List.of(0, 1, 2));
            T.eq(s.replicaValue(2, "k"), v(1, "v1"));
        });

        T.test("a replica missing the key entirely is repaired too", "(3,2,2): 1 down for the only write; read order [1, 0]", () -> {
            QuorumStore s = store(3, 2, 2, 1);
            s.write("k", "v1", 7);
            s.setDown(1, false);
            s.read("k", List.of(1, 0, 2));
            T.eq(s.replicaValue(1, "k"), v(7, "v1"));
        });

        T.summary();
    }
}
