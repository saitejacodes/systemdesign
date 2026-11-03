#include <memory>
#include <string>
#include <utility>
#include <vector>

// A settable clock shared between the test and the bucket.
struct Clock {
    std::shared_ptr<double> t = std::make_shared<double>(0.0);
    double operator()() const { return *t; }
};

static std::vector<double> times(const std::vector<Departure>& ds) {
    std::vector<double> out;
    for (const auto& d : ds) out.push_back(d.first);
    return out;
}

int main() {
    using B = std::vector<bool>;
    using D = std::vector<double>;
    using Out = std::vector<Departure>;
    TEST("an invalid capacity or leak rate is rejected", "LeakyBucket(0, 1, now), then LeakyBucket(1, 0, now)", ([] {
        RAISES(std::invalid_argument, [] { LeakyBucket b(0, 1, [] { return 0.0; }); });
        RAISES(std::invalid_argument, [] { LeakyBucket b(1, 0, [] { return 0.0; }); });
    }));

    TEST("a burst fills the bucket, then overflow is dropped", "cap 3, rate 1/s: 5 offers at t = 0", ([] {
        Clock c;
        LeakyBucket b(3, 1, c);
        B got;
        for (int i = 0; i < 5; i++) got.push_back(b.offer("r" + std::to_string(i)));
        EQ(got, (B{true, true, true, false, false}));
        EQ(b.size(), 3);
    }));

    TEST("no burst comes out: departures are spaced 1 / rate apart", "cap 3, rate 2/s: offer a, b, c at t = 0; drain at t = 10", ([] {
        Clock c;
        LeakyBucket b(3, 2, c);
        for (const char* r : {"a", "b", "c"}) b.offer(r);
        *c.t = 10;
        EQ(b.drain(), (Out{{0.5, "a"}, {1.0, "b"}, {1.5, "c"}}));
    }));

    TEST("the queue drains at a steady rate", "cap 3, rate 2/s, 3 queued at t = 0: size at t = 0.25, 0.5, 1.0, 1.5", ([] {
        Clock c;
        LeakyBucket b(3, 2, c);
        for (const char* r : {"a", "b", "c"}) b.offer(r);
        std::vector<int> sizes;
        for (double t : {0.25, 0.5, 1.0, 1.5}) { *c.t = t; sizes.push_back(b.size()); }
        EQ(sizes, (std::vector<int>{3, 2, 1, 0}));
    }));

    TEST("once one request leaks out there is room for exactly one more", "cap 2, rate 1/s: a, b at t = 0; c at t = 0.5; c at t = 1", ([] {
        Clock c;
        LeakyBucket b(2, 1, c);
        B got;
        got.push_back(b.offer("a")); got.push_back(b.offer("b"));
        *c.t = 0.5; got.push_back(b.offer("c"));
        *c.t = 1.0; got.push_back(b.offer("c")); got.push_back(b.offer("d"));
        *c.t = 10;
        EQ(got, (B{true, true, false, true, false}));
        EQ(times(b.drain()), (D{1.0, 2.0, 3.0}));
    }));

    TEST("an idle period empties the bucket and it accepts a full burst again", "cap 3, rate 1/s: 4 offers at t = 0, 4 more at t = 10", ([] {
        Clock c;
        LeakyBucket b(3, 1, c);
        B first, second;
        for (int i = 0; i < 4; i++) first.push_back(b.offer("r"));
        *c.t = 10;
        int empty = b.size();
        for (int i = 0; i < 4; i++) second.push_back(b.offer("r"));
        EQ(first, (B{true, true, true, false}));
        EQ(empty, 0);
        EQ(second, (B{true, true, true, false}));
    }));

    TEST("a request into an idle bucket leaves one interval after it arrives", "cap 2, rate 4/s: offer x at t = 5; drain at t = 6", ([] {
        Clock c;
        *c.t = 5;
        LeakyBucket b(2, 4, c);
        b.offer("x");
        *c.t = 6;
        EQ(b.drain(), (Out{{5.25, "x"}}));
    }));

    TEST("arrivals exactly at the leak rate are never dropped, even with capacity 1", "cap 1, rate 2/s: 100 offers, one every 0.5 s", ([] {
        Clock c;
        LeakyBucket b(1, 2, c);
        int ok = 0;
        for (int i = 0; i < 100; i++) { *c.t = i * 0.5; if (b.offer("r")) ok++; }
        EQ(ok, 100);
    }));

    TEST("arrivals 4x faster than the rate: accepted = drained so far + capacity", "cap 2, rate 1/s: 40 offers, one every 0.25 s; drain at t = 100", ([] {
        Clock c;
        LeakyBucket b(2, 1, c);
        int ok = 0;
        for (int i = 0; i < 40; i++) { *c.t = i * 0.25; if (b.offer("r")) ok++; }
        *c.t = 100;
        EQ(ok, 11);
        EQ(times(b.drain()), (D{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}));
    }));

    TEST("drain returns each request once, in arrival order", "cap 4, rate 1/s: offer 1..4; drain at t = 2.5 and again", ([] {
        Clock c;
        LeakyBucket b(4, 1, c);
        for (const char* r : {"1", "2", "3", "4"}) b.offer(r);
        *c.t = 2.5;
        std::vector<std::string> first;
        for (const auto& d : b.drain()) first.push_back(d.second);
        EQ(first, (std::vector<std::string>{"1", "2"}));
        EQ(b.drain().size(), (size_t)0);
        EQ(b.size(), 2);
    }));

    TEST("a clock stepping backwards neither leaks nor crashes", "cap 2, rate 1/s: offer a at t = 5; clock goes to t = 1; then t = 6.5", ([] {
        Clock c;
        *c.t = 5;
        LeakyBucket b(2, 1, c);
        b.offer("a");
        *c.t = 1;
        EQ(b.size(), 1);
        EQ(b.drain().size(), (size_t)0);
        EQ(b.offer("b"), true);
        *c.t = 6.5;
        EQ(b.drain(), (Out{{6.0, "a"}}));
    }));

    TEST("capacity 1 holds a single request", "cap 1, rate 1/s: 2 offers at t = 0", ([] {
        Clock c;
        LeakyBucket b(1, 1, c);
        bool first = b.offer("a");
        bool second = b.offer("b");
        EQ((B{first, second}), (B{true, false}));
        EQ(b.size(), 1);
    }));

    TEST("100,000 offers at twice the rate stay fast", "cap 100, rate 1024/s, one offer every 1/2048 s", ([] {
        Clock c;
        LeakyBucket b(100, 1024, c);
        int ok = 0;
        for (int i = 0; i < 100000; i++) { *c.t = i / 2048.0; if (b.offer("r")) ok++; }
        EQ(ok, 50099);
        EQ(b.size(), 100);
    }));

    return lab::summary();
}
