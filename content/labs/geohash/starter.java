import java.util.*;

// In Java the functions are static methods of Geohash; decode returns double[] {lat, lon, latErr, lonErr},
// neighbors returns a Map from "n", "ne", ... to a hash (null beyond a pole), and bad input throws IllegalArgumentException.
class Geohash {
    static final String BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"; // no a, i, l, o
    static final String[] NAMES = {"n", "ne", "e", "se", "s", "sw", "w", "nw"};
    static final int[][] STEPS = {{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};

    static String encode(double lat, double lon, int precision) {
        // TODO: throw IllegalArgumentException for lat outside [-90, 90], lon outside [-180, 180] or precision outside 1..12.
        // Bisect [-180, 180] and [-90, 90] alternately, longitude first: value >= mid gives bit 1.
        // Every 5 bits become one BASE32 character.
        return "";
    }

    static double[] decode(String geohash) {
        // TODO: throw IllegalArgumentException on an empty string or a character not in BASE32;
        // replay the bits to shrink the two intervals, then return their midpoints and half-widths
        return new double[] {0, 0, 90, 180};
    }

    static Map<String, String> neighbors(String geohash) {
        // TODO: for each of NAMES / STEPS, step one cell from the decoded centre and encode the result
        Map<String, String> out = new LinkedHashMap<>();
        for (String name : NAMES) out.put(name, null);
        return out;
    }
}
