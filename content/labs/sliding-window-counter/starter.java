// Timestamps are doubles (seconds); invalid input throws IllegalArgumentException.

// Given, for contrast: one counter per aligned window, reset at each boundary.
class FixedWindowCounter {
    private final int limit;
    private final double window;
    private double start = Double.NaN;
    private int count = 0;

    FixedWindowCounter(int limit, double window) { this.limit = limit; this.window = window; }

    boolean allow(double t) {
        double s = Math.floor(t / window) * window;
        if (s != start) { start = s; count = 0; }
        if (count >= limit) return false;
        count++;
        return true;
    }
}

// Approximates a sliding window from two fixed-window counts:
// estimate = prev * (1 - elapsed / window) + curr.
class SlidingWindowCounter {
    private final int limit;
    private final double window;

    SlidingWindowCounter(int limit, double window) {
        // TODO: throw IllegalArgumentException unless limit > 0 and window > 0
        this.limit = limit;
        this.window = window;
        // TODO: the current window's start, prev and curr counts, and the last timestamp seen
    }

    double estimate(double t) {
        // TODO: throw IllegalArgumentException if t is earlier than the last timestamp
        // TODO: roll windows: next window -> prev = curr; skipped one or more -> prev = 0
        // TODO: return prev * (1 - (t - currentWindowStart) / window) + curr
        return 0;
    }

    boolean allow(double t) {
        // TODO: refuse (and count nothing) when estimate(t) >= limit; otherwise count it
        return true;
    }
}
