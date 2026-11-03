#include <cmath>
#include <map>
#include <string>
#include <vector>

static const std::vector<std::vector<double>> POINTS({{57.64911, 10.40744}, {42.605, -5.603}, {-33.8688, 151.2093}, {37.7749, -122.4194}, {0, 0}, {-89.5, 179.5}});

int main() {
    using S = std::vector<std::string>;
    TEST("encodes the Wikipedia example (Jutland, Denmark)", "encode(57.64911, 10.40744, 11)", [] { EQ(encode(57.64911, 10.40744, 11), std::string("u4pruydqqvj")); });

    TEST("decodes 'ezs42' to its cell centre and half-sizes", "decode(\"ezs42\")", [] {
        auto d = decode("ezs42");
        EQ((int)d.size(), 4);
        APPROX(d[0], 42.60498046875, 1e-9); APPROX(d[1], -5.60302734375, 1e-9);
        APPROX(d[2], 0.02197265625, 1e-9); APPROX(d[3], 0.02197265625, 1e-9);
    });

    TEST("a point inside that cell encodes back to 'ezs42'", "encode(42.605, -5.603, 5)", [] { EQ(encode(42.605, -5.603, 5), std::string("ezs42")); });

    TEST("one-character cells: origin, south-west corner, north-east corner", "encode(0,0,1), encode(-90,-180,1), encode(90,180,1)", [] {
        EQ((S{encode(0, 0, 1), encode(-90, -180, 1), encode(90, 180, 1)}), (S{"s", "0", "z"}));
    });

    TEST("a shorter geohash is a prefix of a longer one for the same point", "encode(p, k) == encode(p, 12).substr(0, k) for k = 1..12", [] {
        bool ok = true;
        for (auto& p : POINTS) for (int k = 1; k <= 12; k++) ok = ok && encode(p[0], p[1], k) == encode(p[0], p[1], 12).substr(0, k);
        EQ(ok, true);
    });

    TEST("decode then encode returns the same hash, and the point lies inside the cell", "6 points, precisions 1..12", [] {
        int bad = 0;
        for (auto& p : POINTS) for (int k = 1; k <= 12; k++) {
            std::string h = encode(p[0], p[1], k);
            auto d = decode(h);
            if (encode(d[0], d[1], k) != h || std::fabs(p[0] - d[0]) > d[2] || std::fabs(p[1] - d[1]) > d[3]) bad++;
        }
        EQ(bad, 0);
    });

    TEST("the 8 neighbours of 'ezs42'", "neighbors(\"ezs42\")", [] {
        auto nb = neighbors("ezs42");
        EQ((S{nb["n"], nb["ne"], nb["e"], nb["se"], nb["s"], nb["sw"], nb["w"], nb["nw"]}),
           (S{"ezs48", "ezs49", "ezs43", "ezs41", "ezs40", "ezefp", "ezefr", "ezefx"}));
    });

    TEST("east of the last column wraps across the antimeridian", "encode(0, 179.99, 3); neighbors(\"xbp\")", [] {
        auto nb = neighbors("xbp");
        EQ((S{encode(0, 179.99, 3), nb["e"], nb["ne"], nb["se"], encode(0, -179.99, 3)}), (S{"xbp", "800", "802", "2pb", "800"}));
    });

    TEST("beyond the north pole there is no neighbour (empty string)", "neighbors(\"up\")", [] {
        auto nb = neighbors("up");
        EQ((S{nb["n"], nb["ne"], nb["nw"], nb["e"], nb["s"], nb["w"]}), (S{"", "", "", "ur", "un", "gz"}));
        EQ((int)nb.size(), 8);
    });

    TEST("22 m apart, no common prefix: why proximity search checks neighbours", "encode(0.0001, 0, 6) vs encode(-0.0001, 0, 6)", [] {
        std::string a = encode(0.0001, 0, 6);
        std::string b = encode(-0.0001, 0, 6);
        EQ((S{a, b, neighbors(a)["s"]}), (S{"s00000", "kpbpbp", "kpbpbp"}));
    });

    TEST("a character outside the alphabet raises", "decode(\"ezs4a\")  (a, i, l, o are not used)", [] {
        RAISES(std::invalid_argument, [] { decode("ezs4a"); });
    });

    TEST("an empty geohash raises", "decode(\"\")", [] { RAISES(std::invalid_argument, [] { decode(""); }); });

    TEST("out-of-range coordinates or precision raise", "encode(91, 0, 5), then encode(0, 0, 0)", [] {
        RAISES(std::invalid_argument, [] { encode(91, 0, 5); });
        RAISES(std::invalid_argument, [] { encode(0, 0, 0); });
    });

    return lab::summary();
}
