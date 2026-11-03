import java.util.*;

// In Java, topK returns a List<Completion> (a record of word and weight) instead of pairs.
record Completion(String word, int weight) {}

class Trie {
    private static final class Node {
        final Map<Character, Node> children = new HashMap<>();
        int weight; // > 0 only where an inserted word ends
    }

    private final Node root = new Node();

    void insert(String word) { insert(word, 1); }

    void insert(String word, int weight) {
        // TODO: walk (creating nodes) to the end of word, then ADD weight to that node
    }

    int weight(String word) {
        // TODO: walk the word; return the end node's weight, or 0 if the path is missing
        return 0;
    }

    List<Completion> topK(String prefix, int k) {
        // TODO: walk to the prefix node (missing -> empty list), collect a Completion for every
        // word in its subtree, sort by weight descending then word ascending, keep k
        return new ArrayList<>();
    }
}
