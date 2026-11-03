import java.util.*;
import java.util.function.BooleanSupplier;

public class LabTests {
    static int count(int n, BooleanSupplier f) { int c = 0; for (int i = 0; i < n; i++) if (f.getAsBoolean()) c++; return c; }

    public static void main(String[] args) {
        T.test("allows up to the limit inside one window", "limit 5, window 60; 6 requests at t=0", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(5, 60);
            List<Boolean> out = new ArrayList<>();
            for (int i = 0; i < 6; i++) out.add(s.allow(0));
            T.eq(out, List.of(true, true, true, true, true, false));
        });

        T.test("lesson example: 80 previous, 30 current, 25% in -> 90, allowed", "limit 100, window 60; 80 at t=1, 30 at t=70; estimate(75); 45 s in", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(100, 60);
            count(80, () -> s.allow(1));
            count(30, () -> s.allow(70));
            T.approx(s.estimate(75), 90, 1e-6);
            T.eq(s.allow(75), true);
            T.approx(s.estimate(105), 51, 1e-6); // 80 * 0.25 + 31
        });

        T.test("fixed window (given) lets 2x the limit through at the boundary", "FixedWindowCounter(100, 60); 100 at t=59, 100 at t=60", () -> {
            FixedWindowCounter f = new FixedWindowCounter(100, 60);
            T.eq(count(100, () -> f.allow(59)) + count(100, () -> f.allow(60)), 200);
        });

        T.test("sliding window holds the same boundary burst to the limit", "SlidingWindowCounter(100, 60); 100 at t=59, 100 at t=60", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(100, 60);
            int a = count(100, () -> s.allow(59));
            int b = count(100, () -> s.allow(60));
            T.eq(List.of(a, b), List.of(100, 0));
        });

        T.test("capacity comes back as the previous window slides out", "limit 100, window 60; 100 at t=59; 100 tries at t=90", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(100, 60);
            count(100, () -> s.allow(59));
            T.eq(count(100, () -> s.allow(90)), 50); // 100 * 0.5 + curr < 100
        });

        T.test("refused requests are not counted", "limit 2, window 10; 5 tries at t=0; estimate(0)", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(2, 10);
            T.eq(count(5, () -> s.allow(0)), 2);
            T.approx(s.estimate(0), 2, 1e-9);
        });

        T.test("a gap longer than one window forgets the old counts", "limit 100, window 60; 100 at t=0; 100 tries at t=130", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(100, 60);
            count(100, () -> s.allow(0));
            T.eq(count(100, () -> s.allow(130)), 100);
        });

        T.test("limit 1: the previous request is weighted until it slides out", "limit 1, window 60; allow at t=0, 30, 60, 90", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(1, 60);
            T.eq(List.of(s.allow(0), s.allow(30), s.allow(60), s.allow(90)), List.of(true, false, false, true));
        });

        T.test("steady traffic: the estimate tracks the exact sliding count", "a request every 0.5 s for t=0..330; estimate(330.25) vs exact 120", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(10000, 60);
            for (int i = 0; i < 661; i++) s.allow(i * 0.5);
            T.approx(s.estimate(330.25), 120, 1);
        });

        T.test("a timestamp earlier than the last one throws IllegalArgumentException", "allow(10); allow(5)", () -> {
            SlidingWindowCounter s = new SlidingWindowCounter(10, 60);
            s.allow(10);
            T.raises(IllegalArgumentException.class, () -> s.allow(5));
        });

        T.test("limit 0 throws IllegalArgumentException", "new SlidingWindowCounter(0, 60)", () ->
            T.raises(IllegalArgumentException.class, () -> new SlidingWindowCounter(0, 60)));

        T.summary();
    }
}
