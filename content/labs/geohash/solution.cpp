#include <map>
#include <stdexcept>
#include <string>
#include <vector>

// In C++ decode returns a vector {lat, lon, latErr, lonErr}, neighbors returns a std::map from "n", "ne", ...
// to a hash, with "" for a cell beyond a pole, and bad input throws std::invalid_argument.
const std::string BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"; // no a, i, l, o

std::string encode(double lat, double lon, int precision = 9) {
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180))
        throw std::invalid_argument("latitude must be in [-90, 90] and longitude in [-180, 180]");
    if (precision < 1 || precision > 12) throw std::invalid_argument("precision must be 1..12");
    double latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
    std::string out;
    int bits = 0, ch = 0;
    bool even = true; // even bit positions (0, 2, 4, ...) split longitude
    while ((int)out.size() < precision) {
        int bit;
        if (even) {
            double mid = (lonLo + lonHi) / 2;
            bit = lon >= mid; // upper half includes its lower edge, so 180 and 90 land in the last cell
            (bit ? lonLo : lonHi) = mid;
        } else {
            double mid = (latLo + latHi) / 2;
            bit = lat >= mid;
            (bit ? latLo : latHi) = mid;
        }
        ch = (ch << 1) | bit;
        even = !even;
        if (++bits == 5) { out += BASE32[ch]; bits = 0; ch = 0; }
    }
    return out;
}

std::vector<double> decode(const std::string& geohash) {
    if (geohash.empty()) throw std::invalid_argument("empty geohash");
    double latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
    bool even = true;
    for (char c : geohash) {
        auto v = BASE32.find(c);
        if (v == std::string::npos) throw std::invalid_argument(std::string("invalid geohash character ") + c);
        for (int shift = 4; shift >= 0; shift--) {
            int bit = (v >> shift) & 1;
            if (even) { double mid = (lonLo + lonHi) / 2; (bit ? lonLo : lonHi) = mid; }
            else { double mid = (latLo + latHi) / 2; (bit ? latLo : latHi) = mid; }
            even = !even;
        }
    }
    return {(latLo + latHi) / 2, (lonLo + lonHi) / 2, (latHi - latLo) / 2, (lonHi - lonLo) / 2};
}

std::map<std::string, std::string> neighbors(const std::string& geohash) {
    static const char* names[] = {"n", "ne", "e", "se", "s", "sw", "w", "nw"};
    static const int steps[8][2] = {{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};
    auto d = decode(geohash);
    std::map<std::string, std::string> out;
    for (int k = 0; k < 8; k++) {
        // Stepping one full cell from the centre lands on the centre of the neighbour, far from any edge.
        double nlat = d[0] + 2 * d[2] * steps[k][0], nlon = d[1] + 2 * d[3] * steps[k][1];
        if (!(nlat > -90 && nlat < 90)) { out[names[k]] = ""; continue; }
        if (nlon > 180) nlon -= 360; else if (nlon < -180) nlon += 360;
        out[names[k]] = encode(nlat, nlon, (int)geohash.size());
    }
    return out;
}
