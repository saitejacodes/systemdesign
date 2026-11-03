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

// Capped exponential backoff, no jitter: min(cap, base * 2^attempt).
double exponential(int attempt, double base, double cap) {
    // Clamp the exponent: 2^1023 is still finite, and an overflow to infinity is capped by min.
    return std::min(cap, base * std::pow(2.0, std::min(attempt, 1023)));
}

// random_between(0, min(cap, base * 2^attempt)).
double fullJitter(int attempt, double base, double cap, const Rand& rand) { return rand() * exponential(attempt, base, cap); }

// Half the window guaranteed, the other half random.
double equalJitter(int attempt, double base, double cap, const Rand& rand) {
    double temp = exponential(attempt, base, cap);
    return temp / 2 + rand() * (temp / 2);
}

// min(cap, random_between(base, prev * 3)); start with prev = base.
double decorrelatedJitter(double prev, double base, double cap, const Rand& rand) {
    return std::min(cap, base + rand() * (prev * 3 - base));
}

inline bool isRetryableError(const std::exception& e) { return dynamic_cast<const RetryableError*>(&e) != nullptr; }

// Call fn up to maxAttempts times, sleeping with full jitter between attempts.
template <class F>
auto retry(F fn, int maxAttempts, const std::function<void(double)>& sleep, double base, double cap, const Rand& rand,
           const std::function<bool(const std::exception&)>& retryable = isRetryableError) -> decltype(fn()) {
    if (maxAttempts < 1) throw std::invalid_argument("maxAttempts must be at least 1");
    for (int attempt = 0;; attempt++) {
        try {
            return fn();
        } catch (const std::exception& e) {
            // Errors that will repeat (bad input, auth) fail fast; so does the last attempt.
            if (!retryable(e) || attempt == maxAttempts - 1) throw; // rethrows the original type
        }
        sleep(fullJitter(attempt, base, cap, rand));
    }
}
