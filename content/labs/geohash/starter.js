const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"; // no a, i, l, o

function encode(lat, lon, precision = 9) {
  // TODO: throw RangeError for lat outside [-90, 90], lon outside [-180, 180] or precision outside 1..12.
  // Bisect [-180, 180] and [-90, 90] alternately, longitude first: value >= mid gives bit 1.
  // Every 5 bits become one BASE32 character.
  return "";
}

// Returns [lat, lon, latErr, lonErr]: the cell centre and its half-height and half-width.
function decode(geohash) {
  // TODO: throw RangeError on an empty string or a character not in BASE32;
  // replay the bits to shrink the two intervals, then return their midpoints and half-widths
  return [0, 0, 90, 180];
}

const DIRECTIONS = { n: [1, 0], ne: [1, 1], e: [0, 1], se: [-1, 1], s: [-1, 0], sw: [-1, -1], w: [0, -1], nw: [1, -1] };

// The 8 adjacent cells at the same precision. Longitude wraps at ±180; beyond a pole is null.
function neighbors(geohash) {
  // TODO: for each direction, step one cell from the decoded centre and encode the result
  return Object.fromEntries(Object.keys(DIRECTIONS).map((name) => [name, null]));
}

module.exports = { BASE32, encode, decode, neighbors };
