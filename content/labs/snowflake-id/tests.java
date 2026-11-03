import java.util.*;
import java.util.function.LongSupplier;

public class LabTests {
    static final long E = 1288834974657L; // Twitter's epoch (the default)

    // A fake clock that returns each value in turn, then repeats the last one.
    static LongSupplier clock(long... vals) {
        int[] i = {0};
        return () -> vals[Math.min(i[0]++, vals.length - 1)];
    }

    static List<Long> tsSeq(long id) { Parts p = Snowflake.parse(id); return List.of(p.timestamp() - E, (long) p.sequence()); }

    static boolean increasing(long[] ids) {
        for (int i = 1; i < ids.length; i++) if (ids[i - 1] >= ids[i]) return false;
        return true;
    }

    public static void main(String[] args) {
        T.test("bit layout: timestamp << 22 | worker << 12 | sequence", "worker 1, clock = epoch + 1 ms", () ->
            T.eq(new Snowflake(1, clock(E + 1)).nextId(), (1L << 22) | (1L << 12)));

        T.test("parse recovers timestamp, worker and sequence", "worker 513, clock = epoch + 123456789", () ->
            T.eq(Snowflake.parse(new Snowflake(513, clock(E + 123456789)).nextId()), new Parts(E + 123456789, 513, 0)));

        T.test("IDs in the same millisecond bump the sequence", "3 IDs, clock fixed at epoch + 50", () -> {
            Snowflake g = new Snowflake(7, clock(E + 50));
            long a = g.nextId(), b = g.nextId(), c = g.nextId();
            T.eq(List.of(Snowflake.parse(a).sequence(), Snowflake.parse(b).sequence(), Snowflake.parse(c).sequence()), List.of(0, 1, 2));
            T.eq(c - a, 2L);
        });

        T.test("a new millisecond resets the sequence to 0", "clock: epoch+50, +50, +51", () -> {
            Snowflake g = new Snowflake(7, clock(E + 50, E + 50, E + 51));
            T.eq(List.of(tsSeq(g.nextId()), tsSeq(g.nextId()), tsSeq(g.nextId())), List.of(List.of(50L, 0L), List.of(50L, 1L), List.of(51L, 0L)));
        });

        T.test("10,000 IDs are unique and strictly increasing", "clock advances 1 ms every 3 reads", () -> {
            long[] reads = {0};
            Snowflake g = new Snowflake(42, () -> E + (++reads[0]) / 3);
            long[] ids = new long[10000];
            for (int i = 0; i < ids.length; i++) ids[i] = g.nextId();
            T.eq(increasing(ids), true);
        });

        T.test("sequence overflow waits for the next millisecond", "clock stuck at T for 5,000 reads, then T+1; 4,097 IDs", () -> {
            long[] reads = {0};
            long t = E + 1000;
            Snowflake g = new Snowflake(3, () -> ++reads[0] <= 5000 ? t : t + 1);
            long[] ids = new long[4097];
            for (int i = 0; i < ids.length; i++) ids[i] = g.nextId();
            T.eq(Snowflake.parse(ids[4095]), new Parts(t, 3, 4095));
            T.eq(Snowflake.parse(ids[4096]), new Parts(t + 1, 3, 0));
            T.eq(increasing(ids), true);
        });

        T.test("a clock that moves backwards raises ClockMovedBackwardsException", "clock: epoch+100, then epoch+99", () -> {
            Snowflake g = new Snowflake(1, clock(E + 100, E + 99));
            g.nextId();
            T.raises(ClockMovedBackwardsException.class, g::nextId);
        });

        T.test("after the clock catches up, IDs continue without a duplicate", "clock: +100, +95 (raises), +100, +101", () -> {
            Snowflake g = new Snowflake(1, clock(E + 100, E + 95, E + 100, E + 101));
            long first = g.nextId();
            boolean raised = false;
            try { g.nextId(); } catch (ClockMovedBackwardsException e) { raised = true; }
            T.eq(raised, true);
            T.eq(List.of(tsSeq(first), tsSeq(g.nextId()), tsSeq(g.nextId())), List.of(List.of(100L, 0L), List.of(100L, 1L), List.of(101L, 0L)));
        });

        T.test("worker IDs outside 0..1023 are rejected", "new Snowflake(1024, ...)", () ->
            T.raises(IllegalArgumentException.class, () -> new Snowflake(1024, clock(E))));

        T.test("two workers in the same millisecond never collide", "workers 0 and 1, same clock reading", () -> {
            long a = new Snowflake(0, clock(E + 9)).nextId(), b = new Snowflake(1, clock(E + 9)).nextId();
            T.eq(a != b, true);
            T.eq(b - a, 1L << 12);
        });

        T.test("late timestamps give IDs above 2^53 that still round-trip", "clock = epoch + 2^40, worker 1023", () -> {
            long id = new Snowflake(1023, clock(E + (1L << 40))).nextId();
            T.eq(id > (1L << 53), true);
            T.eq(Snowflake.parse(id), new Parts(E + (1L << 40), 1023, 0));
        });

        T.test("a custom epoch shifts the timestamp field", "Discord's epoch 1420070400000 (2015-01-01), clock = epoch + 1000", () -> {
            long d = 1420070400000L;
            long id = new Snowflake(0, clock(d + 1000), d).nextId();
            T.eq(id, 1000L << 22);
            T.eq(Snowflake.parse(id, d).timestamp(), d + 1000);
        });

        T.test("a clock before the epoch is rejected", "clock = epoch - 1", () -> {
            Snowflake g = new Snowflake(0, clock(E - 1));
            T.raises(IllegalArgumentException.class, g::nextId);
        });

        T.summary();
    }
}
