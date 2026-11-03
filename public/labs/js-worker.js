/* Code-lab JavaScript / TypeScript worker. Loads the harness (and, as js-worker.js?lang=ts, the TypeScript compiler),
   then removes network and import globals so learner code can't reach out. Same protocol as py-worker.js:
   In:  { id, kind: "run" | "test", code, tests }
   Out: { status: "loading" | "ready" | "error", detail? } and { id, ok, results | program | error, ms } */
const TS_URL = "https://cdn.jsdelivr.net/npm/typescript@5.9.3/lib/typescript.js";
const isTs = new URLSearchParams(self.location.search).get("lang") === "ts";

importScripts("/labs/harness.js");
const harness = self.LabHarness;
const post = self.postMessage.bind(self);

// Not named `ts`: typescript.js declares a global `var ts`, which would clash with a top-level let.
let tsc = null;
if (isTs) {
  post({ status: "loading", detail: "Loading the TypeScript compiler, about 9 MB, first time only…" });
  try { importScripts(TS_URL); tsc = self.ts; } catch (e) { post({ status: "error", detail: `Couldn't load the TypeScript compiler: ${(e && e.message) || e}` }); }
}

const BLOCKED = ["fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "EventSource", "importScripts", "indexedDB", "caches", "Worker", "SharedWorker", "BroadcastChannel", "WebTransport"];
// Shadow each name on the global object and on every prototype that defines it (fetch lives on WorkerGlobalScope).
for (let o = self; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
  for (const name of BLOCKED) {
    if (o === self || Object.prototype.hasOwnProperty.call(o, name)) {
      try { Object.defineProperty(o, name, { value: undefined, writable: false, configurable: false }); } catch { /* not configurable: skip */ }
    }
  }
}
delete self.LabHarness;
delete self.ts;

/** TypeScript → CommonJS JavaScript. Returns { js } or { error } with the compiler's diagnostics. */
function transpile(code) {
  const out = tsc.transpileModule(code, { reportDiagnostics: true, fileName: "solution.ts", compilerOptions: { module: tsc.ModuleKind.CommonJS, target: tsc.ScriptTarget.ES2020 } });
  const diags = out.diagnostics || [];
  if (!diags.length) return { js: out.outputText };
  return {
    error: diags.map((d) => {
      const msg = tsc.flattenDiagnosticMessageText(d.messageText, "\n");
      if (!d.file || d.start === undefined) return msg;
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      return `solution.ts:${line + 1}:${character + 1} ${msg}`;
    }).join("\n"),
  };
}

self.onmessage = (ev) => {
  const { id, kind, tests } = ev.data;
  let code = ev.data.code;
  const t0 = performance.now();
  try {
    if (isTs) {
      if (!tsc) { post({ id, ok: false, error: "The TypeScript compiler isn't loaded. Check your connection and reload the page.", ms: 0 }); return; }
      const r = transpile(code);
      if (r.error) {
        const msg = `TypeScript couldn't compile your code:\n${r.error}`;
        if (kind === "test") post({ id, ok: true, results: [{ name: "your code compiles", input: "", passed: false, actual: "", expected: "", error: msg, stdout: "" }], ms: performance.now() - t0 });
        else post({ id, ok: true, program: { stdout: "", error: msg }, ms: performance.now() - t0 });
        return;
      }
      code = r.js;
    }
    if (kind === "test") post({ id, ok: true, results: harness.runLab(code, tests ?? ""), ms: performance.now() - t0 });
    else post({ id, ok: true, program: harness.runProgram(code), ms: performance.now() - t0 });
  } catch (e) {
    post({ id, ok: false, error: String((e && e.stack) || e), ms: performance.now() - t0 });
  }
};

if (!isTs || tsc) post({ status: "ready" });
