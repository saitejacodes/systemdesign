BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"  # no a, i, l, o
INDEX = {c: i for i, c in enumerate(BASE32)}


def encode(lat: float, lon: float, precision: int = 9) -> str:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("latitude must be in [-90, 90] and longitude in [-180, 180]")
    if not (1 <= precision <= 12):
        raise ValueError("precision must be 1..12")
    lat_lo, lat_hi, lon_lo, lon_hi = -90.0, 90.0, -180.0, 180.0
    out, bits, ch, even = [], 0, 0, True  # even bit positions (0, 2, 4, ...) split longitude
    while len(out) < precision:
        if even:
            mid = (lon_lo + lon_hi) / 2
            bit = lon >= mid  # upper half includes its lower edge, so 180 and 90 land in the last cell
            lon_lo, lon_hi = (mid, lon_hi) if bit else (lon_lo, mid)
        else:
            mid = (lat_lo + lat_hi) / 2
            bit = lat >= mid
            lat_lo, lat_hi = (mid, lat_hi) if bit else (lat_lo, mid)
        ch = (ch << 1) | bit
        even, bits = not even, bits + 1
        if bits == 5:
            out.append(BASE32[ch])
            bits = ch = 0
    return "".join(out)


def decode(geohash: str):
    """Return (lat, lon, lat_err, lon_err): the cell centre and its half-height and half-width."""
    if not geohash:
        raise ValueError("empty geohash")
    lat_lo, lat_hi, lon_lo, lon_hi = -90.0, 90.0, -180.0, 180.0
    even = True
    for c in geohash:
        if c not in INDEX:
            raise ValueError(f"invalid geohash character {c!r}")
        v = INDEX[c]
        for shift in range(4, -1, -1):
            bit = (v >> shift) & 1
            if even:
                mid = (lon_lo + lon_hi) / 2
                lon_lo, lon_hi = (mid, lon_hi) if bit else (lon_lo, mid)
            else:
                mid = (lat_lo + lat_hi) / 2
                lat_lo, lat_hi = (mid, lat_hi) if bit else (lat_lo, mid)
            even = not even
    return (lat_lo + lat_hi) / 2, (lon_lo + lon_hi) / 2, (lat_hi - lat_lo) / 2, (lon_hi - lon_lo) / 2


DIRECTIONS = {"n": (1, 0), "ne": (1, 1), "e": (0, 1), "se": (-1, 1), "s": (-1, 0), "sw": (-1, -1), "w": (0, -1), "nw": (1, -1)}


def neighbors(geohash: str):
    """The 8 adjacent cells at the same precision. Longitude wraps at ±180; beyond a pole is None."""
    lat, lon, lat_err, lon_err = decode(geohash)
    out = {}
    for name, (dlat, dlon) in DIRECTIONS.items():
        # Stepping one full cell from the centre lands on the centre of the neighbour, far from any edge.
        nlat, nlon = lat + 2 * lat_err * dlat, lon + 2 * lon_err * dlon
        if not -90 < nlat < 90:
            out[name] = None
            continue
        if nlon > 180:
            nlon -= 360
        elif nlon < -180:
            nlon += 360
        out[name] = encode(nlat, nlon, len(geohash))
    return out
