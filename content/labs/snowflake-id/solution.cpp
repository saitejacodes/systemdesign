#include <cstdint>
#include <functional>
#include <stdexcept>
#include <string>

// In C++, IDs are int64_t (63 bits used; the sign bit stays 0), the clock is a std::function returning
// Unix ms, out-of-range input throws std::invalid_argument, and parse returns a Parts struct.
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
    static constexpr int TIMESTAMP_BITS = 41, WORKER_BITS = 10, SEQUENCE_BITS = 12;
    static constexpr int MAX_WORKER = (1 << WORKER_BITS) - 1;     // 1023
    static constexpr int MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1; // 4095
    static constexpr int WORKER_SHIFT = SEQUENCE_BITS, TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS;

    int workerId;
    std::function<int64_t()> now;
    int64_t epoch;
    int64_t lastTs = -1;
    int sequence = 0;

public:
    Snowflake(int workerId, std::function<int64_t()> now, int64_t epoch = TWITTER_EPOCH)
        : workerId(workerId), now(std::move(now)), epoch(epoch) {
        if (workerId < 0 || workerId > MAX_WORKER) throw std::invalid_argument("workerId must be 0..1023");
    }

    int64_t nextId() {
        int64_t ts = now();
        if (ts < lastTs) {
            // Trusting the clock here could re-issue an ID we already handed out.
            throw ClockMovedBackwards("clock moved back " + std::to_string(lastTs - ts) + " ms");
        }
        if (ts == lastTs) {
            sequence = (sequence + 1) & MAX_SEQUENCE;
            if (sequence == 0) {
                // 4,096 IDs used this millisecond: spin until the clock moves on.
                while (ts <= lastTs) ts = now();
            }
        } else {
            sequence = 0;
        }
        int64_t delta = ts - epoch;
        if (delta < 0 || delta >= (int64_t{1} << TIMESTAMP_BITS)) throw std::invalid_argument("timestamp outside the 41-bit range of this epoch");
        lastTs = ts;
        return (delta << TIMESTAMP_SHIFT) | (int64_t{workerId} << WORKER_SHIFT) | sequence;
    }

    static Parts parse(int64_t id, int64_t epoch = TWITTER_EPOCH) {
        uint64_t u = static_cast<uint64_t>(id); // shift unsigned so no sign bit is ever smeared
        return {static_cast<int64_t>(u >> TIMESTAMP_SHIFT) + epoch, static_cast<int>((u >> WORKER_SHIFT) & MAX_WORKER),
                static_cast<int>(u & MAX_SEQUENCE)};
    }
};
