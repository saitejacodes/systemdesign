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
    private boolean started = false;
    private double currStart, lastT; // start of the current aligned window; last timestamp seen
    private int prev = 0, curr = 0;  // allowed in the previous / current window

    SlidingWindowCounter(int limit, double window) {
        if (limit <= 0 || !(window > 0)) throw new IllegalArgumentException("limit and window must be positive");
        this.limit = limit;
        this.window = window;
    }

    private void advance(double t) {
        if (started && t < lastT) throw new IllegalArgumentException("timestamps must be non-decreasing");
        double start = Math.floor(t / window) * window;
        if (started && start != currStart) {
            // Rolled into the next window, or idle for a whole window or more (nothing overlaps).
            prev = start == currStart + window ? curr : 0;
            curr = 0;
        }
        started = true;
        lastT = t;
        currStart = start;
    }

    double estimate(double t) {
        advance(t);
        double elapsed = (t - currStart) / window;
        return prev * (1 - elapsed) + curr;
    }

    boolean allow(double t) {
        if (estimate(t) >= limit) return false; // a refused request is not counted
        curr++;
        return true;
    }
}
