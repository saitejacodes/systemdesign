#include <algorithm>
#include <cstdint>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

using S = std::vector<std::string>;
using Counts = std::map<std::string, int>;

static S makeKeys() { S k; for (int i = 0; i < 10000; i++) k.push_back("key-" + std::to_string(i)); return k; }
static const S KEYS = makeKeys();
static const S NODES = {"node-A", "node-B", "node-C"};

static void fill(HashRing& r, const S& nodes) { for (const auto& n : nodes) r.addNode(n); }

int main() {
    TEST("FNV-1a 32-bit matches the published test vectors (UTF-8 bytes)", "fnv1a32('') / 'a' / 'foobar' / 'café'; hash32('a')", [] {
        using U = std::vector<uint32_t>;
        EQ((U{fnv1a32(""), fnv1a32("a"), fnv1a32("foobar"), fnv1a32("café"), hash32("a")}),
           (U{0x811c9dc5u, 0xe40c292cu, 0xbf9cf968u, 0xa82b5049u, 0x1a80b1b3u}));
    });

    TEST("an empty ring throws std::out_of_range", "HashRing().getNode('k')", [] {
        HashRing r;
        RAISES(std::out_of_range, [&] { r.getNode("k"); });
    });

    TEST("a single node owns every key", "add node-A; 1,000 keys", [] {
        HashRing r; r.addNode("node-A");
        std::set<std::string> owners;
        for (int i = 0; i < 1000; i++) owners.insert(r.getNode(KEYS[i]));
        EQ(S(owners.begin(), owners.end()), S{"node-A"});
    });

    TEST("keys past the last point wrap around to the first", "vnodes=1, nodes A, B, C (C has the lowest position); keys k1 (above all points), k9 (below all)", [] {
        HashRing r(1); fill(r, S{"A", "B", "C"});
        EQ((S{r.getNode("k1"), r.getNode("k9"), r.getNode("k0")}), (S{"C", "C", "A"}));
    });

    TEST("ownership does not depend on the order nodes were added", "add A, B, C vs C, A, B", [] {
        HashRing a; HashRing b; fill(a, NODES); fill(b, S(NODES.rbegin(), NODES.rend()));
        bool same = true;
        for (const auto& k : KEYS) same = same && a.getNode(k) == b.getNode(k);
        EQ(same, true);
    });

    TEST("100 vnodes spread keys evenly: each of 4 nodes owns 25% +/- 8%", "4 nodes x 100 vnodes, 10,000 keys", [] {
        HashRing r; fill(r, NODES); r.addNode("node-D");
        Counts share;
        for (const auto& k : KEYS) share[r.getNode(k)]++;
        bool even = share.size() == 4;
        for (const auto& kv : share) even = even && kv.second / 10000.0 >= 0.17 && kv.second / 10000.0 <= 0.33;
        EQ(even, true);
    });

    TEST("adding a 4th node moves about 1/4 of keys, all of them to the new node", "3 -> 4 nodes, 100 vnodes, 10,000 keys", [] {
        HashRing r; fill(r, NODES);
        S before; for (const auto& k : KEYS) before.push_back(r.getNode(k));
        r.addNode("node-D");
        int moved = 0; bool allToD = true;
        for (size_t i = 0; i < KEYS.size(); i++) {
            std::string now = r.getNode(KEYS[i]);
            if (now != before[i]) { moved++; allToD = allToD && now == "node-D"; }
        }
        double frac = moved / 10000.0;
        EQ(frac >= 0.15 && frac <= 0.35, true);
        EQ(allToD, true);
    });

    TEST("removing a node moves only that node's keys", "4 -> 3 nodes (remove node-B)", [] {
        HashRing r; fill(r, NODES); r.addNode("node-D");
        S before; for (const auto& k : KEYS) before.push_back(r.getNode(k));
        r.removeNode("node-B");
        bool onlyB = true; bool bGone = true;
        for (size_t i = 0; i < KEYS.size(); i++) {
            std::string now = r.getNode(KEYS[i]);
            onlyB = onlyB && ((now != before[i]) == (before[i] == "node-B"));
            bGone = bGone && now != "node-B";
        }
        EQ(onlyB, true);
        EQ(bGone, true);
    });

    TEST("for contrast, hash mod N moves about 3/4 of keys going from 3 to 4", "hash32(key) % 3 vs % 4", [] {
        int moved = 0;
        for (const auto& k : KEYS) { uint32_t h = hash32(k); if (h % 3 != h % 4) moved++; }
        APPROX(moved / 10000.0, 0.75, 0.03);
    });

    TEST("adding a node twice does not double its vnodes", "add A, B, A; remove A once", [] {
        HashRing r; fill(r, S{"A", "B", "A"});
        r.removeNode("A");
        std::set<std::string> owners;
        for (int i = 0; i < 500; i++) owners.insert(r.getNode(KEYS[i]));
        EQ(r.nodes(), S{"B"});
        EQ(S(owners.begin(), owners.end()), S{"B"});
    });

    TEST("removing an unknown node throws std::invalid_argument", "removeNode('ghost')", [] {
        HashRing r; fill(r, NODES);
        RAISES(std::invalid_argument, [&] { r.removeNode("ghost"); });
    });

    TEST("removing the last node leaves an empty ring", "add A; remove A; getNode", [] {
        HashRing r; r.addNode("A");
        r.removeNode("A");
        RAISES(std::out_of_range, [&] { r.getNode("k"); });
    });

    return lab::summary();
}
