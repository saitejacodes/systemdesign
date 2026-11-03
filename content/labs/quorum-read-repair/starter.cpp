#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

// Keys and values are std::strings and versions are long longs in C++; read and replicaValue return
// std::optional<Versioned> (empty = no value), and an invalid configuration throws std::invalid_argument.
struct Versioned {
    long long version;
    std::string value;
};

struct QuorumError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

class QuorumStore {
    int n_, w_, r_;
    std::vector<std::map<std::string, Versioned>> replicas_;
    std::vector<bool> down_;

public:
    QuorumStore(int n, int w, int r) : n_(n), w_(w), r_(r) {
        // TODO: throw std::invalid_argument unless n >= 1, 1 <= w <= n and 1 <= r <= n
        replicas_.resize(n);
        down_.assign(n, false);
    }

    void setDown(int i, bool down = true) { down_[i] = down; }

    bool overlaps() const {
        // TODO: is every read quorum guaranteed to share a replica with every write quorum?
        return false;
    }

    std::optional<Versioned> replicaValue(int i, const std::string& key) const {
        auto it = replicas_[i].find(key);
        if (it == replicas_[i].end()) return std::nullopt;
        return it->second;
    }

    int write(const std::string& key, const std::string& value, long long version) {
        // TODO: store on every up replica (a replica keeps only the newest version),
        // count acks, throw QuorumError if acks < w, otherwise return acks
        return 0;
    }

    std::optional<Versioned> read(const std::string& key) {
        std::vector<int> all;
        for (int i = 0; i < n_; i++) all.push_back(i);
        return read(key, all);
    }

    std::optional<Versioned> read(const std::string& key, const std::vector<int>& order) {
        // TODO: contact the first r up replicas in order; throw QuorumError if fewer;
        // return the newest Versioned (or std::nullopt), and repair contacted replicas that were stale
        return std::nullopt;
    }
};
