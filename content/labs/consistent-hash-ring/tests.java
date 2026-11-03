import java.util.*;

public class LabTests {
    static final List<String> KEYS = new ArrayList<>();
    static { for (int i = 0; i < 10000; i++) KEYS.add("key-" + i); }
    static final List<String> NODES = List.of("node-A", "node-B", "node-C");

    static HashRing ring(List<String> nodes, int vnodes) {
        HashRing r = new HashRing(vnodes);
        for (String n : nodes) r.addNode(n);
        return r;
    }

    static HashRing ring(List<String> nodes) { return ring(nodes, 100); }

    static List<String> with(List<String> a, String extra) { List<String> out = new ArrayList<>(a); out.add(extra); return out; }

    public static void main(String[] args) {
        T.test("FNV-1a 32-bit matches the published test vectors (UTF-8 bytes)", "fnv1a32('') / 'a' / 'foobar' / 'café'; hash32('a')", () ->
            T.eq(List.of(Hashing.fnv1a32(""), Hashing.fnv1a32("a"), Hashing.fnv1a32("foobar"), Hashing.fnv1a32("café"), Hashing.hash32("a")),
                 List.of(0x811c9dc5L, 0xe40c292cL, 0xbf9cf968L, 0xa82b5049L, 0x1a80b1b3L)));

        T.test("an empty ring throws NoSuchElementException", "new HashRing().getNode('k')", () -> {
            HashRing r = new HashRing();
            T.raises(NoSuchElementException.class, () -> r.getNode("k"));
        });

        T.test("a single node owns every key", "add node-A; 1,000 keys", () -> {
            HashRing r = ring(List.of("node-A"));
            Set<String> owners = new HashSet<>();
            for (String k : KEYS.subList(0, 1000)) owners.add(r.getNode(k));
            T.eq(owners, Set.of("node-A"));
        });

        T.test("keys past the last point wrap around to the first", "vnodes=1, nodes A, B, C (C has the lowest position); keys k1 (above all points), k9 (below all)", () -> {
            HashRing r = ring(List.of("A", "B", "C"), 1);
            T.eq(List.of(r.getNode("k1"), r.getNode("k9"), r.getNode("k0")), List.of("C", "C", "A"));
        });

        T.test("ownership does not depend on the order nodes were added", "add A, B, C vs C, A, B", () -> {
            List<String> rev = new ArrayList<>(NODES); Collections.reverse(rev);
            HashRing a = ring(NODES), b = ring(rev);
            boolean same = true;
            for (String k : KEYS) same &= a.getNode(k).equals(b.getNode(k));
            T.eq(same, true);
        });

        T.test("100 vnodes spread keys evenly: each of 4 nodes owns 25% +/- 8%", "4 nodes x 100 vnodes, 10,000 keys", () -> {
            HashRing r = ring(with(NODES, "node-D"));
            Map<String, Integer> share = new HashMap<>();
            for (String k : KEYS) share.merge(r.getNode(k), 1, Integer::sum);
            boolean even = share.size() == 4;
            for (int c : share.values()) even &= c / 10000.0 >= 0.17 && c / 10000.0 <= 0.33;
            T.eq(even, true);
        });

        T.test("adding a 4th node moves about 1/4 of keys, all of them to the new node", "3 -> 4 nodes, 100 vnodes, 10,000 keys", () -> {
            HashRing r = ring(NODES);
            Map<String, String> before = new HashMap<>();
            for (String k : KEYS) before.put(k, r.getNode(k));
            r.addNode("node-D");
            int moved = 0; boolean allToD = true;
            for (String k : KEYS) {
                String now = r.getNode(k);
                if (!now.equals(before.get(k))) { moved++; allToD &= now.equals("node-D"); }
            }
            double frac = moved / 10000.0;
            T.eq(List.of(frac >= 0.15 && frac <= 0.35, allToD), List.of(true, true));
        });

        T.test("removing a node moves only that node's keys", "4 -> 3 nodes (remove node-B)", () -> {
            HashRing r = ring(with(NODES, "node-D"));
            Map<String, String> before = new HashMap<>();
            for (String k : KEYS) before.put(k, r.getNode(k));
            r.removeNode("node-B");
            boolean onlyB = true, bGone = true;
            for (String k : KEYS) {
                String now = r.getNode(k);
                onlyB &= now.equals(before.get(k)) != before.get(k).equals("node-B");
                bGone &= !now.equals("node-B");
            }
            T.eq(List.of(onlyB, bGone), List.of(true, true));
        });

        T.test("for contrast, hash mod N moves about 3/4 of keys going from 3 to 4", "hash32(key) % 3 vs % 4", () -> {
            int moved = 0;
            for (String k : KEYS) { long h = Hashing.hash32(k); if (h % 3 != h % 4) moved++; }
            T.approx(moved / 10000.0, 0.75, 0.03);
        });

        T.test("adding a node twice does not double its vnodes", "add A, B, A; remove A once", () -> {
            HashRing r = ring(List.of("A", "B", "A"));
            r.removeNode("A");
            Set<String> owners = new HashSet<>();
            for (String k : KEYS.subList(0, 500)) owners.add(r.getNode(k));
            T.eq(List.of(r.nodes(), owners), List.of(List.of("B"), Set.of("B")));
        });

        T.test("removing an unknown node throws IllegalArgumentException", "removeNode('ghost')", () -> {
            HashRing r = ring(NODES);
            T.raises(IllegalArgumentException.class, () -> r.removeNode("ghost"));
        });

        T.test("removing the last node leaves an empty ring", "add A; remove A; getNode", () -> {
            HashRing r = ring(List.of("A"));
            r.removeNode("A");
            T.raises(NoSuchElementException.class, () -> r.getNode("k"));
        });

        T.summary();
    }
}
