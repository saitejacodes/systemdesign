#include <cstdint>
#include <functional>
#include <memory>
#include <stdexcept>
#include <vector>

using V64 = std::vector<int64_t>;
constexpr int64_t E = 1288834974657LL; // Twitter's epoch (the default)

// A fake clock that returns each value in turn, then repeats the last one.
std::function<int64_t()> clock(V64 vals) {
    auto i = std::make_shared<size_t>(0);
    return [vals, i] { int64_t v = vals[std::min(*i, vals.size() - 1)]; ++*i; return v; };
}

V64 fields(const Parts& p) { return {p.timestamp, p.workerId, p.sequence}; }
V64 tsSeq(int64_t id) { Parts p = Snowflake::parse(id); return {p.timestamp - E, p.sequence}; }
bool increasing(const V64& ids) {
    for (size_t i = 1; i < ids.size(); i++) if (ids[i - 1] >= ids[i]) return false;
    return true;
}

int main() {
    TEST("bit layout: timestamp << 22 | worker << 12 | sequence", "worker 1, clock = epoch + 1 ms", ([] {
        Snowflake g(1, clock({E + 1}));
        EQ(g.nextId(), (int64_t{1} << 22) | (int64_t{1} << 12));
    }));

    TEST("parse recovers timestamp, worker and sequence", "worker 513, clock = epoch + 123456789", ([] {
        Snowflake g(513, clock({E + 123456789}));
        EQ(fields(Snowflake::parse(g.nextId())), (V64{E + 123456789, 513, 0}));
    }));

    TEST("IDs in the same millisecond bump the sequence", "3 IDs, clock fixed at epoch + 50", ([] {
        Snowflake g(7, clock({E + 50}));
        int64_t a = g.nextId(), b = g.nextId(), c = g.nextId();
        EQ((V64{Snowflake::parse(a).sequence, Snowflake::parse(b).sequence, Snowflake::parse(c).sequence}), (V64{0, 1, 2}));
        EQ(c - a, int64_t{2});
    }));

    TEST("a new millisecond resets the sequence to 0", "clock: epoch+50, +50, +51", ([] {
        Snowflake g(7, clock({E + 50, E + 50, E + 51}));
        int64_t a = g.nextId(), b = g.nextId(), c = g.nextId();
        EQ((std::vector<V64>{tsSeq(a), tsSeq(b), tsSeq(c)}), (std::vector<V64>{{50, 0}, {50, 1}, {51, 0}}));
    }));

    TEST("10,000 IDs are unique and strictly increasing", "clock advances 1 ms every 3 reads", ([] {
        auto reads = std::make_shared<int64_t>(0);
        Snowflake g(42, [reads] { return E + (++*reads) / 3; });
        V64 ids;
        for (int i = 0; i < 10000; i++) ids.push_back(g.nextId());
        EQ(increasing(ids), true);
    }));

    TEST("sequence overflow waits for the next millisecond", "clock stuck at T for 5,000 reads, then T+1; 4,097 IDs", ([] {
        auto reads = std::make_shared<int64_t>(0);
        const int64_t t = E + 1000;
        Snowflake g(3, [reads, t] { return ++*reads <= 5000 ? t : t + 1; });
        V64 ids;
        for (int i = 0; i < 4097; i++) ids.push_back(g.nextId());
        EQ(fields(Snowflake::parse(ids[4095])), (V64{t, 3, 4095}));
        EQ(fields(Snowflake::parse(ids[4096])), (V64{t + 1, 3, 0}));
        EQ(increasing(ids), true);
    }));

    TEST("a clock that moves backwards raises ClockMovedBackwards", "clock: epoch+100, then epoch+99", ([] {
        Snowflake g(1, clock({E + 100, E + 99}));
        g.nextId();
        RAISES(ClockMovedBackwards, [&] { g.nextId(); });
    }));

    TEST("after the clock catches up, IDs continue without a duplicate", "clock: +100, +95 (raises), +100, +101", ([] {
        Snowflake g(1, clock({E + 100, E + 95, E + 100, E + 101}));
        int64_t first = g.nextId();
        bool raised = false;
        try { g.nextId(); } catch (const ClockMovedBackwards&) { raised = true; }
        EQ(raised, true);
        int64_t b = g.nextId(), c = g.nextId();
        EQ((std::vector<V64>{tsSeq(first), tsSeq(b), tsSeq(c)}), (std::vector<V64>{{100, 0}, {100, 1}, {101, 0}}));
    }));

    TEST("worker IDs outside 0..1023 are rejected", "Snowflake(1024, ...)", ([] {
        RAISES(std::invalid_argument, [] { Snowflake g(1024, clock({E})); });
    }));

    TEST("two workers in the same millisecond never collide", "workers 0 and 1, same clock reading", ([] {
        Snowflake a(0, clock({E + 9})), b(1, clock({E + 9}));
        int64_t ia = a.nextId(), ib = b.nextId();
        EQ(ia != ib, true);
        EQ(ib - ia, int64_t{1} << 12);
    }));

    TEST("late timestamps give IDs above 2^53 that still round-trip", "clock = epoch + 2^40, worker 1023", ([] {
        Snowflake g(1023, clock({E + (int64_t{1} << 40)}));
        int64_t id = g.nextId();
        EQ(id > (int64_t{1} << 53), true);
        EQ(fields(Snowflake::parse(id)), (V64{E + (int64_t{1} << 40), 1023, 0}));
    }));

    TEST("a custom epoch shifts the timestamp field", "Discord's epoch 1420070400000 (2015-01-01), clock = epoch + 1000", ([] {
        const int64_t d = 1420070400000LL;
        Snowflake g(0, clock({d + 1000}), d);
        int64_t id = g.nextId();
        EQ(id, int64_t{1000} << 22);
        EQ(Snowflake::parse(id, d).timestamp, d + 1000);
    }));

    TEST("a clock before the epoch is rejected", "clock = epoch - 1", ([] {
        Snowflake g(0, clock({E - 1}));
        RAISES(std::invalid_argument, [&] { g.nextId(); });
    }));

    return lab::summary();
}
