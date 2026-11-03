import type { LabLang } from "./schema";

/** Java and C++ labs run on the learner's machine: one self-contained file with their code, the harness and the tests. */
export type LocalLang = Extract<LabLang, "java" | "cpp">;

export const LOCAL_FILE: Record<LocalLang, string> = { java: "LabTests.java", cpp: "lab.cpp" };
export const LOCAL_RUN: Record<LocalLang, string> = {
  java: "java LabTests.java",
  cpp: "c++ -std=c++17 -O2 lab.cpp -o lab && ./lab",
};

// Imports/includes must come first in the combined file, so they are hoisted out of each part.
const HEAD: Record<LocalLang, RegExp> = { java: /^\s*import\s+[\w.*]+\s*;\s*$/, cpp: /^\s*#include\s*[<"].+[>"]\s*$/ };

/** Java runs the first top-level class in a single-file launch, so the tests (with main) go first. */
export function bundle(lang: LocalLang, code: string, tests: string, harness: string): string {
  const parts = lang === "java" ? [tests, harness, code] : [harness, code, tests];
  const head = new Set<string>();
  const bodies = parts.map((p) => p.split("\n").filter((l) => (HEAD[lang].test(l) ? (head.add(l.trim()), false) : true)).join("\n").trim());
  return [...head].join("\n") + "\n\n" + bodies.join("\n\n") + "\n";
}
