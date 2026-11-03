import java.util.*;

public class LabTests {
    static BloomFilter filled(long n, double p, int count) {
        BloomFilter b = new BloomFilter(n, p);
        for (int i = 0; i < count; i++) b.add("item-" + i);
        return b;
    }

    static double fpRate(BloomFilter b) {
        int c = 0;
        for (int i = 0; i < 10000; i++) if (b.mightContain("probe-" + i)) c++;
        return c / 10000.0;
    }

    public static void main(String[] args) {
        T.test("sizing: n=1,000, p=1% gives m=9,586 bits, k=7", "optimalParams(1000, 0.01)", () ->
            T.eq(BloomFilter.optimalParams(1000, 0.01), new long[] {9586, 7}));

        T.test("sizing from the lesson: 100M IDs at 0.1% is about 14.4 bits per ID, k=10", "optimalParams(100_000_000, 0.001)", () -> {
            long[] mk = BloomFilter.optimalParams(100_000_000L, 0.001);
            T.eq(mk[1], 10L);
            T.approx(mk[0] / 1e8, 14.38, 0.005);
        });

        T.test("k is never 0: p=0.5 gives a single hash", "optimalParams(1000, 0.5)", () ->
            T.eq(BloomFilter.optimalParams(1000, 0.5), new long[] {1443, 1}));

        T.test("an empty filter contains nothing", "new BloomFilter(1000, 0.01); mightContain x 1,000", () -> {
            BloomFilter b = new BloomFilter(1000, 0.01);
            boolean any = false;
            for (int i = 0; i < 1000; i++) any |= b.mightContain("item-" + i);
            T.eq(any, false);
        });

        T.test("indexes use double hashing: (h1 + i*h2) mod m", "indexes('hello') for n=1000, p=0.01", () -> {
            BloomFilter b = new BloomFilter(1000, 0.01);
            long h1 = Hashing.fmix32(Hashing.fnv1a32("hello", 0x811C9DC5L)), h2 = Hashing.fmix32(Hashing.fnv1a32("hello", 0x01000193L));
            long[] want = new long[7];
            for (int i = 0; i < 7; i++) want[i] = (h1 + i * h2) % 9586;
            T.eq(b.indexes("hello"), want);
        });

        T.test("no false negatives: every added item is found", "n=2000, p=0.01; add 2,000 items", () -> {
            BloomFilter b = filled(2000, 0.01, 2000);
            boolean all = true;
            for (int i = 0; i < 2000; i++) all &= b.mightContain("item-" + i);
            T.eq(all, true);
        });

        T.test("the measured false-positive rate is near the target", "n=2000, p=0.01; 10,000 non-member probes", () ->
            T.approx(fpRate(filled(2000, 0.01, 2000)), 0.01, 0.004));

        T.test("at design load, the formula predicts p", "n=1000, p=0.01; expectedFpRate(1000)", () ->
            T.approx(new BloomFilter(1000, 0.01).expectedFpRate(1000), 0.01, 0.0005));

        T.test("overfilled 4x, false positives explode, as the formula predicts", "n=2000, p=0.01; add 8,000 items", () -> {
            BloomFilter b = filled(2000, 0.01, 8000);
            double measured = fpRate(b), predicted = b.expectedFpRate(8000);
            T.eq(List.of(measured > 0.5, Math.abs(measured - predicted) < 0.05), List.of(true, true));
        });

        T.test("non-ASCII items hash their UTF-8 bytes", "fnv1a32('café'); add 'café'", () -> {
            BloomFilter b = new BloomFilter(100, 0.01);
            b.add("café");
            T.eq(List.of(Hashing.fnv1a32("café", Hashing.FNV_OFFSET), b.mightContain("café"), !Arrays.equals(b.indexes("café"), b.indexes("cafe"))),
                 List.of(0xa82b5049L, true, true));
        });

        T.test("p = 1 throws IllegalArgumentException", "new BloomFilter(1000, 1.0)", () ->
            T.raises(IllegalArgumentException.class, () -> new BloomFilter(1000, 1.0)));

        T.test("n = 0 throws IllegalArgumentException", "new BloomFilter(0, 0.01)", () ->
            T.raises(IllegalArgumentException.class, () -> new BloomFilter(0, 0.01)));

        T.summary();
    }
}
