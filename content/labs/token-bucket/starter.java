import java.util.function.DoubleSupplier;

// `now` is a DoubleSupplier returning seconds; invalid arguments throw IllegalArgumentException.
class TokenBucket {
    private final double capacity, refillRate;
    private final DoubleSupplier now;

    TokenBucket(double capacity, double refillRate, DoubleSupplier now) {
        // TODO: throw IllegalArgumentException if capacity <= 0 or refillRate < 0
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.now = now;
        // TODO: start full, and remember when you last refilled
    }

    private void refill() {
        // TODO: tokens = min(capacity, tokens + elapsed * refillRate)
        // TODO: if the clock did not move forward, add nothing and keep the later timestamp
    }

    boolean allow() { return allow(1); }

    boolean allow(double cost) {
        // TODO: throw IllegalArgumentException for cost <= 0; refill; take `cost` tokens if there are enough
        return true;
    }

    double tokens() {
        // TODO: refill, then report the current (possibly fractional) token count
        return 0;
    }
}
