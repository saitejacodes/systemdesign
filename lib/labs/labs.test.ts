// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { getAllSections } from "@/lib/content";
import { bundle, LOCAL_FILE, type LocalLang } from "./bundle";
import { getLabs } from "./index";
import type { TestResult } from "./schema";

vi.mock("server-only", () => ({}));

// Python labs run through local CPython (python3 must be on PATH) with the same harness the Pyodide worker uses.
// The browser runs Pyodide's CPython 3.12, so labs stick to the standard library.
const HARNESS_PY = path.join(process.cwd(), "public/labs/harness.py");
const js = createRequire(import.meta.url)(path.join(process.cwd(), "public/labs/harness.js")) as { runLab: (code: string, tests: string) => TestResult[] };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "labs-"));

function runPy(code: string, tests: string): TestResult[] {
  const a = path.join(tmp, "solution.py"), b = path.join(tmp, "tests.py");
  fs.writeFileSync(a, code); fs.writeFileSync(b, tests);
  return JSON.parse(execFileSync("python3", ["-I", HARNESS_PY, a, b], { encoding: "utf8", timeout: 20_000 }));
}
// TypeScript is transpiled the way the browser worker does it, then run against tests.js.
const runTs = (code: string, tests: string) => js.runLab(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, tests);

// Java and C++ run as the single file the learner downloads; we read the harness summary line.
const HARNESS = { java: fs.readFileSync("public/labs/harness.java", "utf8"), cpp: fs.readFileSync("public/labs/harness.hpp", "utf8") };
function hasTool(cmd: string, args: string[]) { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch { return false; } }
// The Xcode shim at /usr/bin/c++ can be broken while Command Line Tools work, so probe a real compile with each.
const CLT_SDK = "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk";
const CXX_ENV = { ...process.env, ...(!process.env.SDKROOT && fs.existsSync(CLT_SDK) ? { SDKROOT: CLT_SDK } : {}) };
const probe = path.join(tmp, "probe.cpp");
fs.writeFileSync(probe, "#include <vector>\nint main() { return std::vector<int>{0}[0]; }\n");
const CXX = ["c++", "/Library/Developer/CommandLineTools/usr/bin/clang++", "g++"].find((c) => {
  try { execFileSync(c, ["-std=c++17", probe, "-o", path.join(tmp, "probe")], { stdio: "ignore", env: CXX_ENV }); return true; } catch { return false; }
});
const HAS_JAVA = hasTool("java", ["-version"]);
function runLocal(lang: LocalLang, code: string, tests: string): { passed: number; total: number; out: string } {
  const dir = fs.mkdtempSync(path.join(tmp, lang));
  const file = path.join(dir, LOCAL_FILE[lang]);
  fs.writeFileSync(file, bundle(lang, code, tests, HARNESS[lang]));
  const run = (cmd: string, args: string[]) => {
    try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 60_000, stdio: "pipe", env: CXX_ENV }); } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      return `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
  };
  let out: string;
  if (lang === "java") out = run("java", [file]);
  else {
    const bin = path.join(dir, "lab");
    out = run(CXX!, ["-std=c++17", "-O2", file, "-o", bin]);
    if (fs.existsSync(bin)) out += run(bin, []);
  }
  const m = out.match(/(\d+) \/ (\d+) passed/);
  return { passed: m ? +m[1] : 0, total: m ? +m[2] : 0, out };
}

const failed = (r: TestResult[]) => r.filter((x) => !x.passed).map((x) => `${x.name}: got ${x.actual} expected ${x.expected} ${x.error}`);

const labs = getLabs();
const sectionIds = new Set(getAllSections().map((s) => s.meta.id));

describe("code labs", () => {
  // content/labs is outside the app's tsconfig, so the TypeScript starters and solutions are type-checked here.
  it("typescript files type-check under strict", () => {
    const files = labs.flatMap((l) => ["starter", "solution"].map((f) => path.join(process.cwd(), "content/labs", l.meta.id, `${f}.ts`)));
    const program = ts.createProgram(files, { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, lib: ["lib.es2020.d.ts", "lib.webworker.d.ts"], types: [] });
    const diags = ts.getPreEmitDiagnostics(program).map((d) => `${d.file ? path.relative(process.cwd(), d.file.fileName) : ""}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
    expect(diags).toEqual([]);
  }, 60_000);

  it("has the 15 labs with unique ids and orders, linked to real sections", () => {
    expect(labs.length).toBe(15);
    expect(new Set(labs.map((l) => l.meta.order)).size).toBe(labs.length);
    for (const l of labs) for (const s of l.meta.sectionIds) expect(sectionIds.has(s), `${l.meta.id} → ${s}`).toBe(true);
  });

  for (const lab of labs) {
    describe(lab.meta.id, () => {
      it("python: reference passes every test, starter does not, ≥ 8 tests", () => {
        const ref = runPy(lab.code.python.solution, lab.code.python.tests);
        expect(ref.length).toBeGreaterThanOrEqual(8);
        expect(failed(ref)).toEqual([]);
        expect(runPy(lab.code.python.starter, lab.code.python.tests).every((r) => r.passed)).toBe(false);
      }, 30_000);
      it("javascript: reference passes every test, starter does not, ≥ 8 tests", () => {
        const ref = js.runLab(lab.code.javascript.solution, lab.code.javascript.tests);
        expect(ref.length).toBeGreaterThanOrEqual(8);
        expect(failed(ref)).toEqual([]);
        expect(js.runLab(lab.code.javascript.starter, lab.code.javascript.tests).every((r) => r.passed)).toBe(false);
      }, 30_000);
      it("typescript: reference passes tests.js, starter does not", () => {
        expect(failed(runTs(lab.code.typescript.solution, lab.code.typescript.tests))).toEqual([]);
        expect(runTs(lab.code.typescript.starter, lab.code.typescript.tests).every((r) => r.passed)).toBe(false);
      }, 30_000);
      for (const lang of ["java", "cpp"] as const) {
        it.skipIf(lang === "java" ? !HAS_JAVA : !CXX)(`${lang}: reference passes every test, starter compiles and does not, ≥ 8 tests`, () => {
          const ref = runLocal(lang, lab.code[lang].solution, lab.code[lang].tests);
          expect(ref.total, ref.out).toBeGreaterThanOrEqual(8);
          expect(ref.passed, ref.out).toBe(ref.total);
          const st = runLocal(lang, lab.code[lang].starter, lab.code[lang].tests);
          expect(st.total, `starter must compile and run:\n${st.out}`).toBe(ref.total);
          expect(st.passed).toBeLessThan(st.total);
        }, 120_000);
      }
    });
  }
});
