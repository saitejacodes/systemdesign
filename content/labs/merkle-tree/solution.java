import java.nio.charset.StandardCharsets;
import java.util.*;

// In Java the hash helpers and verify are static methods of Merkle, a proof is a List<Step>, diff returns a
// List<Integer>, an empty tree or mismatched diff throws IllegalArgumentException, a bad index IndexOutOfBoundsException.
record Step(String side, String hash) {}

final class Merkle {
    // 64-bit FNV-1a over the UTF-8 bytes of text, as 16 lowercase hex digits. Java's long wraps mod 2^64, as FNV needs.
    static String fnv1a64(String text) {
        long h = 0xcbf29ce484222325L;
        for (byte b : text.getBytes(StandardCharsets.UTF_8)) h = (h ^ (b & 0xff)) * 0x100000001b3L;
        return String.format("%016x", h);
    }

    static String leafHash(String data) { return fnv1a64("\u0000" + data); } // 0x00 / 0x01 prefixes keep a leaf from posing as an inner node
    static String nodeHash(String left, String right) { return fnv1a64("\u0001" + left + right); }

    static boolean verify(String leaf, List<Step> proof, String root) {
        String h = leafHash(leaf);
        for (Step s : proof) h = s.side().equals("L") ? nodeHash(s.hash(), h) : nodeHash(h, s.hash());
        return h.equals(root);
    }
}

class MerkleTree {
    final List<List<String>> levels = new ArrayList<>(); // levels[0] = leaf hashes, last = [root]
    int compared = 0;

    MerkleTree(List<String> leaves) {
        if (leaves.isEmpty()) throw new IllegalArgumentException("a Merkle tree needs at least one leaf");
        List<String> level = new ArrayList<>();
        for (String x : leaves) level.add(Merkle.leafHash(x));
        levels.add(level);
        while (level.size() > 1) {
            List<String> next = new ArrayList<>();
            for (int i = 0; i + 1 < level.size(); i += 2) next.add(Merkle.nodeHash(level.get(i), level.get(i + 1)));
            if (level.size() % 2 == 1) next.add(level.get(level.size() - 1)); // odd node out is promoted unchanged
            levels.add(next);
            level = next;
        }
    }

    String root() { return levels.get(levels.size() - 1).get(0); }

    List<Step> proof(int i) {
        if (i < 0 || i >= levels.get(0).size()) throw new IndexOutOfBoundsException("leaf index out of range");
        List<Step> path = new ArrayList<>();
        for (int d = 0; d + 1 < levels.size(); d++) {
            List<String> level = levels.get(d);
            int sib = i ^ 1;
            if (sib < level.size()) path.add(new Step(sib < i ? "L" : "R", level.get(sib))); // promoted: no sibling
            i /= 2;
        }
        return path;
    }

    List<Integer> diff(MerkleTree other) {
        if (levels.get(0).size() != other.levels.get(0).size()) throw new IllegalArgumentException("trees must have the same number of leaves");
        compared = 0;
        List<Integer> out = new ArrayList<>();
        walk(other, levels.size() - 1, 0, out);
        return out;
    }

    private void walk(MerkleTree other, int depth, int j, List<Integer> out) {
        compared++;
        if (levels.get(depth).get(j).equals(other.levels.get(depth).get(j))) return; // identical subtree: skip it
        if (depth == 0) { out.add(j); return; }
        walk(other, depth - 1, 2 * j, out);
        if (2 * j + 1 < levels.get(depth - 1).size()) walk(other, depth - 1, 2 * j + 1, out);
    }
}
