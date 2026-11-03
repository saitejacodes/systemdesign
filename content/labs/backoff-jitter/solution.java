import java.util.function.*;

// In Java the functions are static methods of Backoff, rand is a DoubleSupplier, sleep a DoubleConsumer,
// fn a Supplier (so failures are RuntimeExceptions), and retry takes base, cap and rand explicitly.
// Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
class RetryableException extends RuntimeException {
    RetryableException(String message) { super(message); }
}

class Backoff {
    /** Capped exponential backoff, no jitter: min(cap, base * 2^attempt). */
    static double exponential(int attempt, double base, double cap) {
        // Clamp the exponent: 2^1023 is still finite, and an overflow to Infinity is capped by min.
        return Math.min(cap, base * Math.pow(2, Math.min(attempt, 1023)));
    }

    /** random_between(0, min(cap, base * 2^attempt)). */
    static double fullJitter(int attempt, double base, double cap, DoubleSupplier rand) {
        return rand.getAsDouble() * exponential(attempt, base, cap);
    }

    /** Half the window guaranteed, the other half random. */
    static double equalJitter(int attempt, double base, double cap, DoubleSupplier rand) {
        double temp = exponential(attempt, base, cap);
        return temp / 2 + rand.getAsDouble() * (temp / 2);
    }

    /** min(cap, random_between(base, prev * 3)); start with prev = base. */
    static double decorrelatedJitter(double prev, double base, double cap, DoubleSupplier rand) {
        return Math.min(cap, base + rand.getAsDouble() * (prev * 3 - base));
    }

    static <T> T retry(Supplier<T> fn, int maxAttempts, DoubleConsumer sleep, double base, double cap, DoubleSupplier rand) {
        return retry(fn, maxAttempts, sleep, base, cap, rand, e -> e instanceof RetryableException);
    }

    /** Call fn up to maxAttempts times, sleeping with full jitter between attempts. */
    static <T> T retry(Supplier<T> fn, int maxAttempts, DoubleConsumer sleep, double base, double cap, DoubleSupplier rand,
                       Predicate<RuntimeException> retryable) {
        if (maxAttempts < 1) throw new IllegalArgumentException("maxAttempts must be at least 1");
        for (int attempt = 0; ; attempt++) {
            try {
                return fn.get();
            } catch (RuntimeException e) {
                // Errors that will repeat (bad input, auth) fail fast; so does the last attempt.
                if (!retryable.test(e) || attempt == maxAttempts - 1) throw e;
            }
            sleep.accept(fullJitter(attempt, base, cap, rand));
        }
    }
}
