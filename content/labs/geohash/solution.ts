export const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"; // no a, i, l, o

export type Direction = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type Neighbors = Record<Direction, string | null>;

export function encode(lat: number, lon: number, precision = 9): string {
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) throw new RangeError("latitude must be in [-90, 90] and longitude in [-180, 180]");
  if (!(Number.isInteger(precision) && precision >= 1 && precision <= 12)) throw new RangeError("precision must be 1..12");
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
  let out = "", bits = 0, ch = 0, even = true; // even bit positions (0, 2, 4, ...) split longitude
  while (out.length < precision) {
    let bit: number;
    if (even) {
      const mid = (lonLo + lonHi) / 2;
      bit = lon >= mid ? 1 : 0; // upper half includes its lower edge, so 180 and 90 land in the last cell
      if (bit) lonLo = mid; else lonHi = mid;
    } else {
      const mid = (latLo + latHi) / 2;
      bit = lat >= mid ? 1 : 0;
      if (bit) latLo = mid; else latHi = mid;
    }
    ch = (ch << 1) | bit;
    even = !even;
    if (++bits === 5) { out += BASE32[ch]; bits = 0; ch = 0; }
  }
  return out;
}

// Returns [lat, lon, latErr, lonErr]: the cell centre and its half-height and half-width.
export function decode(geohash: string): [number, number, number, number] {
  if (!geohash) throw new RangeError("empty geohash");
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180, even = true;
  for (const c of geohash) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new RangeError(`invalid geohash character ${JSON.stringify(c)}`);
    for (let shift = 4; shift >= 0; shift--) {
      const bit = (v >> shift) & 1;
      if (even) {
        const mid = (lonLo + lonHi) / 2;
        if (bit) lonLo = mid; else lonHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (bit) latLo = mid; else latHi = mid;
      }
      even = !even;
    }
  }
  return [(latLo + latHi) / 2, (lonLo + lonHi) / 2, (latHi - latLo) / 2, (lonHi - lonLo) / 2];
}

const DIRECTIONS: Record<Direction, [number, number]> = { n: [1, 0], ne: [1, 1], e: [0, 1], se: [-1, 1], s: [-1, 0], sw: [-1, -1], w: [0, -1], nw: [1, -1] };

// The 8 adjacent cells at the same precision. Longitude wraps at ±180; beyond a pole is null.
export function neighbors(geohash: string): Neighbors {
  const [lat, lon, latErr, lonErr] = decode(geohash);
  const out = {} as Neighbors;
  for (const name of Object.keys(DIRECTIONS) as Direction[]) {
    const [dlat, dlon] = DIRECTIONS[name];
    // Stepping one full cell from the centre lands on the centre of the neighbour, far from any edge.
    const nlat = lat + 2 * latErr * dlat;
    let nlon = lon + 2 * lonErr * dlon;
    if (!(nlat > -90 && nlat < 90)) { out[name] = null; continue; }
    if (nlon > 180) nlon -= 360; else if (nlon < -180) nlon += 360;
    out[name] = encode(nlat, nlon, geohash.length);
  }
  return out;
}
