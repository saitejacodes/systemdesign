import java.util.*;

// In Java the functions are static methods of Geohash; decode returns double[] {lat, lon, latErr, lonErr},
// neighbors returns a Map from "n", "ne", ... to a hash (null beyond a pole), and bad input throws IllegalArgumentException.
class Geohash {
    static final String BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"; // no a, i, l, o
    static final String[] NAMES = {"n", "ne", "e", "se", "s", "sw", "w", "nw"};
    static final int[][] STEPS = {{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};

    static String encode(double lat, double lon, int precision) {
        if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180))
            throw new IllegalArgumentException("latitude must be in [-90, 90] and longitude in [-180, 180]");
        if (precision < 1 || precision > 12) throw new IllegalArgumentException("precision must be 1..12");
        double latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
        StringBuilder out = new StringBuilder();
        int bits = 0, ch = 0;
        boolean even = true; // even bit positions (0, 2, 4, ...) split longitude
        while (out.length() < precision) {
            int bit;
            if (even) {
                double mid = (lonLo + lonHi) / 2;
                bit = lon >= mid ? 1 : 0; // upper half includes its lower edge, so 180 and 90 land in the last cell
                if (bit == 1) lonLo = mid; else lonHi = mid;
            } else {
                double mid = (latLo + latHi) / 2;
                bit = lat >= mid ? 1 : 0;
                if (bit == 1) latLo = mid; else latHi = mid;
            }
            ch = (ch << 1) | bit;
            even = !even;
            if (++bits == 5) { out.append(BASE32.charAt(ch)); bits = 0; ch = 0; }
        }
        return out.toString();
    }

    static double[] decode(String geohash) {
        if (geohash.isEmpty()) throw new IllegalArgumentException("empty geohash");
        double latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
        boolean even = true;
        for (char c : geohash.toCharArray()) {
            int v = BASE32.indexOf(c);
            if (v < 0) throw new IllegalArgumentException("invalid geohash character '" + c + "'");
            for (int shift = 4; shift >= 0; shift--) {
                int bit = (v >> shift) & 1;
                if (even) {
                    double mid = (lonLo + lonHi) / 2;
                    if (bit == 1) lonLo = mid; else lonHi = mid;
                } else {
                    double mid = (latLo + latHi) / 2;
                    if (bit == 1) latLo = mid; else latHi = mid;
                }
                even = !even;
            }
        }
        return new double[] {(latLo + latHi) / 2, (lonLo + lonHi) / 2, (latHi - latLo) / 2, (lonHi - lonLo) / 2};
    }

    static Map<String, String> neighbors(String geohash) {
        double[] d = decode(geohash);
        Map<String, String> out = new LinkedHashMap<>();
        for (int k = 0; k < 8; k++) {
            // Stepping one full cell from the centre lands on the centre of the neighbour, far from any edge.
            double nlat = d[0] + 2 * d[2] * STEPS[k][0], nlon = d[1] + 2 * d[3] * STEPS[k][1];
            if (!(nlat > -90 && nlat < 90)) { out.put(NAMES[k], null); continue; }
            if (nlon > 180) nlon -= 360; else if (nlon < -180) nlon += 360;
            out.put(NAMES[k], encode(nlat, nlon, geohash.length()));
        }
        return out;
    }
}
