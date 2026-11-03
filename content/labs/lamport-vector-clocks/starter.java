import java.util.Arrays;

// In Java vectors are int[], merge and compare are static methods of Clocks,
// and mismatched lengths throw IllegalArgumentException.
class LamportClock {
    int time = 0;

    int tick() {
        // TODO: a local event increments the counter; return it
        return time;
    }

    int send() {
        // TODO: sending is an event: tick and return the timestamp to attach
        return time;
    }

    int receive(int t) {
        // TODO: counter = max(counter, t) + 1; return it
        return time;
    }
}

class Clocks {
    static int[] merge(int[] a, int[] b) {
        // TODO: element-wise max as a NEW array; IllegalArgumentException if the lengths differ
        return Arrays.copyOf(a, a.length);
    }

    static String compare(int[] a, int[] b) {
        // TODO: "equal", "before" (a <= b everywhere), "after", or "concurrent";
        // IllegalArgumentException if the lengths differ
        return "equal";
    }
}

class VectorClock {
    private final int pid;
    private int[] v;

    VectorClock(int pid, int n) { this.pid = pid; this.v = new int[n]; }

    int[] value() { return Arrays.copyOf(v, v.length); }

    int[] increment() {
        // TODO: bump only this process's entry; return a copy
        return value();
    }

    int[] send() {
        // TODO: an increment whose copy travels with the message
        return value();
    }

    int[] receive(int[] other) {
        // TODO: merge with the received vector, then increment; return a copy
        return value();
    }
}
