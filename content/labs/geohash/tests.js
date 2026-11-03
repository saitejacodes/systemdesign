const POINTS = [[57.64911, 10.40744], [42.605, -5.603], [-33.8688, 151.2093], [37.7749, -122.4194], [0, 0], [-89.5, 179.5]];

test("encodes the Wikipedia example (Jutland, Denmark)", "encode(57.64911, 10.40744, 11)", (m) => [m.encode(57.64911, 10.40744, 11), "u4pruydqqvj"]);

test("decodes 'ezs42' to its cell centre and half-sizes", "decode('ezs42')", (m) =>
  [m.decode("ezs42"), approx([42.60498046875, -5.60302734375, 0.02197265625, 0.02197265625], 1e-9)]);

test("a point inside that cell encodes back to 'ezs42'", "encode(42.605, -5.603, 5)", (m) => [m.encode(42.605, -5.603, 5), "ezs42"]);

test("one-character cells: origin, south-west corner, north-east corner", "encode(0,0,1), encode(-90,-180,1), encode(90,180,1)", (m) =>
  [[m.encode(0, 0, 1), m.encode(-90, -180, 1), m.encode(90, 180, 1)], ["s", "0", "z"]]);

test("a shorter geohash is a prefix of a longer one for the same point", "encode(p, k) == encode(p, 12).slice(0, k) for k = 1..12", (m) => {
  let ok = true;
  for (const [la, lo] of POINTS) for (let k = 1; k <= 12; k++) ok = ok && m.encode(la, lo, k) === m.encode(la, lo, 12).slice(0, k);
  return [ok, true];
});

test("decode then encode returns the same hash, and the point lies inside the cell", "6 points, precisions 1..12", (m) => {
  let bad = 0;
  for (const [la, lo] of POINTS) {
    for (let k = 1; k <= 12; k++) {
      const h = m.encode(la, lo, k);
      const [clat, clon, elat, elon] = m.decode(h);
      if (m.encode(clat, clon, k) !== h || Math.abs(la - clat) > elat || Math.abs(lo - clon) > elon) bad++;
    }
  }
  return [bad, 0];
});

test("the 8 neighbours of 'ezs42'", "neighbors('ezs42')", (m) =>
  [m.neighbors("ezs42"), { n: "ezs48", ne: "ezs49", e: "ezs43", se: "ezs41", s: "ezs40", sw: "ezefp", w: "ezefr", nw: "ezefx" }]);

test("east of the last column wraps across the antimeridian", "encode(0, 179.99, 3); neighbors('xbp')", (m) => {
  const nb = m.neighbors("xbp");
  return [[m.encode(0, 179.99, 3), nb.e, nb.ne, nb.se, m.encode(0, -179.99, 3)], ["xbp", "800", "802", "2pb", "800"]];
});

test("beyond the north pole there is no neighbour", "neighbors('up')", (m) => {
  const nb = m.neighbors("up");
  return [[nb.n, nb.ne, nb.nw, nb.e, nb.s, nb.w], [null, null, null, "ur", "un", "gz"]];
});

test("22 m apart, no common prefix: why proximity search checks neighbours", "encode(0.0001, 0, 6) vs encode(-0.0001, 0, 6)", (m) => {
  const a = m.encode(0.0001, 0, 6), b = m.encode(-0.0001, 0, 6);
  return [[a, b, m.neighbors(a).s], ["s00000", "kpbpbp", "kpbpbp"]];
});

test("a character outside the alphabet raises", "decode('ezs4a')  (a, i, l, o are not used)", (m) => [() => m.decode("ezs4a"), raises("RangeError")]);

test("an empty geohash raises", "decode('')", (m) => [() => m.decode(""), raises("RangeError")]);

test("out-of-range coordinates or precision raise", "encode(91, 0, 5), then encode(0, 0, 0)", (m) => [() => {
  try { m.encode(91, 0, 5); } catch (e) { if (e.name === "RangeError") m.encode(0, 0, 0); }
}, raises("RangeError")]);
