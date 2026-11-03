#include <algorithm>
#include <cmath>
#include <functional>
#include <stdexcept>

// In C++ rand is a std::function<double()>, sleep a std::function<void(double)>, failures are
// exceptions derived from std::exception, and retry takes base, cap and rand explicitly.
// Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
using Rand = std::function<double()>;

struct RetryableError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

double exponential(int attempt, double base, double cap) {
    // TODO: min(cap, base * 2^attempt), without overflowing for huge attempts
    return base;
}

double fullJitter(int attempt, double base, double cap, const Rand& rand) {
    // TODO: random_between(0, exponential window)
    return 0;
}

double equalJitter(int attempt, double base, double cap, const Rand& rand) {
    // TODO: temp / 2 + random_between(0, temp / 2)
    return 0;
}

double decorrelatedJitter(double prev, double base, double cap, const Rand& rand) {
    // TODO: min(cap, random_between(base, prev * 3))
    return base;
}

inline bool isRetryableError(const std::exception& e) { return dynamic_cast<const RetryableError*>(&e) != nullptr; }

template <class F>
auto retry(F fn, int maxAttempts, const std::function<void(double)>& sleep, double base, double cap, const Rand& rand,
           const std::function<bool(const std::exception&)>& retryable = isRetryableError) -> decltype(fn()) {
    // TODO: validate maxAttempts (std::invalid_argument); call fn(); on a retryable failure that is not
    // the last attempt, call sleep(fullJitter(attempt, base, cap, rand)) and try again; otherwise `throw;`
    return fn();
}
