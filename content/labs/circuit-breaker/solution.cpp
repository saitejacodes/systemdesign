#include <functional>
#include <stdexcept>
#include <string>

// In C++ the constructor takes (failureThreshold, resetTimeout, halfOpenMaxCalls, now) positionally,
// state() returns a std::string, and failures are exceptions derived from std::exception.
struct CircuitOpenError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

class CircuitBreaker {
    int failureThreshold;
    double resetTimeout;
    int halfOpenMaxCalls;
    std::function<double()> now;
    std::string current = "closed";
    int failures = 0;     // consecutive failures while closed
    double openedAt = 0;
    int trials = 0;       // trial calls admitted in this half-open period
    int successes = 0;    // trial calls that succeeded

    void open() { current = "open"; openedAt = now(); }

public:
    CircuitBreaker(int failureThreshold, double resetTimeout, int halfOpenMaxCalls, std::function<double()> now)
        : failureThreshold(failureThreshold), resetTimeout(resetTimeout), halfOpenMaxCalls(halfOpenMaxCalls), now(std::move(now)) {}

    std::string state() {
        // Open turns into half-open lazily, the first time anyone looks after the cooldown.
        if (current == "open" && now() - openedAt >= resetTimeout) {
            current = "half_open"; trials = 0; successes = 0;
        }
        return current;
    }

    void allowRequest() {
        std::string s = state();
        if (s == "open") throw CircuitOpenError("circuit open");
        if (s == "half_open") {
            if (trials >= halfOpenMaxCalls) throw CircuitOpenError("half-open: trial calls already in flight");
            trials++;
        }
    }

    void recordSuccess() {
        if (current == "half_open") {
            if (++successes >= halfOpenMaxCalls) { current = "closed"; failures = 0; }
        } else {
            failures = 0;
        }
    }

    void recordFailure() {
        if (current == "half_open") open(); // still sick: wait a full cooldown again
        else if (current == "closed" && ++failures >= failureThreshold) open();
    }

    template <class F>
    auto call(F fn) -> decltype(fn()) {
        allowRequest(); // throws CircuitOpenError without touching fn
        try {
            auto result = fn();
            recordSuccess();
            return result;
        } catch (...) {
            recordFailure();
            throw; // rethrow fn's own exception unchanged
        }
    }
};
