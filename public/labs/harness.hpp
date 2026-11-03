// Code-lab test harness for C++17, placed between the learner's code and tests.cpp by lib/labs/bundle.ts.
// A lab's tests.cpp defines main() and calls TEST("name", "input", [&] { EQ(actual, expected); }); then returns summary().
#include <cmath>
#include <functional>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace lab {
inline int passed = 0, total = 0;
struct Failure { std::string msg; };

inline std::string show(const std::string& s) { return "\"" + s + "\""; }
inline std::string show(const char* s) { return show(std::string(s)); }
inline std::string show(bool b) { return b ? "true" : "false"; }
template <class T> std::string show(const T& v);
template <class A, class B> std::string show(const std::pair<A, B>& p) { return "(" + show(p.first) + ", " + show(p.second) + ")"; }
template <class T> std::string show(const std::vector<T>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) out += (i ? ", " : "") + show(v[i]);
    return out + "]";
}
template <class T> std::string show(const T& v) { std::ostringstream o; o << v; return o.str(); }

inline void test(const std::string& name, const std::string& input, const std::function<void()>& fn) {
    total++;
    try {
        fn();
        passed++;
        std::cout << "PASS  " << name << "\n";
    } catch (const Failure& f) {
        std::cout << "FAIL  " << name << "\n      input:    " << input << "\n      " << f.msg << "\n";
    } catch (const std::exception& e) {
        std::cout << "FAIL  " << name << "\n      input:    " << input << "\n      error:    " << e.what() << "\n";
    }
}

template <class A, class B> void eq(const A& actual, const B& expected) {
    if (!(actual == expected)) throw Failure{"expected: " + show(expected) + "\n      actual:   " + show(actual)};
}
inline void approx(double actual, double expected, double tol) {
    if (std::fabs(actual - expected) > tol) throw Failure{"expected: " + show(expected) + " ± " + show(tol) + "\n      actual:   " + show(actual)};
}
template <class E> void raises(const std::function<void()>& fn) {
    try { fn(); } catch (const E&) { return; } catch (const std::exception& e) {
        throw Failure{std::string("expected: a different exception\n      actual:   ") + e.what()};
    }
    throw Failure{"expected: an exception\n      actual:   no exception"};
}
inline int summary() {
    std::cout << "\n" << passed << " / " << total << " passed\n";
    return passed == total ? 0 : 1;
}
}  // namespace lab

// Variadic so a lambda body may contain top-level commas (e.g. `int a, b;`).
#define TEST(name, input, ...) lab::test(name, input, __VA_ARGS__)
#define EQ(actual, expected) lab::eq(actual, expected)
#define APPROX(actual, expected, tol) lab::approx(actual, expected, tol)
#define RAISES(Exc, ...) lab::raises<Exc>(__VA_ARGS__)
