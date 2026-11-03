import java.util.function.LongSupplier;

// In Java, IDs are long (63 bits used; the sign bit stays 0), the clock is a LongSupplier of Unix ms,
// out-of-range input throws IllegalArgumentException, and parse returns a Parts record.
record Parts(long timestamp, int workerId, int sequence) {}

class ClockMovedBackwardsException extends RuntimeException {
    ClockMovedBackwardsException(String message) { super(message); }
}

class Snowflake {
    static final long TWITTER_EPOCH = 1288834974657L; // 2010-11-04T01:42:54.657Z
    static final int TIMESTAMP_BITS = 41, WORKER_BITS = 10, SEQUENCE_BITS = 12;
    static final int MAX_WORKER = (1 << WORKER_BITS) - 1;     // 1023
    static final int MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1; // 4095
    static final int WORKER_SHIFT = SEQUENCE_BITS, TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS;

    private final int workerId;
    private final LongSupplier now;
    private final long epoch;
    private long lastTs = -1;
    private int sequence = 0;

    Snowflake(int workerId, LongSupplier now) { this(workerId, now, TWITTER_EPOCH); }

    Snowflake(int workerId, LongSupplier now, long epoch) {
        if (workerId < 0 || workerId > MAX_WORKER) throw new IllegalArgumentException("workerId must be 0.." + MAX_WORKER);
        this.workerId = workerId; this.now = now; this.epoch = epoch;
    }

    long nextId() {
        long ts = now.getAsLong();
        if (ts < lastTs) {
            // Trusting the clock here could re-issue an ID we already handed out.
            throw new ClockMovedBackwardsException("clock moved back " + (lastTs - ts) + " ms");
        }
        if (ts == lastTs) {
            sequence = (sequence + 1) & MAX_SEQUENCE;
            if (sequence == 0) {
                // 4,096 IDs used this millisecond: spin until the clock moves on.
                while (ts <= lastTs) ts = now.getAsLong();
            }
        } else {
            sequence = 0;
        }
        long delta = ts - epoch;
        if (delta < 0 || delta >= (1L << TIMESTAMP_BITS)) throw new IllegalArgumentException("timestamp outside the 41-bit range of this epoch");
        lastTs = ts;
        return (delta << TIMESTAMP_SHIFT) | ((long) workerId << WORKER_SHIFT) | sequence;
    }

    static Parts parse(long id) { return parse(id, TWITTER_EPOCH); }

    static Parts parse(long id, long epoch) {
        return new Parts((id >>> TIMESTAMP_SHIFT) + epoch, (int) ((id >>> WORKER_SHIFT) & MAX_WORKER), (int) (id & MAX_SEQUENCE));
    }
}
