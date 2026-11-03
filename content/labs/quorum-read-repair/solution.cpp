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

    // A replica keeps whichever version is newest; an older or equal write is acknowledged but ignored.
    void store(int i, const std::string& key, const Versioned& v) {
        auto it = replicas_[i].find(key);
        if (it == replicas_[i].end()) replicas_[i].emplace(key, v);
        else if (v.version > it->second.version) it->second = v;
    }

public:
    QuorumStore(int n, int w, int r) : n_(n), w_(w), r_(r) {
        if (!(n >= 1 && w >= 1 && w <= n && r >= 1 && r <= n))
            throw std::invalid_argument("need n >= 1, 1 <= w <= n and 1 <= r <= n");
        replicas_.resize(n);
        down_.assign(n, false);
    }

    void setDown(int i, bool down = true) { down_[i] = down; }

    // Pigeonhole: a read quorum and a write quorum must share a replica iff R + W > N.
    bool overlaps() const { return r_ + w_ > n_; }

    std::optional<Versioned> replicaValue(int i, const std::string& key) const {
        auto it = replicas_[i].find(key);
        if (it == replicas_[i].end()) return std::nullopt;
        return it->second;
    }

    int write(const std::string& key, const std::string& value, long long version) {
        int acks = 0;
        for (int i = 0; i < n_; i++) {
            if (!down_[i]) { store(i, key, Versioned{version, value}); acks++; }
        }
        // Replicas that did accept the write keep it even if the quorum fails: there is no rollback.
        if (acks < w_) throw QuorumError("write got " + std::to_string(acks) + " acks, needs " + std::to_string(w_));
        return acks;
    }

    std::optional<Versioned> read(const std::string& key) {
        std::vector<int> all;
        for (int i = 0; i < n_; i++) all.push_back(i);
        return read(key, all);
    }

    std::optional<Versioned> read(const std::string& key, const std::vector<int>& order) {
        std::vector<int> contacted;
        for (int i : order) if (!down_[i] && (int)contacted.size() < r_) contacted.push_back(i);
        if ((int)contacted.size() < r_)
            throw QuorumError("read reached " + std::to_string(contacted.size()) + " replicas, needs " + std::to_string(r_));
        std::vector<std::optional<Versioned>> answers;
        std::optional<Versioned> newest;
        for (int i : contacted) {
            answers.push_back(replicaValue(i, key));
            const auto& a = answers.back();
            if (a && (!newest || a->version > newest->version)) newest = a;
        }
        if (!newest) return std::nullopt;
        // Read repair: push the newest version to every contacted replica that returned something older.
        for (size_t k = 0; k < contacted.size(); k++) {
            if (!answers[k] || answers[k]->version < newest->version) store(contacted[k], key, *newest);
        }
        return newest;
    }
};
