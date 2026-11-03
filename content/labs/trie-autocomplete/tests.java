import java.util.*;

public class LabTests {
    static Trie sample() {
        Trie t = new Trie();
        t.insert("car", 5); t.insert("cart", 3); t.insert("care", 8); t.insert("cat", 2); t.insert("dog", 4);
        return t;
    }

    static Completion c(String w, int x) { return new Completion(w, x); }

    public static void main(String[] args) {
        T.test("an empty trie has no completions", "new Trie().topK(\"a\", 5)", () -> T.eq(new Trie().topK("a", 5), List.of()));

        T.test("insert then topK returns the word and its weight", "insert(\"car\", 5); topK(\"c\", 3)", () -> {
            Trie t = new Trie(); t.insert("car", 5);
            T.eq(t.topK("c", 3), List.of(c("car", 5)));
        });

        T.test("results are sorted by weight, heaviest first", "car 5, cart 3, care 8, cat 2, dog 4; topK(\"ca\", 10)", () ->
            T.eq(sample().topK("ca", 10), List.of(c("care", 8), c("car", 5), c("cart", 3), c("cat", 2))));

        T.test("equal weights are ordered alphabetically", "beta 2, alpha 2, gamma 2, delta 5; topK(\"\", 4)", () -> {
            Trie t = new Trie(); t.insert("beta", 2); t.insert("alpha", 2); t.insert("gamma", 2); t.insert("delta", 5);
            T.eq(t.topK("", 4), List.of(c("delta", 5), c("alpha", 2), c("beta", 2), c("gamma", 2)));
        });

        T.test("re-inserting a word adds to its weight", "insert(\"cat\", 2); insert(\"cat\"); insert(\"cat\", 4)", () -> {
            Trie t = sample(); t.insert("cat"); t.insert("cat", 4);
            T.eq(t.weight("cat"), 7);
            T.eq(t.topK("ca", 2), List.of(c("care", 8), c("cat", 7)));
        });

        T.test("k limits the number of results", "sample; topK(\"ca\", 2)", () -> T.eq(sample().topK("ca", 2), List.of(c("care", 8), c("car", 5))));

        T.test("k larger than the matches returns all of them", "sample; topK(\"do\", 50)", () -> T.eq(sample().topK("do", 50), List.of(c("dog", 4))));

        T.test("an unknown prefix returns []", "sample; topK(\"cx\", 5), topK(\"zebra\", 5)", () -> {
            Trie t = sample();
            T.eq(List.of(t.topK("cx", 5), t.topK("zebra", 5)), List.of(List.of(), List.of()));
        });

        T.test("the empty prefix matches every word", "sample; topK(\"\", 10)", () ->
            T.eq(sample().topK("", 10), List.of(c("care", 8), c("car", 5), c("dog", 4), c("cart", 3), c("cat", 2))));

        T.test("a prefix that is not a word has weight 0 and is never suggested", "insert(\"cart\", 3); weight(\"ca\"), topK(\"c\", 5)", () -> {
            Trie t = new Trie(); t.insert("cart", 3);
            T.eq(List.of(t.weight("ca"), t.weight("cartwheel")), List.of(0, 0));
            T.eq(t.topK("c", 5), List.of(c("cart", 3)));
        });

        T.test("the prefix itself is included when it is a word", "sample; topK(\"car\", 5)", () ->
            T.eq(sample().topK("car", 5), List.of(c("care", 8), c("car", 5), c("cart", 3))));

        T.test("k of 0 returns []", "sample; topK(\"c\", 0)", () -> T.eq(sample().topK("c", 0), List.of()));

        T.test("20,000 words and 676 prefix queries stay fast", "20k distinct 4-letter words; topK for every 2-letter prefix", () -> {
            String letters = "abcdefghijklmnopqrstuvwxyz";
            Trie t = new Trie();
            for (int i = 0; i < 20000; i++) {
                int n = (int) ((long) i * 7919 % (26 * 26 * 26 * 26)); // 7919 is coprime with 26, so all words are distinct
                StringBuilder w = new StringBuilder();
                for (int j = 0, p = 1; j < 4; j++, p *= 26) w.append(letters.charAt(n / p % 26));
                t.insert(w.toString(), i % 97 + 1);
            }
            int total = 0;
            for (char a : letters.toCharArray()) for (char b : letters.toCharArray()) total += t.topK("" + a + b, 1000).size();
            List<Integer> top = new ArrayList<>();
            for (Completion x : t.topK("", 3)) top.add(x.weight());
            T.eq(List.of(total, t.topK("", 25000).size()), List.of(20000, 20000));
            T.eq(top, List.of(97, 97, 97));
        });

        T.summary();
    }
}
