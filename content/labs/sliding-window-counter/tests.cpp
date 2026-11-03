#include <functional>
#include <stdexcept>
#include <vector>

static int count(int n, const std::function<bool()>& f) { int c = 0; for (int i = 0; i < n; i++) if (f()) c++; return c; }

int main() {
    using B = std::vector<bool>;
    using V = std::vector<int>;
    TEST("allows up to the limit inside one window", "limit 5, window 60; 6 requests at t=0", [] {
        SlidingWindowCounter s(5, 60);
        B out;
        for (int i = 0; i < 6; i++) out.push_back(s.allow(0));
        EQ(out, (B{true, true, true, true, true, false}));
    });

    TEST("lesson example: 80 previous, 30 current, 25% in -> 90, allowed", "limit 100, window 60; 80 at t=1, 30 at t=70; estimate(75); 45 s in", [] {
        SlidingWindowCounter s(100, 60);
        count(80, [&] { return s.allow(1); });
        count(30, [&] { return s.allow(70); });
        APPROX(s.estimate(75), 90, 1e-6);
        EQ(s.allow(75), true);
        APPROX(s.estimate(105), 51, 1e-6); // 80 * 0.25 + 31
    });

    TEST("fixed window (given) lets 2x the limit through at the boundary", "FixedWindowCounter(100, 60); 100 at t=59, 100 at t=60", [] {
        FixedWindowCounter f(100, 60);
        int a = count(100, [&] { return f.allow(59); });
        int b = count(100, [&] { return f.allow(60); });
        EQ(a + b, 200);
    });

    TEST("sliding window holds the same boundary burst to the limit", "SlidingWindowCounter(100, 60); 100 at t=59, 100 at t=60", [] {
        SlidingWindowCounter s(100, 60);
        int a = count(100, [&] { return s.allow(59); });
        int b = count(100, [&] { return s.allow(60); });
        EQ((V{a, b}), (V{100, 0}));
    });

    TEST("capacity comes back as the previous window slides out", "limit 100, window 60; 100 at t=59; 100 tries at t=90", [] {
        SlidingWindowCounter s(100, 60);
        count(100, [&] { return s.allow(59); });
        EQ(count(100, [&] { return s.allow(90); }), 50); // 100 * 0.5 + curr < 100
    });

    TEST("refused requests are not counted", "limit 2, window 10; 5 tries at t=0; estimate(0)", [] {
        SlidingWindowCounter s(2, 10);
        EQ(count(5, [&] { return s.allow(0); }), 2);
        APPROX(s.estimate(0), 2, 1e-9);
    });

    TEST("a gap longer than one window forgets the old counts", "limit 100, window 60; 100 at t=0; 100 tries at t=130", [] {
        SlidingWindowCounter s(100, 60);
        count(100, [&] { return s.allow(0); });
        EQ(count(100, [&] { return s.allow(130); }), 100);
    });

    TEST("limit 1: the previous request is weighted until it slides out", "limit 1, window 60; allow at t=0, 30, 60, 90", [] {
        SlidingWindowCounter s(1, 60);
        EQ((B{s.allow(0), s.allow(30), s.allow(60), s.allow(90)}), (B{true, false, false, true}));
    });

    TEST("steady traffic: the estimate tracks the exact sliding count", "a request every 0.5 s for t=0..330; estimate(330.25) vs exact 120", [] {
        SlidingWindowCounter s(10000, 60);
        for (int i = 0; i < 661; i++) s.allow(i * 0.5);
        APPROX(s.estimate(330.25), 120, 1);
    });

    TEST("a timestamp earlier than the last one throws std::invalid_argument", "allow(10); allow(5)", [] {
        SlidingWindowCounter s(10, 60);
        s.allow(10);
        RAISES(std::invalid_argument, [&] { s.allow(5); });
    });

    TEST("limit 0 throws std::invalid_argument", "SlidingWindowCounter(0, 60)", [] {
        RAISES(std::invalid_argument, [] { SlidingWindowCounter s(0, 60); });
    });

    return lab::summary();
}
