#include <cmath>
#include <stdexcept>

// Timestamps are doubles (seconds); invalid input throws std::invalid_argument.

// Given, for contrast: one counter per aligned window, reset at each boundary.
class FixedWindowCounter {
    int limit;
    double window;
    double start = NAN;
    int count = 0;

public:
    FixedWindowCounter(int limit, double window) : limit(limit), window(window) {}

    bool allow(double t) {
        double s = std::floor(t / window) * window;
        if (s != start) { start = s; count = 0; }
        if (count >= limit) return false;
        count++;
        return true;
    }
};

// Approximates a sliding window from two fixed-window counts:
// estimate = prev * (1 - elapsed / window) + curr.
class SlidingWindowCounter {
    int limit;
    double window;
    bool started = false;
    double currStart = 0, lastT = 0; // start of the current aligned window; last timestamp seen
    int prev = 0, curr = 0;          // allowed in the previous / current window

    void advance(double t) {
        if (started && t < lastT) throw std::invalid_argument("timestamps must be non-decreasing");
        double start = std::floor(t / window) * window;
        if (started && start != currStart) {
            // Rolled into the next window, or idle for a whole window or more (nothing overlaps).
            prev = start == currStart + window ? curr : 0;
            curr = 0;
        }
        started = true;
        lastT = t;
        currStart = start;
    }

public:
    SlidingWindowCounter(int limit, double window) : limit(limit), window(window) {
        if (limit <= 0 || !(window > 0)) throw std::invalid_argument("limit and window must be positive");
    }

    double estimate(double t) {
        advance(t);
        double elapsed = (t - currStart) / window;
        return prev * (1 - elapsed) + curr;
    }

    bool allow(double t) {
        if (estimate(t) >= limit) return false; // a refused request is not counted
        curr++;
        return true;
    }
};
