// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import JSZip from "jszip";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { getAllSections, sectionHref } from "@/lib/content";
import { buildZip } from "./zip";
import { buildCapstoneManifest, CAPSTONE_DIR, capstoneCheckpointIds, coverageMatrix, designReviewTemplate, getBreakIt, getCapstoneGuides, ZIP_ROOT } from "./index";

vi.mock("server-only", () => ({}));

// The capstone code is excluded from the app's tsconfig and eslint (it has its own package.json and pinned deps, which
// are not installed here). This file checks that every source file at least parses; the full strict typecheck of each
// stage was run against its pinned dependencies when the stage was written.

// `yaml` is not a direct dependency; pnpm hoists it into node_modules/.pnpm/node_modules for its dependents.
const requireHoisted = createRequire(path.join(process.cwd(), "node_modules/.pnpm/node_modules/_.js"));
const YAML = requireHoisted("yaml") as { parseAllDocuments: (src: string) => { errors: { message: string }[] }[] };

const guides = getCapstoneGuides();
const breakIt = getBreakIt();
const stageDirs = guides.filter((g) => g.meta.folder).map((g) => ({ stage: g.meta.stage, dir: path.join(CAPSTONE_DIR, g.meta.folder!), files: g.files }));
const allFiles = stageDirs.flatMap((s) => s.files.map((f) => ({ stage: s.stage, rel: f, abs: path.join(s.dir, f) })));
const byExt = (re: RegExp) => allFiles.filter((f) => re.test(f.rel));

// Same rule as LessonRenderer's slugify, which gives lesson headings their ids.
const slugify = (s: string) => s.toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

describe("capstone structure", () => {
  it("has stages 0-10 in order, with a code folder for every stage after 0", () => {
    expect(guides.map((g) => g.meta.stage)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(guides[0].meta.folder).toBeNull();
    for (const s of stageDirs) {
      expect(fs.existsSync(s.dir), s.dir).toBe(true);
      expect(s.files.length, s.dir).toBeGreaterThan(0);
      expect(path.basename(s.dir)).toMatch(new RegExp(`^stage-${String(s.stage).padStart(2, "0")}-`));
    }
  });

  it("every file a guide lists as added or modified exists in its stage folder", () => {
    for (const g of guides) {
      for (const c of g.meta.changes) {
        if (c.change === "removed" || !g.meta.folder) continue;
        expect(fs.existsSync(path.join(CAPSTONE_DIR, g.meta.folder, c.path)), `stage ${g.meta.stage}: ${c.path}`).toBe(true);
      }
    }
  });

  it("every stage has a guide MDX with the real-scale section", () => {
    for (const g of guides) {
      expect(g.mdx.length, `stage ${g.meta.stage}`).toBeGreaterThan(500);
      if (g.meta.stage > 0) expect(g.mdx, `stage ${g.meta.stage}`).toMatch(/^## How this changes at real scale$/m);
    }
    expect(designReviewTemplate()).toMatch(/## 7\. Wrap-up/);
  });

  it("checkpoint ids are unique and well-formed", () => {
    const ids = capstoneCheckpointIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of guides) g.meta.checkpoints.forEach((c, i) => expect(c.id).toBe(`capstone-${g.meta.stage}-${i + 1}`));
    expect(breakIt.map((b) => b.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `capstone-break-${n}`));
    for (const g of guides) expect(g.meta.checkpoints.length).toBeGreaterThanOrEqual(3);
  });
});

describe("capstone curriculum coverage", () => {
  const sections = getAllSections();
  const ids = new Set(sections.map((s) => s.meta.id));

  it("every linked section id exists", () => {
    for (const g of guides) for (const c of g.meta.concepts) expect(ids.has(c.sectionId), `stage ${g.meta.stage}: ${c.sectionId}`).toBe(true);
    for (const b of breakIt) for (const c of b.concepts) expect(ids.has(c), `${b.id}: ${c}`).toBe(true);
  });

  it("every phase 1-7 is linked from at least 2 stages", () => {
    const matrix = coverageMatrix();
    for (let p = 0; p < 7; p++) {
      const stages = matrix.filter((row) => row.phases[p] > 0).map((row) => row.stage);
      expect(stages.length, `phase ${p + 1} is linked from stages [${stages.join(", ")}]`).toBeGreaterThanOrEqual(2);
    }
  });

  it("every /phase link in the guide prose points at an existing section and heading", () => {
    const anchors = new Map(sections.map((s) => [sectionHref(s.meta), new Set([...s.lesson.matchAll(/^#{2,3} (.+)$/gm)].map((m) => slugify(m[1].trim())))]));
    let links = 0;
    for (const g of guides) {
      for (const m of g.mdx.matchAll(/\]\((\/phase\/[^)#\s]+)(?:#([^)\s]+))?\)/g)) {
        links++;
        const heads = anchors.get(m[1]);
        expect(heads, `stage ${g.meta.stage}: ${m[1]}`).toBeDefined();
        if (m[2]) expect(heads!.has(m[2]), `stage ${g.meta.stage}: ${m[1]}#${m[2]}`).toBe(true);
      }
    }
    expect(links).toBeGreaterThan(40);
  });

  it("every guide MDX compiles", async () => {
    for (const g of guides) await expect(serialize(g.mdx, { mdxOptions: { remarkPlugins: [remarkGfm] } }), `stage ${g.meta.stage}`).resolves.toBeTruthy();
  });
});

describe("capstone code parses", () => {
  it("every .ts file is valid TypeScript syntax", () => {
    const files = byExt(/\.ts$/);
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) {
      const sf = ts.createSourceFile(f.abs, fs.readFileSync(f.abs, "utf8"), ts.ScriptTarget.ES2022, false, ts.ScriptKind.TS);
      const diags = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
      expect(diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), f.rel).toEqual([]);
    }
  });

  it("every k6 script and .mjs file parses as an ES module", () => {
    const files = byExt(/\.(m?js)$/);
    expect(files.some((f) => f.rel.startsWith("k6/"))).toBe(true);
    for (const f of files) {
      const sf = ts.createSourceFile(f.abs.replace(/\.js$/, ".mjs"), fs.readFileSync(f.abs, "utf8"), ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS);
      const diags = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
      expect(diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), f.rel).toEqual([]);
      if (f.rel.startsWith("k6/")) expect(sf.statements.some((s) => ts.isImportDeclaration(s) || ts.isExportDeclaration(s) || ts.isExportAssignment(s) || (ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))), `${f.rel} imports or exports`).toBe(true);
    }
  });

  it("every YAML file parses (compose, Prometheus, Grafana, GitHub workflow)", () => {
    const files = byExt(/\.ya?ml$/);
    expect(files.some((f) => f.rel.startsWith(".github/workflows/"))).toBe(true);
    for (const f of files) {
      const docs = YAML.parseAllDocuments(fs.readFileSync(f.abs, "utf8"));
      expect(docs.flatMap((d) => d.errors.map((e) => e.message)), f.rel).toEqual([]);
    }
  });

  it("every JSON and JSONL file parses", () => {
    for (const f of byExt(/\.json$/)) expect(() => JSON.parse(fs.readFileSync(f.abs, "utf8")), f.rel).not.toThrow();
    for (const f of byExt(/\.jsonl$/)) {
      for (const line of fs.readFileSync(f.abs, "utf8").split("\n").filter(Boolean)) expect(() => JSON.parse(line), f.rel).not.toThrow();
    }
  });

  it("every stage pins exact npm versions and image tags", () => {
    for (const f of byExt(/(^|\/)package\.json$/)) {
      const pkg = JSON.parse(fs.readFileSync(f.abs, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      for (const [name, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) expect(v, `stage ${f.stage} ${name}`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    for (const f of byExt(/(docker-compose[^/]*\.yml|Dockerfile)$/)) {
      for (const m of fs.readFileSync(f.abs, "utf8").matchAll(/(?:image:|FROM)\s+(\S+)/g)) {
        if (m[1].startsWith("llm-gateway:") || m[1] === "build") continue;
        expect(m[1], `stage ${f.stage} ${f.rel}`).toMatch(/:[\w.-]*\d[\w.-]*$/);
        expect(m[1]).not.toMatch(/:latest$/);
      }
    }
  });
});

const hasCompose = (() => {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasCompose)("docker compose config", () => {
  for (const s of stageDirs) {
    it(`stage ${s.stage} compose file is valid`, () => {
      for (const extra of s.files.filter((f) => /^docker-compose\.[a-z]+\.yml$/.test(f)).map((f) => ["-f", f]).concat([[]])) {
        execFileSync("docker", ["compose", "-f", "docker-compose.yml", ...extra, "config", "-q"], { cwd: s.dir, stdio: "pipe" });
      }
    });
  }
});

describe("zip manifest", () => {
  it("contains a root README and every stage folder", () => {
    const files = buildCapstoneManifest();
    const paths = files.map((f) => f.path);
    expect(paths).toContain(`${ZIP_ROOT}/README.md`);
    expect(paths).toContain(`${ZIP_ROOT}/stage-00-design-review/design-review-template.md`);
    for (const s of stageDirs) expect(paths).toContain(`${ZIP_ROOT}/${path.basename(s.dir)}/README.md`);
    expect(files.filter((f) => f.path.endsWith(".sh")).every((f) => f.executable)).toBe(true);
    expect(files.find((f) => f.path === `${ZIP_ROOT}/README.md`)!.content).toMatch(/Break-it checklist/);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("round-trips through JSZip with executable scripts", async () => {
    const files = buildCapstoneManifest();
    const zip = await JSZip.loadAsync(await buildZip(JSZip, files, "uint8array"));
    expect(Object.values(zip.files).filter((f) => !f.dir)).toHaveLength(files.length);
    const sh = zip.file(`${ZIP_ROOT}/stage-01-model-server/scripts/download-models.sh`)!;
    expect(Number(sh.unixPermissions) & 0o111).toBeTruthy();
    expect(await zip.file(`${ZIP_ROOT}/README.md`)!.async("string")).toMatch(/Break-it checklist/);
  });
});
