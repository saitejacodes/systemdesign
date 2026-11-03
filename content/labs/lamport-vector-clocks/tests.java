import java.util.*;

public class LabTests {
    // P1: a (send to P2), c.  P2: receive a, b (send to P3).  P3: x, receive b.
    static Map<String, Integer> diagramLamport() {
        LamportClock p1 = new LamportClock(), p2 = new LamportClock(), p3 = new LamportClock();
        Map<String, Integer> e = new LinkedHashMap<>();
        int a = p1.send(); e.put("a", a);
        e.put("x", p3.tick());
        e.put("r2", p2.receive(a));
        int b = p2.send(); e.put("b", b);
        e.put("c", p1.tick());
        e.put("r3", p3.receive(b));
        return e;
    }

    static Map<String, int[]> diagramVector() {
        VectorClock p1 = new VectorClock(0, 3), p2 = new VectorClock(1, 3), p3 = new VectorClock(2, 3);
        Map<String, int[]> e = new LinkedHashMap<>();
        int[] a = p1.send(); e.put("a", a);
        e.put("x", p3.increment());
        e.put("r2", p2.receive(a));
        int[] b = p2.send(); e.put("b", b);
        e.put("c", p1.increment());
        e.put("r3", p3.receive(b));
        return e;
    }

    static int[] v(int... xs) { return xs; }

    public static void main(String[] args) {
        T.test("Lamport: each local event increments the counter", "tick() x3", () -> {
            LamportClock c = new LamportClock();
            T.eq(List.of(c.tick(), c.tick(), c.tick()), List.of(1, 2, 3));
        });

        T.test("Lamport: receive jumps past a sender that is ahead", "local 0; receive(5)", () -> T.eq(new LamportClock().receive(5), 6));

        T.test("Lamport: receive from a sender that is behind still advances", "local at 10; receive(3)", () -> {
            LamportClock c = new LamportClock();
            for (int i = 0; i < 10; i++) c.tick();
            T.eq(c.receive(3), 11);
        });

        T.test("Lamport: three-process diagram", "P1 a→P2, P3 x, P2 recv a, P2 b→P3, P1 c, P3 recv b", () ->
            T.eq(diagramLamport(), Map.of("a", 1, "x", 1, "r2", 2, "b", 3, "c", 2, "r3", 4)));

        T.test("vector: a local event bumps only its own entry", "new VectorClock(1, 3).increment() x2", () -> {
            VectorClock c = new VectorClock(1, 3);
            T.eq(new Object[]{c.increment(), c.increment()}, new Object[]{v(0, 1, 0), v(0, 2, 0)});
        });

        T.test("vector: receive merges element-wise, then increments", "P2 at [0,0,3,0] receives [2,5,1,0]", () -> {
            VectorClock c = new VectorClock(2, 4);
            for (int i = 0; i < 3; i++) c.increment();
            T.eq(c.receive(v(2, 5, 1, 0)), v(2, 5, 4, 0));
        });

        T.test("vector: three-process diagram", "same diagram as the Lamport test", () -> {
            Map<String, int[]> d = diagramVector();
            T.eq(new Object[]{d.get("a"), d.get("x"), d.get("r2"), d.get("b"), d.get("c"), d.get("r3")},
                 new Object[]{v(1, 0, 0), v(0, 0, 1), v(1, 1, 0), v(1, 2, 0), v(2, 0, 0), v(1, 2, 2)});
        });

        T.test("compare: before, after and equal", "[1,0,0] vs [1,2,2]; reverse; [1,2,0] vs itself", () ->
            T.eq(List.of(Clocks.compare(v(1, 0, 0), v(1, 2, 2)), Clocks.compare(v(1, 2, 2), v(1, 0, 0)), Clocks.compare(v(1, 2, 0), v(1, 2, 0))),
                 List.of("before", "after", "equal")));

        T.test("compare: neither dominates means concurrent", "[1,1,0] vs [0,0,1]; [2,0,0] vs [1,2,2]", () ->
            T.eq(List.of(Clocks.compare(v(1, 1, 0), v(0, 0, 1)), Clocks.compare(v(2, 0, 0), v(1, 2, 2))), List.of("concurrent", "concurrent")));

        T.test("Lamport orders events that vector clocks prove concurrent", "diagram: c (P1) vs r3 (P3); x (P3) vs c (P1)", () -> {
            Map<String, Integer> l = diagramLamport();
            Map<String, int[]> d = diagramVector();
            T.eq(l.get("c") < l.get("r3"), true);
            T.eq(List.of(Clocks.compare(d.get("c"), d.get("r3")), Clocks.compare(d.get("x"), d.get("c")), Clocks.compare(d.get("a"), d.get("r3"))),
                 List.of("concurrent", "concurrent", "before"));
        });

        T.test("merge is an element-wise max that leaves its inputs alone", "merge([3,0,2], [1,4,2])", () -> {
            int[] a = v(3, 0, 2), b = v(1, 4, 2);
            T.eq(new Object[]{Clocks.merge(a, b), a, b}, new Object[]{v(3, 4, 2), v(3, 0, 2), v(1, 4, 2)});
        });

        T.test("a sent vector is a snapshot, not a live reference", "msg = send(); increment(); msg[0] = 99", () -> {
            VectorClock c = new VectorClock(0, 2);
            int[] msg = c.send();
            c.increment();
            int[] sent = msg.clone();
            msg[0] = 99;
            T.eq(new Object[]{sent, c.value()}, new Object[]{v(1, 0), v(2, 0)});
        });

        T.test("vectors of different lengths are rejected", "compare([1,0], [1,0,0])", () ->
            T.raises(IllegalArgumentException.class, () -> Clocks.compare(v(1, 0), v(1, 0, 0))));

        T.summary();
    }
}
