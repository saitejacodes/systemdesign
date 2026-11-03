import java.nio.charset.StandardCharsets;
import java.util.*;

// In Java the hash helpers and verify are static methods of Merkle, a proof is a List<Step>, diff returns a
// List<Integer>, an empty tree or mismatched diff throws IllegalArgumentException, a bad index IndexOutOfBoundsException.
record Step(String side, String hash) {}

final class Merkle {
    // 64-bit FNV-1a over the UTF-8 bytes of text, as 16 lowercase hex digits. Given: you don't need to change it.
    static String fnv1a64(String text) {
        long h = 0xcbf29ce484222325L;
        for (byte b : text.getBytes(StandardCharsets.UTF_8)) h = (h ^ (b & 0xff)) * 0x100000001b3L;
        return String.format("%016x", h);
    }

    static String leafHash(String data) { return fnv1a64("\u0000" + data); }
    static String nodeHash(String left, String right) { return fnv1a64("\u0001" + left + right); }

    static boolean verify(String leaf, List<Step> proof, String root) {
        // TODO: rehash from leafHash(leaf) up the proof and compare with root
        return false;
    }
}

class MerkleTree {
    final List<List<String>> levels = new ArrayList<>(); // levels[0] = leaf hashes, last = [root]
    int compared = 0;

    MerkleTree(List<String> leaves) {
        // TODO: throw IllegalArgumentException on an empty list. Build levels bottom-up:
        // pair neighbours with Merkle.nodeHash; an odd last node is promoted unchanged
        List<String> level = new ArrayList<>();
        for (String x : leaves) level.add(Merkle.leafHash(x));
        levels.add(level);
    }

    String root() {
        // TODO: the single hash on the top level
        return levels.get(0).isEmpty() ? "" : levels.get(0).get(0);
    }

    List<Step> proof(int i) {
        // TODO: throw IndexOutOfBoundsException if i is out of range; walk up collecting Step("L" or "R", sibling),
        // skipping levels where the node has no sibling
        return new ArrayList<>();
    }

    List<Integer> diff(MerkleTree other) {
        // TODO: throw IllegalArgumentException if the leaf counts differ; compare from the root down, descending only
        // where hashes differ; count every node pair compared in `compared`; return sorted leaf indices
        return new ArrayList<>();
    }
}
