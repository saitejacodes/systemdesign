#include <algorithm>
#include <functional>
#include <stdexcept>
#include <utility>

// `now` returns seconds; invalid arguments throw std::invalid_argument.
class TokenBucket {
    double capacity, refillRate;
    std::function<double()> now;
    // TODO: the token count and the time of the last refill

    void refill() {
        // TODO: tokens = min(capacity, tokens + elapsed * refillRate)
        // TODO: if the clock did not move forward, add nothing and keep the later timestamp
    }

public:
    TokenBucket(double capacity, double refillRate, std::function<double()> now)
        : capacity(capacity), refillRate(refillRate), now(std::move(now)) {
        // TODO: throw std::invalid_argument if capacity <= 0 or refillRate < 0
        // TODO: start full, and remember when you last refilled
    }

    bool allow(double cost = 1) {
        // TODO: throw std::invalid_argument for cost <= 0; refill; take `cost` tokens if there are enough
        return true;
    }

    double tokens() {
        // TODO: refill, then report the current (possibly fractional) token count
        return 0;
    }
};
