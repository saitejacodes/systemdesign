import java.util.*;
import java.util.function.Supplier;

public class LabTests {
    static final class Clock { double t = 0; }

    static final Supplier<String> OK = () -> "ok";
    static final Supplier<String> BOOM = () -> { throw new IllegalStateException("dependency down"); };

    static Clock clock;
    static CircuitBreaker make(int threshold, int trials) { clock = new Clock(); Clock c = clock; return new CircuitBreaker(threshold, 30, trials, () -> c.t); }
    static CircuitBreaker make() { return make(3, 1); }

    static void fail(CircuitBreaker b, int n) {
        for (int i = 0; i < n; i++) { try { b.call(BOOM); } catch (IllegalStateException e) { /* expected */ } }
    }

    public static void main(String[] args) {
        T.test("starts closed and passes calls through", "threshold 3; call(ok)", () -> {
            CircuitBreaker b = make();
            T.eq(List.of(b.state(), b.call(OK), b.state()), List.of("closed", "ok", "closed"));
        });

        T.test("stays closed below the threshold", "threshold 3; 2 failures", () -> { CircuitBreaker b = make(); fail(b, 2); T.eq(b.state(), "closed"); });

        T.test("opens after N consecutive failures", "threshold 3; 3 failures", () -> { CircuitBreaker b = make(); fail(b, 3); T.eq(b.state(), "open"); });

        T.test("a success resets the consecutive-failure count", "threshold 3; fail, fail, ok, fail, fail", () -> {
            CircuitBreaker b = make(); fail(b, 2); b.call(OK); fail(b, 2);
            T.eq(b.state(), "closed");
        });

        T.test("the caller sees the dependency's own exception", "call(fn throwing UnsupportedOperationException) while closed", () -> {
            CircuitBreaker b = make();
            T.raises(UnsupportedOperationException.class, () -> b.call(() -> { throw new UnsupportedOperationException("x"); }));
        });

        T.test("an open breaker fails fast with CircuitOpenException", "tripped; call(fn)", () -> {
            CircuitBreaker b = make(); fail(b, 3);
            T.raises(CircuitOpenException.class, () -> b.call(OK));
        });

        T.test("while open, the dependency is never called", "tripped; 5 calls at t = 1..5 s", () -> {
            CircuitBreaker b = make(); fail(b, 3);
            int[] calls = {0};
            int rejected = 0;
            for (int t = 1; t <= 5; t++) {
                clock.t = t;
                try { b.call(() -> ++calls[0]); } catch (CircuitOpenException e) { rejected++; }
            }
            T.eq(List.of(calls[0], rejected), List.of(0, 5));
        });

        T.test("stays open until the cooldown has fully elapsed", "opened at t=0, cooldown 30 s; check t=29.9 and t=30", () -> {
            CircuitBreaker b = make(); fail(b, 3);
            clock.t = 29.9; String before = b.state();
            clock.t = 30;
            T.eq(List.of(before, b.state()), List.of("open", "half_open"));
        });

        T.test("a successful trial call closes the breaker and resets the count", "half-open; call(ok); then 2 failures", () -> {
            CircuitBreaker b = make(); fail(b, 3);
            clock.t = 30;
            String out = b.call(OK), afterOk = b.state();
            fail(b, 2);
            T.eq(List.of(out, afterOk, b.state()), List.of("ok", "closed", "closed"));
        });

        T.test("a failed trial call reopens and restarts the cooldown", "half-open at t=30; trial fails; check t=59 and t=60", () -> {
            CircuitBreaker b = make(); fail(b, 3);
            clock.t = 30; fail(b, 1);
            String reopened = b.state();
            clock.t = 59; String still = b.state();
            clock.t = 60;
            T.eq(List.of(reopened, still, b.state()), List.of("open", "open", "half_open"));
        });

        T.test("half-open admits only halfOpenMaxCalls trials", "trials 2; allowRequest x3 before any result", () -> {
            CircuitBreaker b = make(3, 2); fail(b, 3);
            clock.t = 30; b.allowRequest(); b.allowRequest();
            T.raises(CircuitOpenException.class, b::allowRequest);
        });

        T.test("with 2 trials, both must succeed to close", "trials 2; success, then (a) success or (b) failure", () -> {
            CircuitBreaker a = make(3, 2); fail(a, 3); clock.t = 30;
            a.call(OK); String mid = a.state(); a.call(OK);
            CircuitBreaker b = make(3, 2); fail(b, 3); clock.t = 30;
            b.call(OK); fail(b, 1);
            T.eq(List.of(mid, a.state(), b.state()), List.of("half_open", "closed", "open"));
        });

        T.test("threshold 1 trips on the first failure", "threshold 1; one failure", () -> { CircuitBreaker b = make(1, 1); fail(b, 1); T.eq(b.state(), "open"); });

        T.summary();
    }
}
