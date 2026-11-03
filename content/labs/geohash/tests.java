import java.util.*;

public class LabTests {
    static final double[][] POINTS = {{57.64911, 10.40744}, {42.605, -5.603}, {-33.8688, 151.2093}, {37.7749, -122.4194}, {0, 0}, {-89.5, 179.5}};

    public static void main(String[] args) {
        T.test("encodes the Wikipedia example (Jutland, Denmark)", "encode(57.64911, 10.40744, 11)",
            () -> T.eq(Geohash.encode(57.64911, 10.40744, 11), "u4pruydqqvj"));

        T.test("decodes 'ezs42' to its cell centre and half-sizes", "decode(\"ezs42\")", () -> {
            double[] d = Geohash.decode("ezs42");
            double[] e = {42.60498046875, -5.60302734375, 0.02197265625, 0.02197265625};
            T.eq(d.length, 4);
            for (int i = 0; i < 4; i++) T.approx(d[i], e[i], 1e-9);
        });

        T.test("a point inside that cell encodes back to 'ezs42'", "encode(42.605, -5.603, 5)", () -> T.eq(Geohash.encode(42.605, -5.603, 5), "ezs42"));

        T.test("one-character cells: origin, south-west corner, north-east corner", "encode(0,0,1), encode(-90,-180,1), encode(90,180,1)",
            () -> T.eq(List.of(Geohash.encode(0, 0, 1), Geohash.encode(-90, -180, 1), Geohash.encode(90, 180, 1)), List.of("s", "0", "z")));

        T.test("a shorter geohash is a prefix of a longer one for the same point", "encode(p, k) == encode(p, 12).substring(0, k) for k = 1..12", () -> {
            boolean ok = true;
            for (double[] p : POINTS) for (int k = 1; k <= 12; k++) ok &= Geohash.encode(p[0], p[1], k).equals(Geohash.encode(p[0], p[1], 12).substring(0, k));
            T.eq(ok, true);
        });

        T.test("decode then encode returns the same hash, and the point lies inside the cell", "6 points, precisions 1..12", () -> {
            int bad = 0;
            for (double[] p : POINTS) for (int k = 1; k <= 12; k++) {
                String h = Geohash.encode(p[0], p[1], k);
                double[] d = Geohash.decode(h);
                if (!Geohash.encode(d[0], d[1], k).equals(h) || Math.abs(p[0] - d[0]) > d[2] || Math.abs(p[1] - d[1]) > d[3]) bad++;
            }
            T.eq(bad, 0);
        });

        T.test("the 8 neighbours of 'ezs42'", "neighbors(\"ezs42\")", () -> {
            Map<String, String> e = new HashMap<>();
            String[][] kv = {{"n", "ezs48"}, {"ne", "ezs49"}, {"e", "ezs43"}, {"se", "ezs41"}, {"s", "ezs40"}, {"sw", "ezefp"}, {"w", "ezefr"}, {"nw", "ezefx"}};
            for (String[] p : kv) e.put(p[0], p[1]);
            T.eq(Geohash.neighbors("ezs42"), e);
        });

        T.test("east of the last column wraps across the antimeridian", "encode(0, 179.99, 3); neighbors(\"xbp\")", () -> {
            Map<String, String> nb = Geohash.neighbors("xbp");
            T.eq(Arrays.asList(Geohash.encode(0, 179.99, 3), nb.get("e"), nb.get("ne"), nb.get("se"), Geohash.encode(0, -179.99, 3)),
                List.of("xbp", "800", "802", "2pb", "800"));
        });

        T.test("beyond the north pole there is no neighbour", "neighbors(\"up\")", () -> {
            Map<String, String> nb = Geohash.neighbors("up");
            T.eq(Arrays.asList(nb.get("n"), nb.get("ne"), nb.get("nw"), nb.get("e"), nb.get("s"), nb.get("w")),
                Arrays.asList(null, null, null, "ur", "un", "gz"));
            T.eq(nb.size(), 8);
        });

        T.test("22 m apart, no common prefix: why proximity search checks neighbours", "encode(0.0001, 0, 6) vs encode(-0.0001, 0, 6)", () -> {
            String a = Geohash.encode(0.0001, 0, 6), b = Geohash.encode(-0.0001, 0, 6);
            T.eq(List.of(a, b, String.valueOf(Geohash.neighbors(a).get("s"))), List.of("s00000", "kpbpbp", "kpbpbp"));
        });

        T.test("a character outside the alphabet raises", "decode(\"ezs4a\")  (a, i, l, o are not used)",
            () -> T.raises(IllegalArgumentException.class, () -> Geohash.decode("ezs4a")));

        T.test("an empty geohash raises", "decode(\"\")", () -> T.raises(IllegalArgumentException.class, () -> Geohash.decode("")));

        T.test("out-of-range coordinates or precision raise", "encode(91, 0, 5), then encode(0, 0, 0)", () -> {
            T.raises(IllegalArgumentException.class, () -> Geohash.encode(91, 0, 5));
            T.raises(IllegalArgumentException.class, () -> Geohash.encode(0, 0, 0));
        });

        T.summary();
    }
}
