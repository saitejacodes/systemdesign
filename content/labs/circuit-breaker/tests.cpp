#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using VS = std::vector<std::string>;

struct Rig {
    std::shared_ptr<double> t = std::make_shared<double>(0);
    CircuitBreaker b;
    explicit Rig(int threshold = 3, int trials = 1) : b(threshold, 30, trials, [t = t] { return *t; }) {}
    void at(double now) { *t = now; }
    void fail(int n = 1) {
        for (int i = 0; i < n; i++) {
            try { b.call([]() -> std::string { throw std::runtime_error("dependency down"); }); } catch (const std::runtime_error&) { /* expected */ }
        }
    }
    std::string ok() { return b.call([] { return std::string("ok"); }); }
};

int main() {
    TEST("starts closed and passes calls through", "threshold 3; call(ok)", ([] {
        Rig r;
        std::string before = r.b.state(), out = r.ok();
        EQ((VS{before, out, r.b.state()}), (VS{"closed", "ok", "closed"}));
    }));

    TEST("stays closed below the threshold", "threshold 3; 2 failures", ([] { Rig r; r.fail(2); EQ(r.b.state(), std::string("closed")); }));

    TEST("opens after N consecutive failures", "threshold 3; 3 failures", ([] { Rig r; r.fail(3); EQ(r.b.state(), std::string("open")); }));

    TEST("a success resets the consecutive-failure count", "threshold 3; fail, fail, ok, fail, fail", ([] {
        Rig r; r.fail(2); r.ok(); r.fail(2);
        EQ(r.b.state(), std::string("closed"));
    }));

    TEST("the caller sees the dependency's own exception", "call(fn throwing std::out_of_range) while closed", ([] {
        Rig r;
        RAISES(std::out_of_range, [&] { r.b.call([]() -> int { throw std::out_of_range("x"); }); });
    }));

    TEST("an open breaker fails fast with CircuitOpenError", "tripped; call(fn)", ([] {
        Rig r; r.fail(3);
        RAISES(CircuitOpenError, [&] { r.ok(); });
    }));

    TEST("while open, the dependency is never called", "tripped; 5 calls at t = 1..5 s", ([] {
        Rig r; r.fail(3);
        int calls = 0, rejected = 0;
        for (int t = 1; t <= 5; t++) {
            r.at(t);
            try { r.b.call([&] { return ++calls; }); } catch (const CircuitOpenError&) { rejected++; }
        }
        EQ((std::vector<int>{calls, rejected}), (std::vector<int>{0, 5}));
    }));

    TEST("stays open until the cooldown has fully elapsed", "opened at t=0, cooldown 30 s; check t=29.9 and t=30", ([] {
        Rig r; r.fail(3);
        r.at(29.9); std::string before = r.b.state();
        r.at(30);
        EQ((VS{before, r.b.state()}), (VS{"open", "half_open"}));
    }));

    TEST("a successful trial call closes the breaker and resets the count", "half-open; call(ok); then 2 failures", ([] {
        Rig r; r.fail(3);
        r.at(30);
        std::string out = r.ok(), afterOk = r.b.state();
        r.fail(2);
        EQ((VS{out, afterOk, r.b.state()}), (VS{"ok", "closed", "closed"}));
    }));

    TEST("a failed trial call reopens and restarts the cooldown", "half-open at t=30; trial fails; check t=59 and t=60", ([] {
        Rig r; r.fail(3);
        r.at(30); r.fail();
        std::string reopened = r.b.state();
        r.at(59); std::string still = r.b.state();
        r.at(60);
        EQ((VS{reopened, still, r.b.state()}), (VS{"open", "open", "half_open"}));
    }));

    TEST("half-open admits only halfOpenMaxCalls trials", "trials 2; allowRequest x3 before any result", ([] {
        Rig r(3, 2); r.fail(3);
        r.at(30); r.b.allowRequest(); r.b.allowRequest();
        RAISES(CircuitOpenError, [&] { r.b.allowRequest(); });
    }));

    TEST("with 2 trials, both must succeed to close", "trials 2; success, then (a) success or (b) failure", ([] {
        Rig a(3, 2); a.fail(3); a.at(30);
        a.ok(); std::string mid = a.b.state(); a.ok();
        Rig b(3, 2); b.fail(3); b.at(30);
        b.ok(); b.fail();
        EQ((VS{mid, a.b.state(), b.b.state()}), (VS{"half_open", "closed", "open"}));
    }));

    TEST("threshold 1 trips on the first failure", "threshold 1; one failure", ([] { Rig r(1); r.fail(); EQ(r.b.state(), std::string("open")); }));

    return lab::summary();
}
