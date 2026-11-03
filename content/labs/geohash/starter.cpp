#include <map>
#include <stdexcept>
#include <string>
#include <vector>

// In C++ decode returns a vector {lat, lon, latErr, lonErr}, neighbors returns a std::map from "n", "ne", ...
// to a hash, with "" for a cell beyond a pole, and bad input throws std::invalid_argument.
const std::string BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"; // no a, i, l, o

std::string encode(double lat, double lon, int precision = 9) {
    // TODO: throw std::invalid_argument for lat outside [-90, 90], lon outside [-180, 180] or precision outside 1..12.
    // Bisect [-180, 180] and [-90, 90] alternately, longitude first: value >= mid gives bit 1.
    // Every 5 bits become one BASE32 character.
    return "";
}

std::vector<double> decode(const std::string& geohash) {
    // TODO: throw std::invalid_argument on an empty string or a character not in BASE32;
    // replay the bits to shrink the two intervals, then return their midpoints and half-widths
    return {0, 0, 90, 180};
}

std::map<std::string, std::string> neighbors(const std::string& geohash) {
    static const char* names[] = {"n", "ne", "e", "se", "s", "sw", "w", "nw"};
    // TODO: for each direction (n = +1 lat row, e = +1 lon column, ...), step one cell from the decoded centre
    // and encode the result at the same length; wrap longitude, use "" beyond a pole
    std::map<std::string, std::string> out;
    for (const char* name : names) out[name] = "";
    return out;
}
