import java.util.function.LongSupplier;

// In Java, IDs are long (63 bits used; the sign bit stays 0), the clock is a LongSupplier of Unix ms,
// out-of-range input throws IllegalArgumentException, and parse returns a Parts record.
// Layout, high bit to low: 1 sign (always 0) | 41 timestamp | 10 worker | 12 sequence.
record Parts(long timestamp, int workerId, int sequence) {}

class ClockMovedBackwardsException extends RuntimeException {
    ClockMovedBackwardsException(String message) { super(message); }
}

class Snowflake {
    static final long TWITTER_EPOCH = 1288834974657L; // 2010-11-04T01:42:54.657Z

    private final int workerId;
    private final LongSupplier now;
    private final long epoch;
    private long lastTs = -1;
    private int sequence = 0;

    Snowflake(int workerId, LongSupplier now) { this(workerId, now, TWITTER_EPOCH); }

    Snowflake(int workerId, LongSupplier now, long epoch) {
        // TODO: reject workerId outside 0..1023 with IllegalArgumentException
        this.workerId = workerId; this.now = now; this.epoch = epoch;
    }

    long nextId() {
        // TODO: read the clock once; throw ClockMovedBackwardsException if it is behind lastTs;
        // same millisecond -> bump the sequence, and on overflow spin until now moves on;
        // new millisecond -> sequence 0. Then shift the three fields into place (use long shifts).
        return 0;
    }

    static Parts parse(long id) { return parse(id, TWITTER_EPOCH); }

    static Parts parse(long id, long epoch) {
        // TODO: undo the shifts and masks
        return new Parts(0, 0, 0);
    }
}
