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
    private final ArrayDeque<Departure> queue = new ArrayDeque<>();
    private List<Departure> out = new ArrayList<>(); // leaked out, not drained yet

    LeakyBucket(int capacity, double leakRate, DoubleSupplier now) {
        // TODO: throw IllegalArgumentException unless capacity >= 1 and leakRate > 0
        this.capacity = capacity;
        this.interval = 1.0 / leakRate;
        this.now = now;
    }

    private void leak() {
        // TODO: read now.getAsDouble() (never let it go backwards) and move every queued entry
        // whose departure time has passed into out
    }

    boolean offer(String request) {
        // TODO: leak first; drop (return false) if capacity requests are waiting;
        // otherwise schedule its departure one interval after the previous departure
        // (or after now, if the bucket has been idle) and return true
        queue.addLast(new Departure(0, request));
        return true;
    }

    int size() {
        // TODO: leak first, then count the waiting requests
        return queue.size();
    }

    List<Departure> drain() {
        // TODO: leak first, then return and clear the departures that have left
        return new ArrayList<>();
    }
}
