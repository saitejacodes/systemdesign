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
    std::deque<Departure> queue_;  // departure times strictly increasing
    std::vector<Departure> out_;   // leaked out, not drained yet
    double lastDeparture_ = -std::numeric_limits<double>::infinity();
    double t_ = -std::numeric_limits<double>::infinity();

    void leak() {
        t_ = std::max(t_, now_()); // a clock that steps backwards is treated as standing still
        while (!queue_.empty() && queue_.front().first <= t_) { out_.push_back(queue_.front()); queue_.pop_front(); }
    }

public:
    LeakyBucket(int capacity, double leakRate, std::function<double()> now) : capacity_(capacity), now_(std::move(now)) {
        if (capacity < 1 || !(leakRate > 0)) throw std::invalid_argument("capacity must be >= 1 and leakRate > 0");
        interval_ = 1.0 / leakRate;
    }

    bool offer(const std::string& request) {
        leak();
        if ((int)queue_.size() >= capacity_) return false; // overflow: the bucket is full, drop the request
        // Leave one interval after the previous departure, or one interval after arriving if the bucket was idle.
        double departure = std::max(t_, lastDeparture_) + interval_;
        queue_.emplace_back(departure, request);
        lastDeparture_ = departure;
        return true;
    }

    int size() {
        leak();
        return (int)queue_.size();
    }

    std::vector<Departure> drain() {
        leak();
        std::vector<Departure> res;
        res.swap(out_);
        return res;
    }
};
