import java.util.function.*;

// In Java the functions are static methods of Backoff, rand is a DoubleSupplier, sleep a DoubleConsumer,
// fn a Supplier (so failures are RuntimeExceptions), and retry takes base, cap and rand explicitly.
// Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
class RetryableException extends RuntimeException {
    RetryableException(String message) { super(message); }
}

class Backoff {
    static double exponential(int attempt, double base, double cap) {
        // TODO: min(cap, base * 2^attempt), without overflowing for huge attempts
        return base;
    }

    static double fullJitter(int attempt, double base, double cap, DoubleSupplier rand) {
        // TODO: random_between(0, exponential window)
        return 0;
    }

    static double equalJitter(int attempt, double base, double cap, DoubleSupplier rand) {
        // TODO: temp / 2 + random_between(0, temp / 2)
        return 0;
    }

    static double decorrelatedJitter(double prev, double base, double cap, DoubleSupplier rand) {
        // TODO: min(cap, random_between(base, prev * 3))
        return base;
    }

    static <T> T retry(Supplier<T> fn, int maxAttempts, DoubleConsumer sleep, double base, double cap, DoubleSupplier rand) {
        return retry(fn, maxAttempts, sleep, base, cap, rand, e -> e instanceof RetryableException);
    }

    static <T> T retry(Supplier<T> fn, int maxAttempts, DoubleConsumer sleep, double base, double cap, DoubleSupplier rand,
                       Predicate<RuntimeException> retryable) {
        // TODO: validate maxAttempts; call fn.get(); on a retryable failure that is not the last
        // attempt, call sleep.accept(fullJitter(attempt, base, cap, rand)) and try again; otherwise rethrow
        return fn.get();
    }
}
