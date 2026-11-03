import java.util.*;
import java.util.function.*;

public class LabTests {
    // mulberry32, the same tiny seeded PRNG the JavaScript tests use.
    static DoubleSupplier mulberry32(int seed) {
        int[] s = {seed};
        return () -> {
            s[0] += 0x6D2B79F5;
            int t = s[0];
            t = (t ^ (t >>> 15)) * (t | 1);
            t = (t + (t ^ (t >>> 7)) * (t | 61)) ^ t;
            return ((t ^ (t >>> 14)) & 0xFFFFFFFFL) / 4294967296.0;
        };
    }

    static DoubleSupplier stub(double v) { return () -> v; }
    static double round1(double x) { return Math.round(x * 10) / 10.0; }

    static class Timeout extends RuntimeException {}

    public static void main(String[] args) {
        T.test("exponential doubles from base", "base 100, cap 5000, attempts 0..4", () -> {
            List<Double> xs = new ArrayList<>();
            for (int a = 0; a < 5; a++) xs.add(Backoff.exponential(a, 100, 5000));
            T.eq(xs, List.of(100.0, 200.0, 400.0, 800.0, 1600.0));
        });

        T.test("exponential is capped, even for huge attempts", "base 100, cap 5000, attempts 6 and 2000", () ->
            T.eq(List.of(Backoff.exponential(6, 100, 5000), Backoff.exponential(2000, 100, 5000)), List.of(5000.0, 5000.0)));

        T.test("full jitter scales the capped window by rand()", "rand 0 / 0.5 / 1, base 100, cap 5000", () ->
            T.eq(List.of(Backoff.fullJitter(3, 100, 5000, stub(0)), Backoff.fullJitter(3, 100, 5000, stub(0.5)), Backoff.fullJitter(10, 100, 5000, stub(1))),
                 List.of(0.0, 400.0, 5000.0)));

        T.test("full jitter stays in [0, window) and averages half of it", "10,000 draws, attempt 3 (window 800), seeded rand", () -> {
            DoubleSupplier r = mulberry32(7);
            boolean ok = true; double sum = 0;
            for (int i = 0; i < 10000; i++) { double x = Backoff.fullJitter(3, 100, 5000, r); ok &= x >= 0 && x < 800; sum += x; }
            T.eq(ok, true);
            T.eq(round1(sum / 10000 / 400), 1.0);
        });

        T.test("equal jitter keeps at least half the window", "10,000 draws, attempt 2 (window 400), seeded rand; rand 0 and 0.5", () -> {
            DoubleSupplier r = mulberry32(11);
            boolean ok = true; double sum = 0;
            for (int i = 0; i < 10000; i++) { double x = Backoff.equalJitter(2, 100, 5000, r); ok &= x >= 200 && x < 400; sum += x; }
            T.eq(ok, true);
            T.eq(round1(sum / 10000 / 300), 1.0);
            T.eq(List.of(Backoff.equalJitter(2, 100, 5000, stub(0)), Backoff.equalJitter(2, 100, 5000, stub(0.5))), List.of(200.0, 300.0));
        });

        T.test("decorrelated jitter draws from [base, 3 * previous]", "rand 0 and 0.5 from prev 100 and 1000", () ->
            T.eq(List.of(Backoff.decorrelatedJitter(100, 100, 5000, stub(0)), Backoff.decorrelatedJitter(100, 100, 5000, stub(0.5)),
                         Backoff.decorrelatedJitter(1000, 100, 5000, stub(0.5))), List.of(100.0, 200.0, 1550.0)));

        T.test("decorrelated jitter never leaves [base, cap]", "chain of 1,000 sleeps, base 100, cap 5000, seeded rand", () -> {
            DoubleSupplier r = mulberry32(3);
            double prev = 100; boolean ok = true, hitCap = false;
            for (int i = 0; i < 1000; i++) {
                double s = Backoff.decorrelatedJitter(prev, 100, 5000, r);
                ok &= s >= 100 && s <= 5000 && s <= 3 * prev;
                hitCap |= s == 5000;
                prev = s;
            }
            T.eq(List.of(ok, hitCap), List.of(true, true));
        });

        T.test("retry returns the result after transient failures", "fails twice with RetryableException, then \"ok\"; rand 0.5", () -> {
            int[] calls = {0};
            List<Double> sleeps = new ArrayList<>();
            String out = Backoff.retry(() -> { if (++calls[0] < 3) throw new RetryableException("503"); return "ok"; }, 5, sleeps::add, 100, 5000, stub(0.5));
            T.eq(out, "ok");
            T.eq(calls[0], 3);
            T.eq(sleeps, List.of(50.0, 100.0));
        });

        T.test("retry gives up after maxAttempts and raises the last error", "always fails, maxAttempts 4", () -> {
            int[] calls = {0};
            List<Double> sleeps = new ArrayList<>();
            String msg = "no exception";
            try { Backoff.retry(() -> { throw new RetryableException("attempt " + ++calls[0]); }, 4, sleeps::add, 100, 5000, stub(1)); }
            catch (RetryableException e) { msg = e.getMessage(); }
            T.eq(msg, "attempt 4");
            T.eq(calls[0], 4);
            T.eq(sleeps, List.of(100.0, 200.0, 400.0));
        });

        T.test("a non-retryable error is raised at once, with no sleep", "fn throws IllegalArgumentException (like a 400)", () -> {
            int[] calls = {0};
            List<Double> sleeps = new ArrayList<>();
            String kind = "no exception";
            try { Backoff.retry(() -> { calls[0]++; throw new IllegalArgumentException("bad request"); }, 5, sleeps::add, 100, 5000, stub(0.5)); }
            catch (IllegalArgumentException e) { kind = "IllegalArgumentException"; }
            T.eq(kind, "IllegalArgumentException");
            T.eq(calls[0], 1);
            T.eq(sleeps, List.of());
        });

        T.test("a custom retryable predicate decides what is retried", "retryable = Timeout only; fails with Timeout once", () -> {
            int[] calls = {0};
            List<Double> sleeps = new ArrayList<>();
            int out = Backoff.retry(() -> { if (++calls[0] == 1) throw new Timeout(); return calls[0]; }, 3, sleeps::add, 100, 5000, stub(0.5),
                                    e -> e instanceof Timeout);
            T.eq(out, 2);
            T.eq(sleeps, List.of(50.0));
        });

        T.test("retry sleeps grow exponentially and stop at the cap", "always fails, 10 attempts, base 100, cap 1000, rand 1", () -> {
            List<Double> sleeps = new ArrayList<>();
            try { Backoff.retry(() -> { throw new RetryableException("down"); }, 10, sleeps::add, 100, 1000, stub(1)); }
            catch (RetryableException e) { /* expected */ }
            T.eq(sleeps, List.of(100.0, 200.0, 400.0, 800.0, 1000.0, 1000.0, 1000.0, 1000.0, 1000.0));
        });

        T.test("maxAttempts below 1 is rejected", "retry(fn, 0, sleep, ...)", () ->
            T.raises(IllegalArgumentException.class, () -> Backoff.retry(() -> 1, 0, s -> {}, 100, 5000, stub(0.5))));

        T.summary();
    }
}
