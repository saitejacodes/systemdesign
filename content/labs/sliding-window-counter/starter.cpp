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
    // TODO: the current window's start, prev and curr counts, and the last timestamp seen

public:
    SlidingWindowCounter(int limit, double window) : limit(limit), window(window) {
        // TODO: throw std::invalid_argument unless limit > 0 and window > 0
    }

    double estimate(double t) {
        // TODO: throw std::invalid_argument if t is earlier than the last timestamp
        // TODO: roll windows: next window -> prev = curr; skipped one or more -> prev = 0
        // TODO: return prev * (1 - (t - currentWindowStart) / window) + curr
        return 0;
    }

    bool allow(double t) {
        // TODO: refuse (and count nothing) when estimate(t) >= limit; otherwise count it
        return true;
    }
};
