/* Code-lab Python worker (classic worker). Pyodide is fetched from the CDN the first time this worker starts.
   In:  { id, kind: "run" | "test", code, tests }
   Out: { status: "loading" | "ready" | "error", detail? } and { id, ok, results | program | error, ms } */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

let labJson = null;

async function boot() {
  self.postMessage({ status: "loading", detail: "Downloading the Python runtime" });
  importScripts(PYODIDE + "pyodide.js");
  const pyodide = await loadPyodide({ indexURL: PYODIDE });
  self.postMessage({ status: "loading", detail: "Starting Python" });
  const res = await fetch("/labs/harness.py");
  if (!res.ok) throw new Error(`Couldn't load the test harness (HTTP ${res.status})`);
  pyodide.FS.mkdirTree("/home/pyodide/lab");
  pyodide.FS.writeFile("/home/pyodide/lab/harness.py", await res.text());
  pyodide.runPython(`
import sys, json
sys.path.insert(0, "/home/pyodide/lab")
import harness

def _lab_json(kind, code, tests):
    return json.dumps(harness.run_lab(code, tests) if kind == "test" else harness.run_program(code))
`);
  labJson = pyodide.globals.get("_lab_json");
}

const ready = boot().then(
  () => self.postMessage({ status: "ready" }),
  (e) => { self.postMessage({ status: "error", detail: String((e && e.message) || e) }); throw e; },
);

self.onmessage = async (ev) => {
  const { id, kind, code, tests } = ev.data;
  try { await ready; } catch (e) {
    self.postMessage({ id, ok: false, error: String((e && e.message) || e), ms: 0 });
    return;
  }
  const t0 = performance.now();
  try {
    const out = JSON.parse(labJson(kind, code, tests ?? ""));
    const ms = performance.now() - t0;
    self.postMessage(kind === "test" ? { id, ok: true, results: out, ms } : { id, ok: true, program: out, ms });
  } catch (e) {
    // Errors in the learner's code are reported by the harness; this is a broken tests file or a Pyodide failure.
    self.postMessage({ id, ok: false, error: String((e && e.message) || e), ms: performance.now() - t0 });
  }
};
