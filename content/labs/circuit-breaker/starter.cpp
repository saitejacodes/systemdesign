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
    // TODO: state, consecutive failure count, time opened, half-open trial counters

public:
    CircuitBreaker(int failureThreshold, double resetTimeout, int halfOpenMaxCalls, std::function<double()> now)
        : failureThreshold(failureThreshold), resetTimeout(resetTimeout), halfOpenMaxCalls(halfOpenMaxCalls), now(std::move(now)) {}

    std::string state() {
        // TODO: if open and resetTimeout has elapsed on now(), become half-open
        return "closed";
    }

    void allowRequest() {
        // TODO: open -> throw CircuitOpenError; half-open -> admit at most halfOpenMaxCalls trials
    }

    void recordSuccess() {
        // TODO: closed -> reset failures; half-open -> close after halfOpenMaxCalls successes
    }

    void recordFailure() {
        // TODO: closed -> count, open at failureThreshold; half-open -> reopen (restart cooldown)
    }

    template <class F>
    auto call(F fn) -> decltype(fn()) {
        // TODO: allowRequest(), run fn, record the outcome, rethrow fn's own exception with `throw;`
        return fn();
    }
};
