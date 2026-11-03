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

    int tick() { return ++time; }                                         // a local event
    int send() { return tick(); }                                         // the timestamp travels with the message
    int receive(int t) { time = std::max(time, t) + 1; return time; }     // jump past the sender
};

inline void checkLengths(const Vec& a, const Vec& b) {
    if (a.size() != b.size()) throw std::invalid_argument("vector lengths differ");
}

// Element-wise maximum: everything either side has seen. Inputs are not modified.
inline Vec merge(const Vec& a, const Vec& b) {
    checkLengths(a, b);
    Vec out(a.size());
    for (size_t i = 0; i < a.size(); i++) out[i] = std::max(a[i], b[i]);
    return out;
}

inline std::string compare(const Vec& a, const Vec& b) {
    checkLengths(a, b);
    bool aLeB = true, bLeA = true;
    for (size_t i = 0; i < a.size(); i++) { aLeB = aLeB && a[i] <= b[i]; bLeA = bLeA && b[i] <= a[i]; }
    if (aLeB && bLeA) return "equal";
    if (aLeB) return "before"; // a happened before b
    if (bLeA) return "after";
    return "concurrent";       // each has seen something the other has not
}

class VectorClock {
    int pid;
    Vec v;

public:
    VectorClock(int pid, int n) : pid(pid), v(n, 0) {}

    Vec value() const { return v; } // returned by value: a copy
    Vec increment() { v[pid]++; return v; }
    Vec send() { return increment(); }
    Vec receive(const Vec& other) { v = merge(v, other); return increment(); }
};
