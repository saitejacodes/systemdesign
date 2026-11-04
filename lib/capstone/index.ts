import "server-only";
import fs from "node:fs";
import path from "node:path";
import { parseContent } from "@/lib/content/parse";
import { BreakIt, CapstoneStage, type BreakItem, type CapstoneFile } from "./schema";

export type { BreakItem, CapstoneFile, CapstoneStage } from "./schema";

export const CAPSTONE_DIR = path.join(process.cwd(), "content", "capstone");
const GUIDE_DIR = path.join(CAPSTONE_DIR, "guide");
export const ZIP_ROOT = "sysdesign-capstone-llm-platform";
export const PROJECT_TITLE = "Serve an open-weights LLM like a frontier lab";

export interface CapstoneGuide {
  meta: CapstoneStage;
  /** The guide's prose: what to observe and why, and how the stage changes at real scale. */
  mdx: string;
  /** Files in the stage folder, relative to it, sorted. Empty for stage 0. */
  files: string[];
}

const rel = (p: string) => path.relative(process.cwd(), p);

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".DS_Store" || e.name === "node_modules" || e.name === "dist" || e.name === "models") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

let cache: CapstoneGuide[] | null = null;
export function getCapstoneGuides(): CapstoneGuide[] {
  if (cache) return cache;
  const guides = fs
    .readdirSync(GUIDE_DIR)
    .filter((f) => /^stage-\d{2}\.json$/.test(f))
    .sort()
    .map((f): CapstoneGuide => {
      const file = path.join(GUIDE_DIR, f);
      const meta = parseContent(rel(file), fs.readFileSync(file, "utf8"), CapstoneStage);
      const mdxFile = file.replace(/\.json$/, ".mdx");
      const mdx = fs.existsSync(mdxFile) ? fs.readFileSync(mdxFile, "utf8") : "";
      const dir = meta.folder ? path.join(CAPSTONE_DIR, meta.folder) : null;
      return { meta, mdx, files: dir && fs.existsSync(dir) ? listFiles(dir) : [] };
    });
  cache = guides;
  return guides;
}

export const getCapstoneGuide = (stage: number) => getCapstoneGuides().find((g) => g.meta.stage === stage);

export function getBreakIt(): BreakItem[] {
  const file = path.join(GUIDE_DIR, "break-it.json");
  return parseContent(rel(file), fs.readFileSync(file, "utf8"), BreakIt);
}

export function readStageFile(folder: string, file: string): string {
  return fs.readFileSync(path.join(CAPSTONE_DIR, folder, file), "utf8");
}

/** Every checkpoint id on the capstone pages: stage checkpoints and Break-it items. */
export function capstoneCheckpointIds(): string[] {
  return [...getCapstoneGuides().flatMap((g) => g.meta.checkpoints.map((c) => c.id)), ...getBreakIt().map((b) => b.id)];
}

/** stage number -> phase (1-7) -> how many sections of that phase the stage links. */
export function coverageMatrix(): { stage: number; title: string; phases: number[] }[] {
  return getCapstoneGuides().map((g) => {
    const phases = [0, 0, 0, 0, 0, 0, 0];
    for (const c of g.meta.concepts) phases[Number(c.sectionId[1]) - 1]++;
    return { stage: g.meta.stage, title: g.meta.title, phases };
  });
}

export const stageDirName = (g: CapstoneStage) => g.folder ?? `stage-${String(g.stage).padStart(2, "0")}-design-review`;

/** The fenced ```markdown block in the stage 0 guide: the learner's fill-in template. */
export function designReviewTemplate(): string {
  const g = getCapstoneGuide(0);
  const m = g?.mdx.match(/```markdown\n([\s\S]*?)\n```/);
  return m ? m[1] + "\n" : "";
}

function stageReadme(g: CapstoneGuide): string {
  const m = g.meta;
  const lines = [`# Stage ${m.stage}: ${m.title}`, "", m.goal, "", `Time: about ${m.minutes} minutes.`, ""];
  if (m.changes.length) lines.push("## Changes from the previous stage", "", ...m.changes.map((c) => `- \`${c.path}\` (${c.change}): ${c.note}`), "");
  if (m.run.length) lines.push("## Run", "", ...m.run.flatMap((r) => [`${r.label}:`, "", "```sh", r.cmd, "```", ""]));
  if (m.verify.length) lines.push("## Verify", "", ...m.verify.flatMap((v) => [`${v.label}:`, "", "```sh", v.cmd, "```", "", `Expect: ${v.expect}`, ""]));
  lines.push(g.mdx.trim(), "");
  lines.push("## Concepts used", "", ...m.concepts.map((c) => `- /phase/${c.sectionId[1]}/${c.sectionId.slice(3)}: ${c.how}`), "");
  lines.push("## Checkpoints", "", ...m.checkpoints.map((c) => `- [ ] ${c.text}`), "");
  return lines.join("\n");
}

function rootReadme(): string {
  const guides = getCapstoneGuides();
  const lines = [
    `# ${PROJECT_TITLE}`,
    "",
    "A mini inference platform on your laptop: llama.cpp model servers on CPU, a TypeScript gateway that speaks the OpenAI",
    "Chat Completions API with streaming, tenants and token quotas, routing, caching, a batch queue, observability,",
    "reliability and a load test. Each stage folder is self-contained: cd into it and follow its README.",
    "",
    "Prerequisites: Docker with Compose v2, Node.js 22, k6 for stage 10 (or its container), about 2 GB of disk for the",
    "model files, and 4 to 6 GB of free RAM for the full stack in stages 8 to 10. A GPU is optional (stage 10 has a",
    "docker-compose.gpu.yml override for NVIDIA GPUs).",
    "",
    "Links such as /phase/6/llm-serving are lesson pages in SysDesign Lab; the full guide is its /capstone page.",
    "",
    "## Stages",
    "",
    ...guides.map((g) => `- \`${stageDirName(g.meta)}/\`: ${g.meta.title} (about ${g.meta.minutes} min)`),
    "",
    "## Break-it checklist",
    "",
    "Run these against stage 10 after you finish it.",
    "",
  ];
  for (const b of getBreakIt()) {
    lines.push(`### ${b.n}. ${b.title}`, "", ...b.steps.map((s, i) => `${i + 1}. ${s}`), "", `**Observe.** ${b.observe}`, "", `**Fix.** ${b.fix}`, "");
  }
  return lines.join("\n");
}

/** Every file of the downloadable zip, with paths under ZIP_ROOT. */
export function buildCapstoneManifest(): CapstoneFile[] {
  const out: CapstoneFile[] = [{ path: `${ZIP_ROOT}/README.md`, content: rootReadme() }];
  for (const g of getCapstoneGuides()) {
    const dir = `${ZIP_ROOT}/${stageDirName(g.meta)}`;
    out.push({ path: `${dir}/README.md`, content: stageReadme(g) });
    if (g.meta.stage === 0) out.push({ path: `${dir}/design-review-template.md`, content: designReviewTemplate() });
    for (const f of g.files) {
      const content = readStageFile(g.meta.folder!, f);
      out.push({ path: `${dir}/${f}`, content, ...(f.endsWith(".sh") ? { executable: true } : {}) });
    }
  }
  return out;
}
