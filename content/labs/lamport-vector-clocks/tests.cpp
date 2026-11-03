#include <stdexcept>
#include <string>
#include <vector>

using VI = std::vector<int>;
using VS = std::vector<std::string>;

// P1: a (send to P2), c.  P2: receive a, b (send to P3).  P3: x, receive b.
// Events in the order a, x, r2, b, c, r3.
VI diagramLamport() {
    LamportClock p1, p2, p3;
    int a = p1.send(), x = p3.tick(), r2 = p2.receive(a), b = p2.send(), c = p1.tick(), r3 = p3.receive(b);
    return {a, x, r2, b, c, r3};
}

std::vector<VI> diagramVector() {
    VectorClock p1(0, 3), p2(1, 3), p3(2, 3);
    VI a = p1.send(), x = p3.increment(), r2 = p2.receive(a), b = p2.send(), c = p1.increment(), r3 = p3.receive(b);
    return {a, x, r2, b, c, r3};
}

int main() {
    TEST("Lamport: each local event increments the counter", "tick() x3", ([] {
        LamportClock c;
        int a = c.tick(), b = c.tick(), d = c.tick();
        EQ((VI{a, b, d}), (VI{1, 2, 3}));
    }));

    TEST("Lamport: receive jumps past a sender that is ahead", "local 0; receive(5)", ([] { LamportClock c; EQ(c.receive(5), 6); }));

    TEST("Lamport: receive from a sender that is behind still advances", "local at 10; receive(3)", ([] {
        LamportClock c;
        for (int i = 0; i < 10; i++) c.tick();
        EQ(c.receive(3), 11);
    }));

    TEST("Lamport: three-process diagram", "P1 a→P2, P3 x, P2 recv a, P2 b→P3, P1 c, P3 recv b (a, x, r2, b, c, r3)", ([] {
        EQ(diagramLamport(), (VI{1, 1, 2, 3, 2, 4}));
    }));

    TEST("vector: a local event bumps only its own entry", "VectorClock(1, 3).increment() x2", ([] {
        VectorClock c(1, 3);
        VI first = c.increment(), second = c.increment();
        EQ((std::vector<VI>{first, second}), (std::vector<VI>{{0, 1, 0}, {0, 2, 0}}));
    }));

    TEST("vector: receive merges element-wise, then increments", "P2 at [0,0,3,0] receives [2,5,1,0]", ([] {
        VectorClock c(2, 4);
        for (int i = 0; i < 3; i++) c.increment();
        EQ(c.receive({2, 5, 1, 0}), (VI{2, 5, 4, 0}));
    }));

    TEST("vector: three-process diagram", "same diagram as the Lamport test (a, x, r2, b, c, r3)", ([] {
        EQ(diagramVector(), (std::vector<VI>{{1, 0, 0}, {0, 0, 1}, {1, 1, 0}, {1, 2, 0}, {2, 0, 0}, {1, 2, 2}}));
    }));

    TEST("compare: before, after and equal", "[1,0,0] vs [1,2,2]; reverse; [1,2,0] vs itself", ([] {
        EQ((VS{compare({1, 0, 0}, {1, 2, 2}), compare({1, 2, 2}, {1, 0, 0}), compare({1, 2, 0}, {1, 2, 0})}), (VS{"before", "after", "equal"}));
    }));

    TEST("compare: neither dominates means concurrent", "[1,1,0] vs [0,0,1]; [2,0,0] vs [1,2,2]", ([] {
        EQ((VS{compare({1, 1, 0}, {0, 0, 1}), compare({2, 0, 0}, {1, 2, 2})}), (VS{"concurrent", "concurrent"}));
    }));

    TEST("Lamport orders events that vector clocks prove concurrent", "diagram: c (P1) vs r3 (P3); x (P3) vs c (P1)", ([] {
        VI l = diagramLamport();
        std::vector<VI> d = diagramVector();
        EQ(l[4] < l[5], true);
        EQ((VS{compare(d[4], d[5]), compare(d[1], d[4]), compare(d[0], d[5])}), (VS{"concurrent", "concurrent", "before"}));
    }));

    TEST("merge is an element-wise max that leaves its inputs alone", "merge([3,0,2], [1,4,2])", ([] {
        VI a{3, 0, 2}, b{1, 4, 2};
        EQ((std::vector<VI>{merge(a, b), a, b}), (std::vector<VI>{{3, 4, 2}, {3, 0, 2}, {1, 4, 2}}));
    }));

    TEST("a sent vector is a snapshot, not a live reference", "msg = send(); increment(); msg[0] = 99", ([] {
        VectorClock c(0, 2);
        VI msg = c.send();
        c.increment();
        VI sent = msg;
        msg[0] = 99;
        EQ((std::vector<VI>{sent, c.value()}), (std::vector<VI>{{1, 0}, {2, 0}}));
    }));

    TEST("vectors of different lengths are rejected", "compare([1,0], [1,0,0])", ([] {
        RAISES(std::invalid_argument, [] { compare({1, 0}, {1, 0, 0}); });
    }));

    return lab::summary();
}
