/* Code-lab test harness for JavaScript. Loaded with importScripts in the lab worker and with require in CI.
   A lab's tests.js calls test(name, input, (m) => [actual, expected]); m is the learner's module.exports. */
(function (root) {
  function approx(value, tol) { return { __approx: true, value, tol: tol ?? 1e-6 }; }
  function raises(name) { return { __raises: true, name }; }

  function show(v) {
    if (v && v.__approx) return `${show(v.value)} ± ${v.tol}`;
    if (v && v.__raises) return `throws ${v.name}`;
    if (v === undefined) return "undefined";
    if (typeof v === "bigint") return `${v}n`;
    if (v instanceof Map) return `Map(${show([...v.entries()])})`;
    if (v instanceof Set) return `Set(${show([...v])})`;
    try { return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? `${x}n` : x)); } catch { return String(v); }
  }

  function equal(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (a instanceof Map || a instanceof Set) return show(a) === show(b);
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => equal(a[k], b[k]));
  }

  function matches(actual, expected) {
    if (expected && expected.__approx) {
      const vs = Array.isArray(expected.value) ? expected.value : [expected.value];
      const as = Array.isArray(actual) ? actual : [actual];
      return vs.length === as.length && as.every((x, i) => typeof x === "number" && Math.abs(x - vs[i]) <= expected.tol);
    }
    return equal(actual, expected);
  }

  function capture(fn) {
    const lines = [];
    const orig = console.log;
    console.log = (...a) => lines.push(a.map((x) => (typeof x === "string" ? x : show(x))).join(" "));
    try { return { value: fn(), stdout: lines }; } finally { console.log = orig; }
  }

  function load(code) {
    const mod = { exports: {} };
    const run = capture(() => new Function("module", "exports", `"use strict";\n${code}\n;return module.exports;`)(mod, mod.exports));
    return { exports: run.value, stdout: run.stdout.join("\n") };
  }

  const errText = (e) => (e && e.stack ? String(e.stack).split("\n").slice(0, 4).join("\n") : String(e));

  function runProgram(code) {
    try { return { stdout: load(code).stdout, error: "" }; } catch (e) { return { stdout: "", error: errText(e) }; }
  }

  function runLab(code, testsCode) {
    let m;
    try { m = load(code).exports; } catch (e) {
      return [{ name: "your code loads", input: "", passed: false, actual: "", expected: "", error: errText(e), stdout: "" }];
    }
    const cases = [];
    new Function("test", "approx", "raises", testsCode)((name, input, fn) => cases.push({ name, input, fn }), approx, raises);
    return cases.map(({ name, input, fn }) => {
      let r;
      try { r = capture(() => fn(m)); } catch (e) {
        return { name, input, passed: false, actual: "", expected: "", error: errText(e), stdout: "" };
      }
      const [actual, expected] = r.value;
      const stdout = r.stdout.join("\n");
      if (expected && expected.__raises) {
        try { capture(actual); return { name, input, passed: false, actual: "no exception", expected: show(expected), error: "", stdout }; } catch (e) {
          const ok = e && e.name === expected.name;
          return { name, input, passed: ok, actual: `throws ${e && e.name}`, expected: show(expected), error: ok ? "" : errText(e), stdout };
        }
      }
      return { name, input, passed: matches(actual, expected), actual: show(actual), expected: show(expected), error: "", stdout };
    });
  }

  const api = { runLab, runProgram };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LabHarness = api;
})(typeof self !== "undefined" ? self : globalThis);
