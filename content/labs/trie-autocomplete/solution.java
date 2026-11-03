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
        Node node = root;
        for (char ch : word.toCharArray()) node = node.children.computeIfAbsent(ch, c -> new Node());
        node.weight += weight; // re-inserting accumulates popularity
    }

    private Node find(String prefix) {
        Node node = root;
        for (char ch : prefix.toCharArray()) {
            node = node.children.get(ch);
            if (node == null) return null;
        }
        return node;
    }

    int weight(String word) {
        Node n = find(word);
        return n == null ? 0 : n.weight;
    }

    List<Completion> topK(String prefix, int k) {
        Node start = find(prefix);
        if (start == null || k <= 0) return new ArrayList<>();
        // Iterative DFS over the prefix's subtree, carrying the characters spelled so far.
        List<Completion> found = new ArrayList<>();
        Deque<Node> nodes = new ArrayDeque<>();
        Deque<String> spelled = new ArrayDeque<>();
        nodes.push(start); spelled.push(prefix);
        while (!nodes.isEmpty()) {
            Node n = nodes.pop();
            String s = spelled.pop();
            if (n.weight > 0) found.add(new Completion(s, n.weight));
            for (Map.Entry<Character, Node> e : n.children.entrySet()) { nodes.push(e.getValue()); spelled.push(s + e.getKey()); }
        }
        // Heaviest first, ties broken alphabetically.
        found.sort(Comparator.comparingInt(Completion::weight).reversed().thenComparing(Completion::word));
        return new ArrayList<>(found.subList(0, Math.min(k, found.size())));
    }
}
