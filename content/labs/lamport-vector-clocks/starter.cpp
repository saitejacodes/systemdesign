#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>

// In C++ vectors are std::vector<int>, compare returns a std::string,
// and mismatched lengths throw std::invalid_argument.
using Vec = std::vector<int>;

class LamportClock {
public:
    int time = 0;

    int tick() {
        // TODO: a local event increments the counter; return it
        return time;
    }

    int send() {
        // TODO: sending is an event: tick and return the timestamp to attach
        return time;
    }

    int receive(int t) {
        // TODO: counter = max(counter, t) + 1; return it
        return time;
    }
};

inline Vec merge(const Vec& a, const Vec& b) {
    // TODO: element-wise max as a NEW vector; std::invalid_argument if the lengths differ
    return a;
}

inline std::string compare(const Vec& a, const Vec& b) {
    // TODO: "equal", "before" (a <= b everywhere), "after", or "concurrent";
    // std::invalid_argument if the lengths differ
    return "equal";
}

class VectorClock {
    int pid;
    Vec v;

public:
    VectorClock(int pid, int n) : pid(pid), v(n, 0) {}

    Vec value() const { return v; }

    Vec increment() {
        // TODO: bump only this process's entry; return a copy
        return v;
    }

    Vec send() {
        // TODO: an increment whose copy travels with the message
        return v;
    }

    Vec receive(const Vec& other) {
        // TODO: merge with the received vector, then increment; return a copy
        return v;
    }
};
