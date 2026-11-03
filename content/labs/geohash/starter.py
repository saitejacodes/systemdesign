BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"  # no a, i, l, o


def encode(lat: float, lon: float, precision: int = 9) -> str:
    # TODO: raise ValueError for lat outside [-90, 90], lon outside [-180, 180] or precision outside 1..12.
    # Bisect [-180, 180] and [-90, 90] alternately, longitude first: value >= mid gives bit 1.
    # Every 5 bits become one BASE32 character.
    return ""


def decode(geohash: str):
    """Return (lat, lon, lat_err, lon_err): the cell centre and its half-height and half-width."""
    # TODO: raise ValueError on an empty string or a character not in BASE32;
    # replay the bits to shrink the two intervals, then return their midpoints and half-widths
    return 0.0, 0.0, 90.0, 180.0


DIRECTIONS = {"n": (1, 0), "ne": (1, 1), "e": (0, 1), "se": (-1, 1), "s": (-1, 0), "sw": (-1, -1), "w": (0, -1), "nw": (1, -1)}


def neighbors(geohash: str):
    """The 8 adjacent cells at the same precision. Longitude wraps at ±180; beyond a pole is None."""
    # TODO: for each direction, step one cell from the decoded centre and encode the result
    return {name: None for name in DIRECTIONS}
