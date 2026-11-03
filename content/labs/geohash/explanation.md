A geohash turns a latitude and longitude into a short string such that nearby points usually share a long prefix. Gustavo Niemeyer published it in 2008 with the geohash.org service. It matters for system design because a prefix is something an ordinary index already handles: in a B-tree, `WHERE geohash LIKE 'ezs4%'` is a single range scan, so "drivers near this rider" becomes a lookup on a sorted column instead of a distance calculation over every row. Redis's `GEOADD` stores each member's 52-bit interleaved geohash as its sorted-set score for exactly this reason, and `GEOHASH` returns the standard 11-character string.

**Encoding is repeated bisection.** Start with longitude in [−180, 180] and latitude in [−90, 90]. For each bit, split one interval at its midpoint: write 1 and keep the upper half if the value is ≥ the midpoint, otherwise write 0 and keep the lower half. Bits alternate **longitude first**, then latitude, then longitude. Every 5 bits index the base32 alphabet `0123456789bcdefghjkmnpqrstuvwxyz` (no `a`, `i`, `l` or `o`). Interleaving the two coordinates' bits traces a Z-order (Morton) curve, which is why a shared prefix means a shared enclosing cell.

**Decoding reverses it.** The characters give back the bits; the final intervals are the cell. Return its centre and the half-height and half-width as the error. A 5-character hash has 25 bits: 13 for longitude (cell width 360 / 2¹³ ≈ 0.0439°) and 12 for latitude (180 / 2¹² ≈ 0.0439°), about 4.9 km × 4.9 km at the equator. Six characters give about 1.2 km × 0.61 km, seven about 153 m × 153 m. East-west sizes shrink with the cosine of the latitude.

**The edge problem.** Two points 22 m apart on either side of the equator, (0.0001, 0) and (−0.0001, 0), encode to `s00000` and `kpbpbp`: no common prefix at all. A proximity search therefore never queries one cell; it picks a precision whose cells are at least as large as the search radius and queries the cell **plus its 8 neighbours**, then filters the candidates by true distance.

## Your task

Implement three functions:

- `encode(lat, lon, precision=9)` returns a geohash of `precision` characters. Raise `ValueError` (JavaScript: `RangeError`) if `lat` is outside [−90, 90], `lon` is outside [−180, 180], or `precision` is not 1 to 12. Ties go to the upper half, so `lat = 90` and `lon = 180` land in the last row and column: `encode(90, 180, 1) == "z"`.
- `decode(geohash)` returns `(lat, lon, lat_err, lon_err)` (JavaScript: an array of four numbers): the cell centre and its half-sizes. Raise on an empty string or any character not in the alphabet. Only lowercase is accepted.
- `neighbors(geohash)` returns a dict (JavaScript: an object) with keys `n, ne, e, se, s, sw, w, nw`, each a geohash of the same length. **Longitude wraps**: east of the last column at +180° is the first column at −180°. **Latitude does not**: a neighbour that would lie beyond a pole is `None` / `null`.

The tests use known vectors: `encode(57.64911, 10.40744, 11) == "u4pruydqqvj"` (the example from Wikipedia's Geohash article) and `decode("ezs42")` ≈ (42.605, −5.603). In Java the functions are static methods of `Geohash`; in C++ a cell beyond a pole is `""`. Both return the four decode values as an array or vector and throw `IllegalArgumentException` / `std::invalid_argument`.

## Going further

Geohash cells are rectangles that distort toward the poles and its curve jumps at cell boundaries, which is why the 8-neighbour query exists. Google's S2 library projects the sphere onto a cube and orders cells along a Hilbert curve, which has better locality than Z-order; Uber's H3 uses hexagons, whose six neighbours are all the same distance away, which suits ride-sharing supply and demand grids. Quadtrees adapt cell size to density, splitting crowded city cells further than empty ocean. For a ride-sharing dispatcher the usual pattern is: keep each driver's current geohash in an in-memory index, query the rider's cell and its neighbours at a precision chosen from the search radius, then rank the few candidates by road distance or ETA rather than straight-line distance.
