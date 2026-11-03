"""Code-lab test harness. Runs in Pyodide (browser worker) and in CPython (CI, scripts/run-labs.mjs).

A lab's tests.py registers cases with @test; each case receives the learner's module and returns
(actual, expected). run_lab() returns one JSON-friendly dict per case.
"""
import contextlib, io, json, math, traceback, types

_TESTS = []


def test(name, input=""):
    def deco(fn):
        _TESTS.append((name, input, fn))
        return fn
    return deco


class approx:
    """Expected float (or list of floats) within an absolute tolerance."""
    def __init__(self, value, tol=1e-6):
        self.value, self.tol = value, tol

    def matches(self, actual):
        vals = self.value if isinstance(self.value, (list, tuple)) else [self.value]
        acts = actual if isinstance(actual, (list, tuple)) else [actual]
        return len(vals) == len(acts) and all(isinstance(a, (int, float)) and math.isclose(a, v, abs_tol=self.tol) for a, v in zip(acts, vals))

    def __repr__(self):
        return f"{self.value!r} ± {self.tol}"


class raises:
    """Expected: calling fn() raises this exception type."""
    def __init__(self, exc):
        self.exc = exc

    def __repr__(self):
        return f"raises {self.exc.__name__}"


def _run_case(fn, mod):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        try:
            actual, expected = fn(mod)
        except Exception as e:
            return {"passed": False, "actual": "", "expected": "", "error": _short_tb(e), "stdout": out.getvalue()}
    if isinstance(expected, raises):
        try:
            with contextlib.redirect_stdout(out):
                actual()
            return {"passed": False, "actual": "no exception", "expected": repr(expected), "error": "", "stdout": out.getvalue()}
        except expected.exc:
            return {"passed": True, "actual": repr(expected), "expected": repr(expected), "error": "", "stdout": out.getvalue()}
        except Exception as e:
            return {"passed": False, "actual": f"raised {type(e).__name__}", "expected": repr(expected), "error": _short_tb(e), "stdout": out.getvalue()}
    ok = expected.matches(actual) if isinstance(expected, approx) else actual == expected
    return {"passed": bool(ok), "actual": repr(actual), "expected": repr(expected), "error": "", "stdout": out.getvalue()}


def _short_tb(e):
    lines = traceback.format_exception(type(e), e, e.__traceback__)
    # Drop harness frames so the learner sees their own code first.
    return "".join(l for l in lines if "harness.py" not in l)[-1500:]


def run_program(code):
    """Run the learner's code alone (the Run button). Returns {stdout, error}."""
    mod = types.ModuleType("solution")
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        try:
            exec(compile(code, "solution.py", "exec"), mod.__dict__)
            return {"stdout": out.getvalue(), "error": ""}
        except Exception as e:
            return {"stdout": out.getvalue(), "error": _short_tb(e)}


def run_lab(code, tests_code):
    """Run every registered test against the learner's code. Returns a list of result dicts."""
    _TESTS.clear()
    mod = types.ModuleType("solution")
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        try:
            exec(compile(code, "solution.py", "exec"), mod.__dict__)
        except Exception as e:
            return [{"name": "your code loads", "input": "", "passed": False, "actual": "", "expected": "", "error": _short_tb(e), "stdout": out.getvalue()}]
    g = {"test": test, "approx": approx, "raises": raises, "__name__": "tests"}
    exec(compile(tests_code, "tests.py", "exec"), g)
    return [{"name": name, "input": inp, **_run_case(fn, mod)} for name, inp, fn in _TESTS]


if __name__ == "__main__":
    # CI entry: python3 harness.py <solution.py> <tests.py>  →  JSON results on stdout.
    import sys
    code, tests = (open(p).read() for p in sys.argv[1:3])
    print(json.dumps(run_lab(code, tests)))
