POINTS = [(57.64911, 10.40744), (42.605, -5.603), (-33.8688, 151.2093), (37.7749, -122.4194), (0.0, 0.0), (-89.5, 179.5)]


@test("encodes the Wikipedia example (Jutland, Denmark)", input="encode(57.64911, 10.40744, 11)")
def _(m):
    return m.encode(57.64911, 10.40744, 11), "u4pruydqqvj"


@test("decodes 'ezs42' to its cell centre and half-sizes", input="decode('ezs42')")
def _(m):
    return list(m.decode("ezs42")), approx([42.60498046875, -5.60302734375, 0.02197265625, 0.02197265625], 1e-9)


@test("a point inside that cell encodes back to 'ezs42'", input="encode(42.605, -5.603, 5)")
def _(m):
    return m.encode(42.605, -5.603, 5), "ezs42"


@test("one-character cells: origin, south-west corner, north-east corner", input="encode(0,0,1), encode(-90,-180,1), encode(90,180,1)")
def _(m):
    return [m.encode(0, 0, 1), m.encode(-90, -180, 1), m.encode(90, 180, 1)], ["s", "0", "z"]


@test("a shorter geohash is a prefix of a longer one for the same point", input="encode(p, k) == encode(p, 12)[:k] for k = 1..12")
def _(m):
    return all(m.encode(la, lo, k) == m.encode(la, lo, 12)[:k] for la, lo in POINTS for k in range(1, 13)), True


@test("decode then encode returns the same hash, and the point lies inside the cell", input="6 points, precisions 1..12")
def _(m):
    bad = 0
    for la, lo in POINTS:
        for k in range(1, 13):
            h = m.encode(la, lo, k)
            clat, clon, elat, elon = m.decode(h)
            if m.encode(clat, clon, k) != h or abs(la - clat) > elat or abs(lo - clon) > elon:
                bad += 1
    return bad, 0


@test("the 8 neighbours of 'ezs42'", input="neighbors('ezs42')")
def _(m):
    return m.neighbors("ezs42"), {"n": "ezs48", "ne": "ezs49", "e": "ezs43", "se": "ezs41", "s": "ezs40", "sw": "ezefp", "w": "ezefr", "nw": "ezefx"}


@test("east of the last column wraps across the antimeridian", input="encode(0, 179.99, 3); neighbors('xbp')")
def _(m):
    nb = m.neighbors("xbp")
    return [m.encode(0, 179.99, 3), nb["e"], nb["ne"], nb["se"], m.encode(0, -179.99, 3)], ["xbp", "800", "802", "2pb", "800"]


@test("beyond the north pole there is no neighbour", input="neighbors('up')")
def _(m):
    nb = m.neighbors("up")
    return [nb["n"], nb["ne"], nb["nw"], nb["e"], nb["s"], nb["w"]], [None, None, None, "ur", "un", "gz"]


@test("22 m apart, no common prefix: why proximity search checks neighbours", input="encode(0.0001, 0, 6) vs encode(-0.0001, 0, 6)")
def _(m):
    a, b = m.encode(0.0001, 0, 6), m.encode(-0.0001, 0, 6)
    return [a, b, m.neighbors(a)["s"]], ["s00000", "kpbpbp", "kpbpbp"]


@test("a character outside the alphabet raises", input="decode('ezs4a')  (a, i, l, o are not used)")
def _(m):
    return (lambda: m.decode("ezs4a")), raises(ValueError)


@test("an empty geohash raises", input="decode('')")
def _(m):
    return (lambda: m.decode("")), raises(ValueError)


@test("out-of-range coordinates or precision raise", input="encode(91, 0, 5), then encode(0, 0, 0)")
def _(m):
    def bad():
        try:
            m.encode(91, 0, 5)
        except ValueError:
            m.encode(0, 0, 0)
    return bad, raises(ValueError)
