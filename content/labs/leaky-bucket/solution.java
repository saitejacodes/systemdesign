import java.util.*;
import java.util.function.DoubleSupplier;

// In Java requests are Strings, the clock is a DoubleSupplier, drain returns a List<Departure>,
// and an invalid configuration throws IllegalArgumentException.
record Departure(double time, String request) {}

// A bounded FIFO queue that forwards one request every 1 / leakRate seconds.
class LeakyBucket {
    private final int capacity;
    private final double interval;
    private final DoubleSupplier now;
    private final ArrayDeque<Departure> queue = new ArrayDeque<>(); // departure times strictly increasing
    private List<Departure> out = new ArrayList<>();                 // leaked out, not drained yet
    private double lastDeparture = Double.NEGATIVE_INFINITY;
    private double t = Double.NEGATIVE_INFINITY;

    LeakyBucket(int capacity, double leakRate, DoubleSupplier now) {
        if (capacity < 1 || !(leakRate > 0)) throw new IllegalArgumentException("capacity must be >= 1 and leakRate > 0");
        this.capacity = capacity;
        this.interval = 1.0 / leakRate;
        this.now = now;
    }

    private void leak() {
        t = Math.max(t, now.getAsDouble()); // a clock that steps backwards is treated as standing still
        while (!queue.isEmpty() && queue.peekFirst().time() <= t) out.add(queue.pollFirst());
    }

    boolean offer(String request) {
        leak();
        if (queue.size() >= capacity) return false; // overflow: the bucket is full, drop the request
        // Leave one interval after the previous departure, or one interval after arriving if the bucket was idle.
        double departure = Math.max(t, lastDeparture) + interval;
        queue.addLast(new Departure(departure, request));
        lastDeparture = departure;
        return true;
    }

    int size() {
        leak();
        return queue.size();
    }

    List<Departure> drain() {
        leak();
        List<Departure> res = out;
        out = new ArrayList<>();
        return res;
    }
}
