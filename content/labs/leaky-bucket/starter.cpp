#include <algorithm>
#include <deque>
#include <functional>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// In C++ requests are std::strings, the clock is a std::function<double()>, drain returns a vector of
// (departure time, request) pairs, and an invalid configuration throws std::invalid_argument.
using Departure = std::pair<double, std::string>;

// A bounded FIFO queue that forwards one request every 1 / leakRate seconds.
class LeakyBucket {
    int capacity_;
    double interval_;
    std::function<double()> now_;
    std::deque<Departure> queue_;
    std::vector<Departure> out_; // leaked out, not drained yet

    void leak() {
        // TODO: read now_() (never let it go backwards) and move every queued entry
        // whose departure time has passed into out_
    }

public:
    LeakyBucket(int capacity, double leakRate, std::function<double()> now) : capacity_(capacity), now_(std::move(now)) {
        // TODO: throw std::invalid_argument unless capacity >= 1 and leakRate > 0
        interval_ = 1.0 / leakRate;
    }

    bool offer(const std::string& request) {
        // TODO: leak first; drop (return false) if capacity requests are waiting;
        // otherwise schedule its departure one interval after the previous departure
        // (or after now, if the bucket has been idle) and return true
        queue_.emplace_back(0.0, request);
        return true;
    }

    int size() {
        // TODO: leak first, then count the waiting requests
        return (int)queue_.size();
    }

    std::vector<Departure> drain() {
        // TODO: leak first, then return and clear the departures that have left
        return {};
    }
};
