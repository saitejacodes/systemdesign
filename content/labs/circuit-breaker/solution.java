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
    private String current = CLOSED;
    private int failures = 0;      // consecutive failures while closed
    private double openedAt = 0;
    private int trials = 0;        // trial calls admitted in this half-open period
    private int successes = 0;     // trial calls that succeeded

    CircuitBreaker(int failureThreshold, double resetTimeout, int halfOpenMaxCalls, DoubleSupplier now) {
        this.failureThreshold = failureThreshold;
        this.resetTimeout = resetTimeout;
        this.halfOpenMaxCalls = halfOpenMaxCalls;
        this.now = now;
    }

    String state() {
        // Open turns into half-open lazily, the first time anyone looks after the cooldown.
        if (current.equals(OPEN) && now.getAsDouble() - openedAt >= resetTimeout) {
            current = HALF_OPEN; trials = 0; successes = 0;
        }
        return current;
    }

    private void open() { current = OPEN; openedAt = now.getAsDouble(); }

    void allowRequest() {
        String s = state();
        if (s.equals(OPEN)) throw new CircuitOpenException("circuit open");
        if (s.equals(HALF_OPEN)) {
            if (trials >= halfOpenMaxCalls) throw new CircuitOpenException("half-open: trial calls already in flight");
            trials++;
        }
    }

    void recordSuccess() {
        if (current.equals(HALF_OPEN)) {
            if (++successes >= halfOpenMaxCalls) { current = CLOSED; failures = 0; }
        } else {
            failures = 0;
        }
    }

    void recordFailure() {
        if (current.equals(HALF_OPEN)) open(); // still sick: wait a full cooldown again
        else if (current.equals(CLOSED) && ++failures >= failureThreshold) open();
    }

    <T> T call(Supplier<T> fn) {
        allowRequest(); // throws CircuitOpenException without touching fn
        T result;
        try {
            result = fn.get();
        } catch (RuntimeException e) {
            recordFailure();
            throw e;
        }
        recordSuccess();
        return result;
    }
}
