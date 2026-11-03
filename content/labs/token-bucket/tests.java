import java.util.*;

public class LabTests {
    // A fake clock: tests move time by setting t (seconds).
    static final class Clock { double t; Clock(double t) { this.t = t; } double now() { return t; } }

    static int count(int n, java.util.function.BooleanSupplier f) { int c = 0; for (int i = 0; i < n; i++) if (f.getAsBoolean()) c++; return c; }

    public static void main(String[] args) {
        T.test("a new bucket starts full: capacity requests pass, the next is refused", "B=10, R=1; 11 requests at t=0", () -> {
            TokenBucket b = new TokenBucket(10, 1, new Clock(0)::now);
            int passed = count(10, b::allow);
            T.eq(List.of(passed, b.allow()), List.of(10, false));
        });

        T.test("lesson example: burst of 15, then 2 tokens a second later", "B=10, R=2; 15 at t=0, 3 at t=1", () -> {
            Clock c = new Clock(0); TokenBucket b = new TokenBucket(10, 2, c::now);
            int burst = count(15, b::allow);
            c.t = 1;
            T.eq(List.of(burst, count(3, b::allow)), List.of(10, 2));
        });

        T.test("refill never exceeds capacity", "B=10, R=5; drain, idle 1000 s", () -> {
            Clock c = new Clock(0); TokenBucket b = new TokenBucket(10, 5, c::now);
            count(10, b::allow);
            c.t = 1000;
            T.approx(b.tokens(), 10, 1e-6);
        });

        T.test("refill is fractional", "B=1, R=0.5; allow at t=0, 1, 2", () -> {
            Clock c = new Clock(0); TokenBucket b = new TokenBucket(1, 0.5, c::now);
            boolean a0 = b.allow();
            c.t = 1; boolean a1 = b.allow(); double half = b.tokens();
            c.t = 2; boolean a2 = b.allow();
            T.eq(List.of(a0, a1, a2), List.of(true, false, true));
            T.approx(half, 0.5, 1e-6);
        });

        T.test("a weighted request takes cost tokens; a refused one takes none", "B=10, R=0; allow(4) x3, allow(2)", () -> {
            TokenBucket b = new TokenBucket(10, 0, new Clock(0)::now);
            List<Boolean> out = new ArrayList<>(List.of(b.allow(4), b.allow(4), b.allow(4)));
            double left = b.tokens();
            out.add(b.allow(2));
            T.eq(out, List.of(true, true, false, true));
            T.approx(left, 2, 1e-6);
        });

        T.test("cost > capacity is always refused, even when full", "B=5, R=1; idle 100 s; allow(6)", () -> {
            Clock c = new Clock(0); TokenBucket b = new TokenBucket(5, 1, c::now);
            c.t = 100;
            T.eq(b.allow(6), false);
            T.approx(b.tokens(), 5, 1e-6);
        });

        T.test("clock going backwards mints no tokens and is not credited twice", "B=10, R=2; drain at t=10; t=5; t=10.5", () -> {
            Clock c = new Clock(10); TokenBucket b = new TokenBucket(10, 2, c::now);
            count(10, b::allow);
            c.t = 5; // NTP stepped the clock back 5 s
            T.eq(b.allow(), false);
            T.approx(b.tokens(), 0, 1e-6);
            c.t = 10.5; // only 0.5 s past the last real refill: exactly 1 token
            T.eq(b.allow(), true);
            T.approx(b.tokens(), 0, 1e-6);
        });

        T.test("refill_rate 0 never refills", "B=2, R=0; drain; idle 1e6 s", () -> {
            Clock c = new Clock(0); TokenBucket b = new TokenBucket(2, 0, c::now);
            b.allow(); b.allow();
            c.t = 1e6;
            T.eq(b.allow(), false);
        });

        T.test("sustained rate converges to B + R*T", "B=5, R=4; a request every 0.125 s for 10 s (81 requests)", () -> {
            Clock c = new Clock(0); TokenBucket b = new TokenBucket(5, 4, c::now);
            int allowed = 0;
            for (int i = 0; i < 81; i++) { c.t = i * 0.125; if (b.allow()) allowed++; }
            T.eq(allowed, 5 + 4 * 10);
        });

        T.test("tokens() only reads: it never consumes", "B=3, R=1; tokens() twice", () -> {
            TokenBucket b = new TokenBucket(3, 1, new Clock(0)::now);
            b.allow();
            T.approx(b.tokens(), 2, 1e-6);
            T.approx(b.tokens(), 2, 1e-6);
            T.eq(List.of(b.allow(), b.allow(), b.allow()), List.of(true, true, false));
        });

        T.test("allow(0) throws IllegalArgumentException", "allow(0)", () -> {
            TokenBucket b = new TokenBucket(3, 1, new Clock(0)::now);
            T.raises(IllegalArgumentException.class, () -> b.allow(0));
        });

        T.test("capacity 0 throws IllegalArgumentException", "new TokenBucket(0, 1, now)", () ->
            T.raises(IllegalArgumentException.class, () -> new TokenBucket(0, 1, new Clock(0)::now)));

        T.summary();
    }
}
