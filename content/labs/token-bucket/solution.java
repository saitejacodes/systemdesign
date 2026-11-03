import java.util.function.DoubleSupplier;

// `now` is a DoubleSupplier returning seconds; invalid arguments throw IllegalArgumentException.
class TokenBucket {
    private final double capacity, refillRate;
    private final DoubleSupplier now;
    private double tokens, last;

    TokenBucket(double capacity, double refillRate, DoubleSupplier now) {
        if (!(capacity > 0) || !(refillRate >= 0)) throw new IllegalArgumentException("capacity must be > 0 and refillRate >= 0");
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.now = now;
        this.tokens = capacity; // a new bucket starts full
        this.last = now.getAsDouble();
    }

    private void refill() {
        double t = now.getAsDouble();
        double elapsed = t - last;
        // Clock stood still or went backwards (NTP step, VM migration): mint nothing and keep
        // the later timestamp, so the same interval is never credited twice.
        if (elapsed <= 0) return;
        tokens = Math.min(capacity, tokens + elapsed * refillRate);
        last = t;
    }

    boolean allow() { return allow(1); }

    boolean allow(double cost) {
        if (!(cost > 0)) throw new IllegalArgumentException("cost must be positive");
        refill();
        if (cost > capacity || tokens < cost) return false; // a refused request takes nothing
        tokens -= cost;
        return true;
    }

    double tokens() {
        refill();
        return tokens;
    }
}
