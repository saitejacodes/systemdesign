#include <string>
#include <utility>
#include <vector>

using C = std::vector<std::pair<std::string, int>>;

Trie sample() {
    Trie t;
    t.insert("car", 5); t.insert("cart", 3); t.insert("care", 8); t.insert("cat", 2); t.insert("dog", 4);
    return t;
}

int main() {
    TEST("an empty trie has no completions", "Trie().topK(\"a\", 5)", [] { Trie t; EQ(t.topK("a", 5), C{}); });

    TEST("insert then topK returns the word and its weight", "insert(\"car\", 5); topK(\"c\", 3)", [] {
        Trie t; t.insert("car", 5);
        EQ(t.topK("c", 3), (C{{"car", 5}}));
    });

    TEST("results are sorted by weight, heaviest first", "car 5, cart 3, care 8, cat 2, dog 4; topK(\"ca\", 10)", [] {
        EQ(sample().topK("ca", 10), (C{{"care", 8}, {"car", 5}, {"cart", 3}, {"cat", 2}}));
    });

    TEST("equal weights are ordered alphabetically", "beta 2, alpha 2, gamma 2, delta 5; topK(\"\", 4)", [] {
        Trie t; t.insert("beta", 2); t.insert("alpha", 2); t.insert("gamma", 2); t.insert("delta", 5);
        EQ(t.topK("", 4), (C{{"delta", 5}, {"alpha", 2}, {"beta", 2}, {"gamma", 2}}));
    });

    TEST("re-inserting a word adds to its weight", "insert(\"cat\", 2); insert(\"cat\"); insert(\"cat\", 4)", [] {
        Trie t = sample(); t.insert("cat"); t.insert("cat", 4);
        EQ(t.weight("cat"), 7);
        EQ(t.topK("ca", 2), (C{{"care", 8}, {"cat", 7}}));
    });

    TEST("k limits the number of results", "sample; topK(\"ca\", 2)", [] { EQ(sample().topK("ca", 2), (C{{"care", 8}, {"car", 5}})); });

    TEST("k larger than the matches returns all of them", "sample; topK(\"do\", 50)", [] { EQ(sample().topK("do", 50), (C{{"dog", 4}})); });

    TEST("an unknown prefix returns []", "sample; topK(\"cx\", 5), topK(\"zebra\", 5)", [] {
        Trie t = sample();
        EQ(t.topK("cx", 5), C{});
        EQ(t.topK("zebra", 5), C{});
    });

    TEST("the empty prefix matches every word", "sample; topK(\"\", 10)", [] {
        EQ(sample().topK("", 10), (C{{"care", 8}, {"car", 5}, {"dog", 4}, {"cart", 3}, {"cat", 2}}));
    });

    TEST("a prefix that is not a word has weight 0 and is never suggested", "insert(\"cart\", 3); weight(\"ca\"), topK(\"c\", 5)", [] {
        Trie t; t.insert("cart", 3);
        EQ((std::vector<int>{t.weight("ca"), t.weight("cartwheel")}), (std::vector<int>{0, 0}));
        EQ(t.topK("c", 5), (C{{"cart", 3}}));
    });

    TEST("the prefix itself is included when it is a word", "sample; topK(\"car\", 5)", [] {
        EQ(sample().topK("car", 5), (C{{"care", 8}, {"car", 5}, {"cart", 3}}));
    });

    TEST("k of 0 returns []", "sample; topK(\"c\", 0)", [] { EQ(sample().topK("c", 0), C{}); });

    TEST("20,000 words and 676 prefix queries stay fast", "20k distinct 4-letter words; topK for every 2-letter prefix", [] {
        const std::string letters = "abcdefghijklmnopqrstuvwxyz";
        Trie t;
        for (int i = 0; i < 20000; i++) {
            int n = (int)((long long)i * 7919 % (26 * 26 * 26 * 26)); // 7919 is coprime with 26, so all words are distinct
            std::string w;
            for (int j = 0, p = 1; j < 4; j++, p *= 26) w += letters[n / p % 26];
            t.insert(w, i % 97 + 1);
        }
        int total = 0;
        for (char a : letters) for (char b : letters) total += (int)t.topK(std::string{a, b}, 1000).size();
        std::vector<int> top;
        for (const auto& c : t.topK("", 3)) top.push_back(c.second);
        EQ((std::vector<int>{total, (int)t.topK("", 25000).size()}), (std::vector<int>{20000, 20000}));
        EQ(top, (std::vector<int>{97, 97, 97}));
    });

    return lab::summary();
}
