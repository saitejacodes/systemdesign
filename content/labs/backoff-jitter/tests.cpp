#include <cmath>
#include <cstdint>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using VD = std::vector<double>;

// mulberry32, the same tiny seeded PRNG the JavaScript tests use.
std::function<double()> mulberry32(uint32_t seed) {
    auto s = std::make_shared<uint32_t>(seed);
    return [s] {
        *s += 0x6D2B79F5u;
        uint32_t t = *s;
        t = (t ^ (t >> 15)) * (t | 1u);
        t = (t + (t ^ (t >> 7)) * (t | 61u)) ^ t;
        return (t ^ (t >> 14)) / 4294967296.0;
    };
}
std::function<double()> stub(double v) { return [v] { return v; }; }
double round1(double x) { return std::round(x * 10) / 10; }

struct Timeout : std::runtime_error { Timeout() : std::runtime_error("timeout") {} };

int main() {
    TEST("exponential doubles from base", "base 100, cap 5000, attempts 0..4", ([] {
        VD xs;
        for (int a = 0; a < 5; a++) xs.push_back(exponential(a, 100, 5000));
        EQ(xs, (VD{100, 200, 400, 800, 1600}));
    }));

    TEST("exponential is capped, even for huge attempts", "base 100, cap 5000, attempts 6 and 2000", ([] {
        EQ((VD{exponential(6, 100, 5000), exponential(2000, 100, 5000)}), (VD{5000, 5000}));
    }));

    TEST("full jitter scales the capped window by rand()", "rand 0 / 0.5 / 1, base 100, cap 5000", ([] {
        EQ((VD{fullJitter(3, 100, 5000, stub(0)), fullJitter(3, 100, 5000, stub(0.5)), fullJitter(10, 100, 5000, stub(1))}), (VD{0, 400, 5000}));
    }));

    TEST("full jitter stays in [0, window) and averages half of it", "10,000 draws, attempt 3 (window 800), seeded rand", ([] {
        auto r = mulberry32(7);
        bool ok = true; double sum = 0;
        for (int i = 0; i < 10000; i++) { double x = fullJitter(3, 100, 5000, r); ok = ok && x >= 0 && x < 800; sum += x; }
        EQ(ok, true);
        EQ(round1(sum / 10000 / 400), 1.0);
    }));

    TEST("equal jitter keeps at least half the window", "10,000 draws, attempt 2 (window 400), seeded rand; rand 0 and 0.5", ([] {
        auto r = mulberry32(11);
        bool ok = true; double sum = 0;
        for (int i = 0; i < 10000; i++) { double x = equalJitter(2, 100, 5000, r); ok = ok && x >= 200 && x < 400; sum += x; }
        EQ(ok, true);
        EQ(round1(sum / 10000 / 300), 1.0);
        EQ((VD{equalJitter(2, 100, 5000, stub(0)), equalJitter(2, 100, 5000, stub(0.5))}), (VD{200, 300}));
    }));

    TEST("decorrelated jitter draws from [base, 3 * previous]", "rand 0 and 0.5 from prev 100 and 1000", ([] {
        EQ((VD{decorrelatedJitter(100, 100, 5000, stub(0)), decorrelatedJitter(100, 100, 5000, stub(0.5)), decorrelatedJitter(1000, 100, 5000, stub(0.5))}),
           (VD{100, 200, 1550}));
    }));

    TEST("decorrelated jitter never leaves [base, cap]", "chain of 1,000 sleeps, base 100, cap 5000, seeded rand", ([] {
        auto r = mulberry32(3);
        double prev = 100; bool ok = true, hitCap = false;
        for (int i = 0; i < 1000; i++) {
            double s = decorrelatedJitter(prev, 100, 5000, r);
            ok = ok && s >= 100 && s <= 5000 && s <= 3 * prev;
            hitCap = hitCap || s == 5000;
            prev = s;
        }
        EQ((std::vector<bool>{ok, hitCap}), (std::vector<bool>{true, true}));
    }));

    TEST("retry returns the result after transient failures", "fails twice with RetryableError, then \"ok\"; rand 0.5", ([] {
        int calls = 0;
        VD sleeps;
        std::string out = retry([&] { if (++calls < 3) throw RetryableError("503"); return std::string("ok"); }, 5,
                                [&](double s) { sleeps.push_back(s); }, 100, 5000, stub(0.5));
        EQ(out, std::string("ok"));
        EQ(calls, 3);
        EQ(sleeps, (VD{50, 100}));
    }));

    TEST("retry gives up after maxAttempts and raises the last error", "always fails, maxAttempts 4", ([] {
        int calls = 0;
        VD sleeps;
        std::string msg = "no exception";
        try {
            retry([&]() -> int { throw RetryableError("attempt " + std::to_string(++calls)); }, 4, [&](double s) { sleeps.push_back(s); }, 100, 5000, stub(1));
        } catch (const RetryableError& e) { msg = e.what(); }
        EQ(msg, std::string("attempt 4"));
        EQ(calls, 4);
        EQ(sleeps, (VD{100, 200, 400}));
    }));

    TEST("a non-retryable error is raised at once, with no sleep", "fn throws std::invalid_argument (like a 400)", ([] {
        int calls = 0;
        VD sleeps;
        std::string kind = "no exception";
        try {
            retry([&]() -> int { calls++; throw std::invalid_argument("bad request"); }, 5, [&](double s) { sleeps.push_back(s); }, 100, 5000, stub(0.5));
        } catch (const std::invalid_argument&) { kind = "invalid_argument"; }
        EQ(kind, std::string("invalid_argument"));
        EQ(calls, 1);
        EQ(sleeps, VD{});
    }));

    TEST("a custom retryable predicate decides what is retried", "retryable = Timeout only; fails with Timeout once", ([] {
        int calls = 0;
        VD sleeps;
        int out = retry([&] { if (++calls == 1) throw Timeout(); return calls; }, 3, [&](double s) { sleeps.push_back(s); }, 100, 5000, stub(0.5),
                        [](const std::exception& e) { return dynamic_cast<const Timeout*>(&e) != nullptr; });
        EQ(out, 2);
        EQ(sleeps, (VD{50}));
    }));

    TEST("retry sleeps grow exponentially and stop at the cap", "always fails, 10 attempts, base 100, cap 1000, rand 1", ([] {
        VD sleeps;
        try {
            retry([]() -> int { throw RetryableError("down"); }, 10, [&](double s) { sleeps.push_back(s); }, 100, 1000, stub(1));
        } catch (const RetryableError&) { /* expected */ }
        EQ(sleeps, (VD{100, 200, 400, 800, 1000, 1000, 1000, 1000, 1000}));
    }));

    TEST("maxAttempts below 1 is rejected", "retry(fn, 0, sleep, ...)", ([] {
        RAISES(std::invalid_argument, [] { retry([] { return 1; }, 0, [](double) {}, 100, 5000, stub(0.5)); });
    }));

    return lab::summary();
}
