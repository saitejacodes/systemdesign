#include <cstdint>
#include <functional>
#include <stdexcept>
#include <string>

// In C++, IDs are int64_t (63 bits used; the sign bit stays 0), the clock is a std::function returning
// Unix ms, out-of-range input throws std::invalid_argument, and parse returns a Parts struct.
// Layout, high bit to low: 1 sign (always 0) | 41 timestamp | 10 worker | 12 sequence.
constexpr int64_t TWITTER_EPOCH = 1288834974657LL; // 2010-11-04T01:42:54.657Z

struct Parts {
    int64_t timestamp;
    int workerId;
    int sequence;
};

struct ClockMovedBackwards : std::runtime_error {
    using std::runtime_error::runtime_error;
};

class Snowflake {
    int workerId;
    std::function<int64_t()> now;
    int64_t epoch;
    int64_t lastTs = -1;
    int sequence = 0;

public:
    Snowflake(int workerId, std::function<int64_t()> now, int64_t epoch = TWITTER_EPOCH)
        : workerId(workerId), now(std::move(now)), epoch(epoch) {
        // TODO: reject workerId outside 0..1023 with std::invalid_argument
    }

    int64_t nextId() {
        // TODO: read the clock once; throw ClockMovedBackwards if it is behind lastTs;
        // same millisecond -> bump the sequence, and on overflow spin until now() moves on;
        // new millisecond -> sequence 0. Then shift the three fields into place (64-bit shifts).
        return 0;
    }

    static Parts parse(int64_t id, int64_t epoch = TWITTER_EPOCH) {
        // TODO: undo the shifts and masks (shift a uint64_t copy)
        return {0, 0, 0};
    }
};
