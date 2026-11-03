#include <string>
#include <utility>
#include <vector>

static std::vector<std::string> blocks(int n, const std::string& prefix = "block-") {
    std::vector<std::string> out;
    for (int i = 0; i < n; i++) out.push_back(prefix + std::to_string(i));
    return out;
}

static std::vector<std::string> sides(const std::vector<Step>& proof) {
    std::vector<std::string> out;
    for (const auto& s : proof) out.push_back(s.first);
    return out;
}

int main() {
    using S = std::vector<std::string>;
    using B = std::vector<bool>;
    using I = std::vector<int>;
    TEST("fnv1a64 matches the published FNV-1a 64-bit test vectors", "fnv1a64(\"\"), fnv1a64(\"a\"), fnv1a64(\"foobar\")", [] {
        EQ((S{fnv1a64(""), fnv1a64("a"), fnv1a64("foobar")}), (S{"cbf29ce484222325", "af63dc4c8601ec8c", "85944171f73967e8"}));
    });

    TEST("one leaf: the root is the leaf hash; two leaves: the root is their node hash", "MerkleTree({\"only\"}), MerkleTree({\"a\", \"b\"})", [] {
        MerkleTree one({"only"});
        MerkleTree two({"a", "b"});
        EQ(one.root(), fnv1a64(std::string(1, '\0') + "only"));
        EQ(two.root(), nodeHash(leafHash("a"), leafHash("b")));
        EQ(two.root(), std::string("4ed018693fe30ca0"));
    });

    TEST("an odd last node is promoted, so [a, b, c] and [a, b, c, c] differ", "MerkleTree({a, b, c}) vs {a, b, c, c}", [] {
        MerkleTree t({"a", "b", "c"});
        EQ(t.root(), std::string("57c9daf1a831262e"));
        EQ(t.root(), nodeHash(nodeHash(leafHash("a"), leafHash("b")), leafHash("c")));
        EQ(t.root() == MerkleTree({"a", "b", "c", "c"}).root(), false);
    });

    TEST("changing or reordering any leaf changes the root", "8 blocks: edit each one in turn, then swap 0 and 1", [] {
        auto base = blocks(8);
        std::string r = MerkleTree(base).root();
        bool all = true;
        for (int i = 0; i < 8; i++) { auto xs = base; xs[i] += "x"; all = all && MerkleTree(xs).root() != r; }
        auto swapped = base; std::swap(swapped[0], swapped[1]);
        EQ((B{all, MerkleTree(swapped).root() != r}), (B{true, true}));
    });

    TEST("every leaf's proof verifies, for trees of 1 to 9 leaves", "for n in 1..9, for i in 0..n-1: verify(leaf i, proof(i), root)", [] {
        int bad = 0;
        for (int n = 1; n <= 9; n++) {
            auto xs = blocks(n);
            MerkleTree t(xs);
            for (int i = 0; i < n; i++) if (!verify(xs[i], t.proof(i), t.root())) bad++;
        }
        EQ(bad, 0);
    });

    TEST("proof shape: one sibling per level, none where a node was promoted", "8 leaves proof(5); 5 leaves proof(4); 1 leaf proof(0)", [] {
        EQ(sides(MerkleTree(blocks(8, "b")).proof(5)), (S{"L", "R", "L"}));
        EQ(sides(MerkleTree(blocks(5, "b")).proof(4)), (S{"L"}));
        EQ((int)MerkleTree({"x"}).proof(0).size(), 0);
    });

    TEST("a wrong leaf, a tampered proof or a wrong root fails verification", "8 blocks, leaf 3", [] {
        auto xs = blocks(8);
        MerkleTree t(xs);
        auto p = t.proof(3);
        EQ(p.size(), (size_t)3);
        auto forged = p; forged[1].second = fnv1a64("forged");
        auto flipped = p; for (auto& s : flipped) s.first = s.first == "L" ? "R" : "L";
        EQ((B{verify(xs[3], p, t.root()), verify("block-x", p, t.root()), verify(xs[3], forged, t.root()),
              verify(xs[3], flipped, t.root()), verify(xs[3], p, fnv1a64("other"))}), (B{true, false, false, false, false}));
    });

    TEST("identical trees: diff is empty after comparing only the roots", "diff of two trees over the same 64 blocks", [] {
        MerkleTree a(blocks(64));
        MerkleTree b(blocks(64));
        EQ(a.diff(b), I{});
        EQ(a.compared, 1);
    });

    TEST("one changed leaf among 8 is found with 1 + 2 * log2(8) comparisons", "8 blocks, block 5 edited", [] {
        auto xs = blocks(8);
        auto ys = xs; ys[5] = "changed";
        MerkleTree a(xs);
        EQ(a.diff(MerkleTree(ys)), I{5});
        EQ(a.compared, 7);
    });

    TEST("diff finds every changed leaf and skips matching subtrees", "1024 blocks, blocks 3, 500 and 1023 edited", [] {
        auto xs = blocks(1024);
        auto ys = xs;
        for (int i : {3, 500, 1023}) ys[i] += "!";
        MerkleTree a(xs);
        EQ(a.diff(MerkleTree(ys)), (I{3, 500, 1023}));
        EQ(a.compared <= 1 + 2 * 10 * 3, true);
    });

    TEST("diff reaches a change in a promoted (odd) leaf", "5 blocks, block 4 edited", [] {
        auto xs = blocks(5);
        auto ys = xs; ys[4] = "changed";
        MerkleTree a(xs);
        EQ(a.diff(MerkleTree(ys)), I{4});
    });

    TEST("diff of trees with different leaf counts raises", "MerkleTree(4 blocks).diff(MerkleTree(5 blocks))", [] {
        MerkleTree a(blocks(4));
        MerkleTree b(blocks(5));
        RAISES(std::invalid_argument, [&] { a.diff(b); });
    });

    TEST("a tree with no leaves raises", "MerkleTree({})", [] {
        RAISES(std::invalid_argument, [] { MerkleTree t(std::vector<std::string>{}); });
    });

    TEST("a proof for a leaf that does not exist raises", "MerkleTree(4 blocks).proof(4)", [] {
        MerkleTree t(blocks(4));
        RAISES(std::out_of_range, [&] { t.proof(4); });
    });

    return lab::summary();
}
