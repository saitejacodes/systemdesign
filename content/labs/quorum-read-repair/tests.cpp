#include <algorithm>
#include <optional>
#include <set>
#include <string>
#include <vector>

// Renders an optional Versioned as "version:value", or "none".
static std::string str(const std::optional<Versioned>& v) { return v ? std::to_string(v->version) + ":" + v->value : "none"; }

static QuorumStore make(int n, int w, int r, std::vector<int> down = {}) {
    QuorumStore s(n, w, r);
    for (int i : down) s.setDown(i);
    return s;
}

int main() {
    using S = std::vector<std::string>;
    TEST("an impossible configuration is rejected", "QuorumStore(3, 4, 2) and QuorumStore(3, 2, 0)", [] {
        RAISES(std::invalid_argument, [] { QuorumStore s(3, 4, 2); });
        RAISES(std::invalid_argument, [] { QuorumStore s(3, 2, 0); });
    });

    TEST("overlaps() is true exactly when R + W > N", "(3,2,2) (3,3,1) (3,1,1) (5,3,3) (5,2,3)", [] {
        std::vector<std::vector<int>> cfgs({{3, 2, 2}, {3, 3, 1}, {3, 1, 1}, {5, 3, 3}, {5, 2, 3}});
        std::vector<bool> got;
        for (auto& c : cfgs) got.push_back(QuorumStore(c[0], c[1], c[2]).overlaps());
        EQ(got, (std::vector<bool>{true, true, false, true, false}));
    });

    TEST("write then read returns the newest (version, value)", "(3,2,2): write v1, write v2, read", [] {
        auto s = make(3, 2, 2);
        s.write("k", "a", 1);
        EQ(s.write("k", "b", 2), 3);
        EQ(str(s.read("k")), std::string("2:b"));
    });

    TEST("reading a key nobody has returns nothing", "(3,2,2): read(\"missing\")", [] {
        auto s = make(3, 2, 2);
        EQ(str(s.read("missing")), std::string("none"));
    });

    TEST("a write with fewer than W replicas up raises", "(3,2,2), replicas 1 and 2 down: write", [] {
        auto s = make(3, 2, 2, {1, 2});
        RAISES(QuorumError, [&] { s.write("k", "a", 1); });
    });

    TEST("a failed write is not rolled back on the replica that took it", "(3,2,2), 1 and 2 down: write fails; inspect replica 0", [] {
        auto s = make(3, 2, 2, {1, 2});
        try { s.write("seat", "Maya", 1); } catch (const QuorumError&) {}
        EQ((S{str(s.replicaValue(0, "seat")), str(s.replicaValue(1, "seat"))}), (S{"1:Maya", "none"}));
    });

    TEST("a read with fewer than R replicas up raises", "(3,2,2), replicas 0 and 2 down: read", [] {
        auto s = make(3, 2, 2);
        s.write("k", "a", 1);
        s.setDown(0); s.setDown(2);
        RAISES(QuorumError, [&] { s.read("k"); });
    });

    TEST("an older version arriving late does not overwrite a newer one", "write v5 then write v3", [] {
        auto s = make(3, 2, 2);
        s.write("k", "new", 5);
        EQ(s.write("k", "old", 3), 3);
        EQ((S{str(s.read("k")), str(s.replicaValue(2, "k"))}), (S{"5:new", "5:new"}));
    });

    TEST("R + W > N: a read reaches the latest write even after a replica missed it", "(3,2,2): 2 misses v2; then 0 down; read hits 1, 2", [] {
        auto s = make(3, 2, 2);
        s.write("k", "v1", 1);
        s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
        s.setDown(0);
        EQ(str(s.read("k")), std::string("2:v2"));
    });

    TEST("every write quorum meets every read quorum for (5,3,3)", "all 10 write sets x all 120 read orders", [] {
        int stale = 0;
        for (int a = 0; a < 5; a++) for (int b = a + 1; b < 5; b++) for (int c = b + 1; c < 5; c++) {
            std::set<int> ws({a, b, c});
            std::vector<int> order({0, 1, 2, 3, 4});
            do {
                auto s = make(5, 3, 3);
                s.write("k", "old", 1);
                for (int i = 0; i < 5; i++) if (!ws.count(i)) s.setDown(i);
                s.write("k", "new", 2);
                for (int i = 0; i < 5; i++) s.setDown(i, false);
                if (str(s.read("k", order)) != "2:new") stale++;
            } while (std::next_permutation(order.begin(), order.end()));
        }
        EQ(stale, 0);
    });

    TEST("W = 1, R = 1: a read can miss an acknowledged write", "(3,1,1): write v2 lands on 0 only; read from 1", [] {
        auto s = make(3, 1, 1);
        s.write("k", "v1", 1);
        s.setDown(1); s.setDown(2);
        EQ(s.write("k", "v2", 2), 1);
        s.setDown(1, false); s.setDown(2, false);
        EQ(str(s.read("k", {1, 0, 2})), std::string("1:v1"));
    });

    TEST("read repair updates the stale replica it contacted", "(3,2,2): 2 misses v2; read order [2, 0]", [] {
        auto s = make(3, 2, 2);
        s.write("k", "v1", 1);
        s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
        std::string before = str(s.replicaValue(2, "k"));
        std::string got = str(s.read("k", {2, 0, 1}));
        EQ((S{before, got, str(s.replicaValue(2, "k"))}), (S{"1:v1", "2:v2", "2:v2"}));
    });

    TEST("read repair does not touch replicas outside the read quorum", "(3,2,2): 2 misses v2; read order [0, 1]", [] {
        auto s = make(3, 2, 2);
        s.write("k", "v1", 1);
        s.setDown(2); s.write("k", "v2", 2); s.setDown(2, false);
        s.read("k", {0, 1, 2});
        EQ(str(s.replicaValue(2, "k")), std::string("1:v1"));
    });

    TEST("a replica missing the key entirely is repaired too", "(3,2,2): 1 down for the only write; read order [1, 0]", [] {
        auto s = make(3, 2, 2, {1});
        s.write("k", "v1", 7);
        s.setDown(1, false);
        s.read("k", {1, 0, 2});
        EQ(str(s.replicaValue(1, "k")), std::string("7:v1"));
    });

    return lab::summary();
}
