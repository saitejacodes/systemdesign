import java.util.*;

public class LabTests {
    static List<String> blocks(int n, String prefix) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(prefix + i);
        return out;
    }

    static List<String> blocks(int n) { return blocks(n, "block-"); }

    static List<String> sides(List<Step> proof) {
        List<String> out = new ArrayList<>();
        for (Step s : proof) out.add(s.side());
        return out;
    }

    public static void main(String[] args) {
        T.test("fnv1a64 matches the published FNV-1a 64-bit test vectors", "fnv1a64(\"\"), fnv1a64(\"a\"), fnv1a64(\"foobar\")",
            () -> T.eq(List.of(Merkle.fnv1a64(""), Merkle.fnv1a64("a"), Merkle.fnv1a64("foobar")), List.of("cbf29ce484222325", "af63dc4c8601ec8c", "85944171f73967e8")));

        T.test("one leaf: the root is the leaf hash; two leaves: the root is their node hash", "new MerkleTree([\"only\"]), new MerkleTree([\"a\", \"b\"])", () -> {
            MerkleTree one = new MerkleTree(List.of("only")), two = new MerkleTree(List.of("a", "b"));
            T.eq(one.root(), Merkle.fnv1a64("\u0000only"));
            T.eq(two.root(), Merkle.nodeHash(Merkle.leafHash("a"), Merkle.leafHash("b")));
            T.eq(two.root(), "4ed018693fe30ca0");
        });

        T.test("an odd last node is promoted, so [a, b, c] and [a, b, c, c] differ", "new MerkleTree([a, b, c]) vs [a, b, c, c]", () -> {
            MerkleTree t = new MerkleTree(List.of("a", "b", "c"));
            T.eq(t.root(), "57c9daf1a831262e");
            T.eq(t.root(), Merkle.nodeHash(Merkle.nodeHash(Merkle.leafHash("a"), Merkle.leafHash("b")), Merkle.leafHash("c")));
            T.eq(t.root().equals(new MerkleTree(List.of("a", "b", "c", "c")).root()), false);
        });

        T.test("changing or reordering any leaf changes the root", "8 blocks: edit each one in turn, then swap 0 and 1", () -> {
            List<String> base = blocks(8);
            String r = new MerkleTree(base).root();
            boolean all = true;
            for (int i = 0; i < 8; i++) {
                List<String> xs = new ArrayList<>(base); xs.set(i, xs.get(i) + "x");
                all &= !new MerkleTree(xs).root().equals(r);
            }
            List<String> swapped = new ArrayList<>(base); Collections.swap(swapped, 0, 1);
            T.eq(List.of(all, !new MerkleTree(swapped).root().equals(r)), List.of(true, true));
        });

        T.test("every leaf's proof verifies, for trees of 1 to 9 leaves", "for n in 1..9, for i in 0..n-1: verify(leaf i, proof(i), root)", () -> {
            int bad = 0;
            for (int n = 1; n <= 9; n++) {
                List<String> xs = blocks(n); MerkleTree t = new MerkleTree(xs);
                for (int i = 0; i < n; i++) if (!Merkle.verify(xs.get(i), t.proof(i), t.root())) bad++;
            }
            T.eq(bad, 0);
        });

        T.test("proof shape: one sibling per level, none where a node was promoted", "8 leaves proof(5); 5 leaves proof(4); 1 leaf proof(0)", () -> {
            T.eq(sides(new MerkleTree(blocks(8, "b")).proof(5)), List.of("L", "R", "L"));
            T.eq(sides(new MerkleTree(blocks(5, "b")).proof(4)), List.of("L"));
            T.eq(new MerkleTree(List.of("x")).proof(0).size(), 0);
        });

        T.test("a wrong leaf, a tampered proof or a wrong root fails verification", "8 blocks, leaf 3", () -> {
            List<String> xs = blocks(8); MerkleTree t = new MerkleTree(xs);
            List<Step> p = t.proof(3);
            List<Step> forged = new ArrayList<>(p); forged.set(1, new Step(p.get(1).side(), Merkle.fnv1a64("forged")));
            List<Step> flipped = new ArrayList<>();
            for (Step s : p) flipped.add(new Step(s.side().equals("L") ? "R" : "L", s.hash()));
            T.eq(List.of(Merkle.verify(xs.get(3), p, t.root()), Merkle.verify("block-x", p, t.root()), Merkle.verify(xs.get(3), forged, t.root()),
                Merkle.verify(xs.get(3), flipped, t.root()), Merkle.verify(xs.get(3), p, Merkle.fnv1a64("other"))), List.of(true, false, false, false, false));
        });

        T.test("identical trees: diff is empty after comparing only the roots", "diff of two trees over the same 64 blocks", () -> {
            MerkleTree a = new MerkleTree(blocks(64)), b = new MerkleTree(blocks(64));
            T.eq(a.diff(b), List.of());
            T.eq(a.compared, 1);
        });

        T.test("one changed leaf among 8 is found with 1 + 2 * log2(8) comparisons", "8 blocks, block 5 edited", () -> {
            List<String> xs = blocks(8), ys = new ArrayList<>(xs); ys.set(5, "changed");
            MerkleTree a = new MerkleTree(xs);
            T.eq(a.diff(new MerkleTree(ys)), List.of(5));
            T.eq(a.compared, 7);
        });

        T.test("diff finds every changed leaf and skips matching subtrees", "1024 blocks, blocks 3, 500 and 1023 edited", () -> {
            List<String> xs = blocks(1024), ys = new ArrayList<>(xs);
            for (int i : new int[] {3, 500, 1023}) ys.set(i, ys.get(i) + "!");
            MerkleTree a = new MerkleTree(xs);
            T.eq(a.diff(new MerkleTree(ys)), List.of(3, 500, 1023));
            T.eq(a.compared <= 1 + 2 * 10 * 3, true);
        });

        T.test("diff reaches a change in a promoted (odd) leaf", "5 blocks, block 4 edited", () -> {
            List<String> xs = blocks(5), ys = new ArrayList<>(xs); ys.set(4, "changed");
            T.eq(new MerkleTree(xs).diff(new MerkleTree(ys)), List.of(4));
        });

        T.test("diff of trees with different leaf counts raises", "new MerkleTree(4 blocks).diff(new MerkleTree(5 blocks))", () -> {
            MerkleTree a = new MerkleTree(blocks(4)), b = new MerkleTree(blocks(5));
            T.raises(IllegalArgumentException.class, () -> a.diff(b));
        });

        T.test("a tree with no leaves raises", "new MerkleTree([])", () -> T.raises(IllegalArgumentException.class, () -> new MerkleTree(List.of())));

        T.test("a proof for a leaf that does not exist raises", "new MerkleTree(4 blocks).proof(4)", () -> {
            MerkleTree t = new MerkleTree(blocks(4));
            T.raises(IndexOutOfBoundsException.class, () -> t.proof(4));
        });

        T.summary();
    }
}
