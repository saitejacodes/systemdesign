import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

// In Java the constructor takes (failureThreshold, resetTimeout, halfOpenMaxCalls, now) positionally,
// fn is a Supplier (failures are RuntimeExceptions) and the open-state rejection is CircuitOpenException.
class CircuitOpenException extends RuntimeException {
    CircuitOpenException(String message) { super(message); }
}

class CircuitBreaker {
    static final String CLOSED = "closed", OPEN = "open", HALF_OPEN = "half_open";

    private final int failureThreshold, halfOpenMaxCalls;
    private final double resetTimeout;
    private final DoubleSupplier now;
    // TODO: state, consecutive failure count, time opened, half-open trial counters

    CircuitBreaker(int failureThreshold, double resetTimeout, int halfOpenMaxCalls, DoubleSupplier now) {
        this.failureThreshold = failureThreshold;
        this.resetTimeout = resetTimeout;
        this.halfOpenMaxCalls = halfOpenMaxCalls;
        this.now = now;
    }

    String state() {
        // TODO: if open and resetTimeout has elapsed on now, become half-open
        return CLOSED;
    }

    void allowRequest() {
        // TODO: open -> throw CircuitOpenException; half-open -> admit at most halfOpenMaxCalls trials
    }

    void recordSuccess() {
        // TODO: closed -> reset failures; half-open -> close after halfOpenMaxCalls successes
    }

    void recordFailure() {
        // TODO: closed -> count, open at failureThreshold; half-open -> reopen (restart cooldown)
    }

    <T> T call(Supplier<T> fn) {
        // TODO: allowRequest(), run fn, record the outcome, rethrow fn's own exception
        return fn.get();
    }
}
