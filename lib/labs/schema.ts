import { z } from "zod";

export const LabMeta = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  sectionIds: z.array(z.string()).min(1),
  complexity: z.array(z.object({ op: z.string(), time: z.string(), space: z.string() })).min(1),
  hints: z.array(z.string().min(1)).length(3),
});
export type LabMeta = z.infer<typeof LabMeta>;

export type LabLang = "python" | "javascript" | "typescript" | "java" | "cpp";
export const LANGS: LabLang[] = ["python", "javascript", "typescript", "java", "cpp"];
export const EXT: Record<LabLang, string> = { python: "py", javascript: "js", typescript: "ts", java: "java", cpp: "cpp" };
/** TypeScript is transpiled to JavaScript and shares tests.js. */
export const TESTS_EXT: Record<LabLang, string> = { ...EXT, typescript: "js" };
/** Java and C++ can't compile in the browser without a 30–60 MB toolchain, so they run on the learner's machine (lib/labs/bundle.ts). */
export const IN_BROWSER: Record<LabLang, boolean> = { python: true, javascript: true, typescript: true, java: false, cpp: false };
export const LANG_LABEL: Record<LabLang, string> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript", java: "Java", cpp: "C++" };

export interface LabFiles { starter: string; solution: string; tests: string }
export interface Lab { meta: LabMeta; explanation: string; code: Record<LabLang, LabFiles> }

/** One test outcome, as both harnesses (public/labs/harness.py and harness.js) report it. */
export interface TestResult { name: string; input: string; passed: boolean; actual: string; expected: string; error: string; stdout: string }
