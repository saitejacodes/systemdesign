import java.util.*;

public class LabTests {
    // A settable clock: c[0] is "now" in seconds.
    static LeakyBucket bucket(int capacity, double rate, double[] c) { return new LeakyBucket(capacity, rate, () -> c[0]); }

    static List<Double> times(List<Departure> ds) {
        List<Double> out = new ArrayList<>();
        for (Departure d : ds) out.add(d.time());
        return out;
    }

    public static void main(String[] args) {
        T.test("an invalid capacity or leak rate is rejected", "new LeakyBucket(0, 1, now), then new LeakyBucket(1, 0, now)", () -> {
            T.raises(IllegalArgumentException.class, () -> new LeakyBucket(0, 1, () -> 0));
            T.raises(IllegalArgumentException.class, () -> new LeakyBucket(1, 0, () -> 0));
        });

        T.test("a burst fills the bucket, then overflow is dropped", "cap 3, rate 1/s: 5 offers at t = 0", () -> {
            LeakyBucket b = bucket(3, 1, new double[] {0});
            List<Boolean> got = new ArrayList<>();
            for (int i = 0; i < 5; i++) got.add(b.offer("r" + i));
            T.eq(got, List.of(true, true, true, false, false));
            T.eq(b.size(), 3);
        });

        T.test("no burst comes out: departures are spaced 1 / rate apart", "cap 3, rate 2/s: offer a, b, c at t = 0; drain at t = 10", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(3, 2, c);
            for (String r : List.of("a", "b", "c")) b.offer(r);
            c[0] = 10;
            T.eq(b.drain(), List.of(new Departure(0.5, "a"), new Departure(1.0, "b"), new Departure(1.5, "c")));
        });

        T.test("the queue drains at a steady rate", "cap 3, rate 2/s, 3 queued at t = 0: size at t = 0.25, 0.5, 1.0, 1.5", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(3, 2, c);
            for (String r : List.of("a", "b", "c")) b.offer(r);
            List<Integer> sizes = new ArrayList<>();
            for (double t : new double[] {0.25, 0.5, 1.0, 1.5}) { c[0] = t; sizes.add(b.size()); }
            T.eq(sizes, List.of(3, 2, 1, 0));
        });

        T.test("once one request leaks out there is room for exactly one more", "cap 2, rate 1/s: a, b at t = 0; c at t = 0.5; c at t = 1", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(2, 1, c);
            List<Boolean> got = new ArrayList<>(List.of(b.offer("a"), b.offer("b")));
            c[0] = 0.5; got.add(b.offer("c"));
            c[0] = 1.0; got.add(b.offer("c")); got.add(b.offer("d"));
            c[0] = 10;
            T.eq(got, List.of(true, true, false, true, false));
            T.eq(times(b.drain()), List.of(1.0, 2.0, 3.0));
        });

        T.test("an idle period empties the bucket and it accepts a full burst again", "cap 3, rate 1/s: 4 offers at t = 0, 4 more at t = 10", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(3, 1, c);
            List<Boolean> first = new ArrayList<>(), second = new ArrayList<>();
            for (int i = 0; i < 4; i++) first.add(b.offer("r" + i));
            c[0] = 10;
            int empty = b.size();
            for (int i = 4; i < 8; i++) second.add(b.offer("r" + i));
            T.eq(first, List.of(true, true, true, false));
            T.eq(empty, 0);
            T.eq(second, List.of(true, true, true, false));
        });

        T.test("a request into an idle bucket leaves one interval after it arrives", "cap 2, rate 4/s: offer x at t = 5; drain at t = 6", () -> {
            double[] c = {5};
            LeakyBucket b = bucket(2, 4, c);
            b.offer("x");
            c[0] = 6;
            T.eq(b.drain(), List.of(new Departure(5.25, "x")));
        });

        T.test("arrivals exactly at the leak rate are never dropped, even with capacity 1", "cap 1, rate 2/s: 100 offers, one every 0.5 s", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(1, 2, c);
            int ok = 0;
            for (int i = 0; i < 100; i++) { c[0] = i * 0.5; if (b.offer("r" + i)) ok++; }
            T.eq(ok, 100);
        });

        T.test("arrivals 4x faster than the rate: accepted = drained so far + capacity", "cap 2, rate 1/s: 40 offers, one every 0.25 s; drain at t = 100", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(2, 1, c);
            int ok = 0;
            for (int i = 0; i < 40; i++) { c[0] = i * 0.25; if (b.offer("r" + i)) ok++; }
            c[0] = 100;
            T.eq(ok, 11);
            T.eq(times(b.drain()), List.of(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0));
        });

        T.test("drain returns each request once, in arrival order", "cap 4, rate 1/s: offer 1..4; drain at t = 2.5 and again", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(4, 1, c);
            for (String r : List.of("1", "2", "3", "4")) b.offer(r);
            c[0] = 2.5;
            List<String> first = new ArrayList<>();
            for (Departure d : b.drain()) first.add(d.request());
            T.eq(first, List.of("1", "2"));
            T.eq(b.drain(), List.of());
            T.eq(b.size(), 2);
        });

        T.test("a clock stepping backwards neither leaks nor crashes", "cap 2, rate 1/s: offer a at t = 5; clock goes to t = 1; then t = 6.5", () -> {
            double[] c = {5};
            LeakyBucket b = bucket(2, 1, c);
            b.offer("a");
            c[0] = 1;
            T.eq(b.size(), 1);
            T.eq(b.drain(), List.of());
            T.eq(b.offer("b"), true);
            c[0] = 6.5;
            T.eq(b.drain(), List.of(new Departure(6.0, "a")));
        });

        T.test("capacity 1 holds a single request", "cap 1, rate 1/s: 2 offers at t = 0", () -> {
            LeakyBucket b = bucket(1, 1, new double[] {0});
            T.eq(List.of(b.offer("a"), b.offer("b")), List.of(true, false));
            T.eq(b.size(), 1);
        });

        T.test("100,000 offers at twice the rate stay fast", "cap 100, rate 1024/s, one offer every 1/2048 s", () -> {
            double[] c = {0};
            LeakyBucket b = bucket(100, 1024, c);
            int ok = 0;
            for (int i = 0; i < 100000; i++) { c[0] = i / 2048.0; if (b.offer("r")) ok++; }
            T.eq(ok, 50099);
            T.eq(b.size(), 100);
        });

        T.summary();
    }
}
