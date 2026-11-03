#include <functional>
#include <stdexcept>
#include <vector>

// A fake clock: tests move time by setting t (seconds).
struct Clock {
    double t = 0;
    std::function<double()> fn() { return [this] { return t; }; }
};

static int count(int n, const std::function<bool()>& f) { int c = 0; for (int i = 0; i < n; i++) if (f()) c++; return c; }

int main() {
    using B = std::vector<bool>;
    TEST("a new bucket starts full: capacity requests pass, the next is refused", "B=10, R=1; 11 requests at t=0", [] {
        Clock c; TokenBucket b(10, 1, c.fn());
        int passed = count(10, [&] { return b.allow(); });
        EQ(passed, 10);
        EQ(b.allow(), false);
    });

    TEST("lesson example: burst of 15, then 2 tokens a second later", "B=10, R=2; 15 at t=0, 3 at t=1", [] {
        Clock c; TokenBucket b(10, 2, c.fn());
        int burst = count(15, [&] { return b.allow(); });
        c.t = 1;
        int later = count(3, [&] { return b.allow(); });
        EQ((std::vector<int>{burst, later}), (std::vector<int>{10, 2}));
    });

    TEST("refill never exceeds capacity", "B=10, R=5; drain, idle 1000 s", [] {
        Clock c; TokenBucket b(10, 5, c.fn());
        count(10, [&] { return b.allow(); });
        c.t = 1000;
        APPROX(b.tokens(), 10, 1e-6);
    });

    TEST("refill is fractional", "B=1, R=0.5; allow at t=0, 1, 2", [] {
        Clock c; TokenBucket b(1, 0.5, c.fn());
        bool a0 = b.allow();
        c.t = 1; bool a1 = b.allow(); double half = b.tokens();
        c.t = 2; bool a2 = b.allow();
        EQ((B{a0, a1, a2}), (B{true, false, true}));
        APPROX(half, 0.5, 1e-6);
    });

    TEST("a weighted request takes cost tokens; a refused one takes none", "B=10, R=0; allow(4) x3, allow(2)", [] {
        Clock c; TokenBucket b(10, 0, c.fn());
        B out({b.allow(4), b.allow(4), b.allow(4)});
        double left = b.tokens();
        out.push_back(b.allow(2));
        EQ(out, (B{true, true, false, true}));
        APPROX(left, 2, 1e-6);
    });

    TEST("cost > capacity is always refused, even when full", "B=5, R=1; idle 100 s; allow(6)", [] {
        Clock c; TokenBucket b(5, 1, c.fn());
        c.t = 100;
        EQ(b.allow(6), false);
        APPROX(b.tokens(), 5, 1e-6);
    });

    TEST("clock going backwards mints no tokens and is not credited twice", "B=10, R=2; drain at t=10; t=5; t=10.5", [] {
        Clock c; c.t = 10; TokenBucket b(10, 2, c.fn());
        count(10, [&] { return b.allow(); });
        c.t = 5; // NTP stepped the clock back 5 s
        EQ(b.allow(), false);
        APPROX(b.tokens(), 0, 1e-6);
        c.t = 10.5; // only 0.5 s past the last real refill: exactly 1 token
        EQ(b.allow(), true);
        APPROX(b.tokens(), 0, 1e-6);
    });

    TEST("refill_rate 0 never refills", "B=2, R=0; drain; idle 1e6 s", [] {
        Clock c; TokenBucket b(2, 0, c.fn());
        b.allow(); b.allow();
        c.t = 1e6;
        EQ(b.allow(), false);
    });

    TEST("sustained rate converges to B + R*T", "B=5, R=4; a request every 0.125 s for 10 s (81 requests)", [] {
        Clock c; TokenBucket b(5, 4, c.fn());
        int allowed = 0;
        for (int i = 0; i < 81; i++) { c.t = i * 0.125; if (b.allow()) allowed++; }
        EQ(allowed, 5 + 4 * 10);
    });

    TEST("tokens() only reads: it never consumes", "B=3, R=1; tokens() twice", [] {
        Clock c; TokenBucket b(3, 1, c.fn());
        b.allow();
        APPROX(b.tokens(), 2, 1e-6);
        APPROX(b.tokens(), 2, 1e-6);
        EQ((B{b.allow(), b.allow(), b.allow()}), (B{true, true, false}));
    });

    TEST("allow(0) throws std::invalid_argument", "allow(0)", [] {
        Clock c; TokenBucket b(3, 1, c.fn());
        RAISES(std::invalid_argument, [&] { b.allow(0); });
    });

    TEST("capacity 0 throws std::invalid_argument", "TokenBucket(0, 1, now)", [] {
        Clock c;
        RAISES(std::invalid_argument, [&] { TokenBucket b(0, 1, c.fn()); });
    });

    return lab::summary();
}
