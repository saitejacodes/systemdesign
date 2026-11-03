import java.util.Arrays;

// In Java vectors are int[], merge and compare are static methods of Clocks,
// and mismatched lengths throw IllegalArgumentException.
class LamportClock {
    int time = 0;

    /** A local event. */
    int tick() { return ++time; }

    /** Sending is an event too; the returned timestamp travels with the message. */
    int send() { return tick(); }

    /** Jump past the sender's timestamp so the receive is ordered after the send. */
    int receive(int t) { time = Math.max(time, t) + 1; return time; }
}

class Clocks {
    private static void check(int[] a, int[] b) {
        if (a.length != b.length) throw new IllegalArgumentException("vector lengths differ: " + a.length + " vs " + b.length);
    }

    /** Element-wise maximum: everything either side has seen. Inputs are not modified. */
    static int[] merge(int[] a, int[] b) {
        check(a, b);
        int[] out = new int[a.length];
        for (int i = 0; i < a.length; i++) out[i] = Math.max(a[i], b[i]);
        return out;
    }

    static String compare(int[] a, int[] b) {
        check(a, b);
        boolean aLeB = true, bLeA = true;
        for (int i = 0; i < a.length; i++) { aLeB &= a[i] <= b[i]; bLeA &= b[i] <= a[i]; }
        if (aLeB && bLeA) return "equal";
        if (aLeB) return "before"; // a happened before b
        if (bLeA) return "after";
        return "concurrent";       // each has seen something the other has not
    }
}

class VectorClock {
    private final int pid;
    private int[] v;

    VectorClock(int pid, int n) { this.pid = pid; this.v = new int[n]; }

    int[] value() { return Arrays.copyOf(v, v.length); } // a copy, so callers can't mutate our state

    /** A local event: bump only our own entry. */
    int[] increment() { v[pid]++; return value(); }

    int[] send() { return increment(); }

    int[] receive(int[] other) { v = Clocks.merge(v, other); return increment(); }
}
