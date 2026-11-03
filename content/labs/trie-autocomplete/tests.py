
def build(m, pairs):
    t = m.Trie()
    for w, x in pairs:
        t.insert(w, x)
    return t


SAMPLE = [("car", 5), ("cart", 3), ("care", 8), ("cat", 2), ("dog", 4)]


@test("an empty trie has no completions", input="Trie().top_k('a', 5)")
def _(m):
    return m.Trie().top_k("a", 5), []


@test("insert then top_k returns the word and its weight", input="insert('car', 5); top_k('c', 3)")
def _(m):
    t = m.Trie()
    t.insert("car", 5)
    return t.top_k("c", 3), [("car", 5)]


@test("results are sorted by weight, heaviest first", input="car 5, cart 3, care 8, cat 2, dog 4; top_k('ca', 10)")
def _(m):
    t = build(m, SAMPLE)
    return t.top_k("ca", 10), [("care", 8), ("car", 5), ("cart", 3), ("cat", 2)]


@test("equal weights are ordered alphabetically", input="beta 2, alpha 2, gamma 2, delta 5; top_k('', 4)")
def _(m):
    t = build(m, [("beta", 2), ("alpha", 2), ("gamma", 2), ("delta", 5)])
    return t.top_k("", 4), [("delta", 5), ("alpha", 2), ("beta", 2), ("gamma", 2)]


@test("re-inserting a word adds to its weight", input="insert('cat', 2); insert('cat'); insert('cat', 4)")
def _(m):
    t = build(m, SAMPLE)
    t.insert("cat")
    t.insert("cat", 4)
    return [t.weight("cat"), t.top_k("ca", 2)], [7, [("care", 8), ("cat", 7)]]


@test("k limits the number of results", input="sample; top_k('ca', 2)")
def _(m):
    return build(m, SAMPLE).top_k("ca", 2), [("care", 8), ("car", 5)]


@test("k larger than the matches returns all of them", input="sample; top_k('do', 50)")
def _(m):
    return build(m, SAMPLE).top_k("do", 50), [("dog", 4)]


@test("an unknown prefix returns []", input="sample; top_k('cx', 5), top_k('zebra', 5)")
def _(m):
    t = build(m, SAMPLE)
    return [t.top_k("cx", 5), t.top_k("zebra", 5)], [[], []]


@test("the empty prefix matches every word", input="sample; top_k('', 10)")
def _(m):
    return build(m, SAMPLE).top_k("", 10), [("care", 8), ("car", 5), ("dog", 4), ("cart", 3), ("cat", 2)]


@test("a prefix that is not a word has weight 0 and is never suggested", input="insert('cart', 3); weight('ca'), top_k('c', 5)")
def _(m):
    t = m.Trie()
    t.insert("cart", 3)
    return [t.weight("ca"), t.weight("cartwheel"), t.top_k("c", 5)], [0, 0, [("cart", 3)]]


@test("the prefix itself is included when it is a word", input="sample; top_k('car', 5)")
def _(m):
    return build(m, SAMPLE).top_k("car", 5), [("care", 8), ("car", 5), ("cart", 3)]


@test("k of 0 returns []", input="sample; top_k('c', 0)")
def _(m):
    return build(m, SAMPLE).top_k("c", 0), []


@test("20,000 words and 676 prefix queries stay fast", input="20k distinct 4-letter words; top_k for every 2-letter prefix")
def _(m):
    letters = "abcdefghijklmnopqrstuvwxyz"
    t = m.Trie()
    for i in range(20_000):
        n = (i * 7919) % 26 ** 4  # 7919 is coprime with 26, so all words are distinct
        w = "".join(letters[(n // 26 ** j) % 26] for j in range(4))
        t.insert(w, i % 97 + 1)
    total = sum(len(t.top_k(a + b, 1000)) for a in letters for b in letters)
    top = [w for _, w in t.top_k("", 3)]
    return [total, len(t.top_k("", 25_000)), top], [20_000, 20_000, [97, 97, 97]]
