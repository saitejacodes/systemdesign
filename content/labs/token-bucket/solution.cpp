#include <algorithm>
#include <functional>
#include <stdexcept>
#include <utility>

// `now` returns seconds; invalid arguments throw std::invalid_argument.
class TokenBucket {
    double capacity, refillRate;
    std::function<double()> now;
    double tokens_, last;

    void refill() {
        double t = now();
        double elapsed = t - last;
        // Clock stood still or went backwards (NTP step, VM migration): mint nothing and keep
        // the later timestamp, so the same interval is never credited twice.
        if (elapsed <= 0) return;
        tokens_ = std::min(capacity, tokens_ + elapsed * refillRate);
        last = t;
    }

public:
    TokenBucket(double capacity, double refillRate, std::function<double()> now)
        : capacity(capacity), refillRate(refillRate), now(std::move(now)) {
        if (!(capacity > 0) || !(refillRate >= 0)) throw std::invalid_argument("capacity must be > 0 and refillRate >= 0");
        tokens_ = capacity; // a new bucket starts full
        last = this->now();
    }

    bool allow(double cost = 1) {
        if (!(cost > 0)) throw std::invalid_argument("cost must be positive");
        refill();
        if (cost > capacity || tokens_ < cost) return false; // a refused request takes nothing
        tokens_ -= cost;
        return true;
    }

    double tokens() {
        refill();
        return tokens_;
    }
};
