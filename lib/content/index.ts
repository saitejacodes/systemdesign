import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ContentError, parseContent } from "./parse";
import { z } from "zod";
import { StudioGraph } from "@/lib/studio/types";
import * as S from "./schemas";
import { parseCheatSheet, validateCheatSheets, type CheatSheet } from "./cheatsheets";

const ROOT = path.join(process.cwd(), "content");
const read = (p: string) => fs.readFileSync(p, "utf8");
const rel = (p: string) => path.relative(process.cwd(), p);

export interface Section {
  meta: S.SectionMeta;
  lesson: string;
  quiz: S.QuizQuestion[];
  flashcards: S.Flashcard[];
  checkpoints: S.Checkpoint[];
  resources: S.Resource[];
}

function loadSection(dir: string): Section {
  const f = (name: string) => path.join(dir, name);
  const json = <T extends import("zod").ZodType>(name: string, schema: T) => {
    if (!fs.existsSync(f(name))) throw new ContentError(`Missing ${rel(f(name))}`);
    return parseContent(rel(f(name)), read(f(name)), schema);
  };
  const meta = json("meta.json", S.SectionMeta);
  if (path.basename(dir) !== meta.slug) throw new ContentError(`${rel(f("meta.json"))}: slug "${meta.slug}" must match folder name`);
  if (!fs.existsSync(f("lesson.mdx"))) throw new ContentError(`Missing ${rel(f("lesson.mdx"))}`);
  return {
    meta,
    lesson: read(f("lesson.mdx")),
    quiz: json("quiz.json", S.Quiz),
    flashcards: json("flashcards.json", S.Flashcards),
    checkpoints: json("checkpoints.json", S.Checkpoints),
    resources: json("resources.json", S.Resources),
  };
}

let sectionsCache: Section[] | null = null;
export function getAllSections(): Section[] {
  if (sectionsCache) return sectionsCache;
  const phasesDir = path.join(ROOT, "phases");
  const out: Section[] = [];
  for (const phase of fs.existsSync(phasesDir) ? fs.readdirSync(phasesDir).filter((d) => d.startsWith("phase-")) : []) {
    const pdir = path.join(phasesDir, phase);
    for (const slug of fs.readdirSync(pdir)) {
      const dir = path.join(pdir, slug);
      if (!fs.statSync(dir).isDirectory()) continue;
      const s = loadSection(dir);
      if (`phase-${s.meta.phase}` !== phase) throw new ContentError(`${rel(dir)}/meta.json: phase ${s.meta.phase} does not match folder ${phase}`);
      out.push(s);
    }
  }
  const ids = new Set<string>();
  for (const s of out) {
    if (ids.has(s.meta.id)) throw new ContentError(`Duplicate section id "${s.meta.id}"`);
    ids.add(s.meta.id);
  }
  sectionsCache = out.sort((a, b) => a.meta.phase - b.meta.phase || a.meta.order - b.meta.order);
  return sectionsCache;
}

export const getSection = (phase: number, slug: string) => getAllSections().find((s) => s.meta.phase === phase && s.meta.slug === slug);
export const getSectionById = (id: string) => getAllSections().find((s) => s.meta.id === id);
export const getSectionsByPhase = (phase: number) => getAllSections().filter((s) => s.meta.phase === phase);
export const sectionHref = (m: Pick<S.SectionMeta, "phase" | "slug">) => `/phase/${m.phase}/${m.slug}`;

const topJson = <T extends import("zod").ZodType>(name: string, schema: T, fallback: import("zod").infer<T>) => {
  const p = path.join(ROOT, name);
  return fs.existsSync(p) ? parseContent(rel(p), read(p), schema) : fallback;
};

export const getGlossary = () => topJson("glossary.json", S.Glossary, []).sort((a, b) => a.term.localeCompare(b.term));
export const getResources = () => topJson("resources.json", S.Resources, []);
export const getPlan = () => topJson("plan.json", S.Plan, []);

export interface CaseStudy {
  meta: S.CaseStudyMeta;
  solution: string;
  /** rubric.json, or null while a case is still being written. */
  rubric: S.Rubric | null;
  /** design.json (a bare StudioGraph or a Design Studio JSON export), or null while a case is still being written. */
  design: StudioGraph | null;
}

// design.json may be a bare graph or a Studio export ({ format, graph, ... }).
const DesignFile = z.union([StudioGraph, z.looseObject({ graph: StudioGraph }).transform((d) => d.graph)]);

/**
 * Case-study folders. Set SDL_FIXTURE_CASES=1 to also load tests/fixtures/case-studies (the e2e web server and the
 * unit tests do), so Interview Mode can be tested on a small fixture before or beside the real cases.
 */
function caseStudyDirs(): string[] {
  const roots = [path.join(ROOT, "case-studies")];
  if (process.env.SDL_FIXTURE_CASES === "1") roots.push(path.join(process.cwd(), "tests", "fixtures", "case-studies"));
  return roots.filter((r) => fs.existsSync(r)).flatMap((r) => fs.readdirSync(r).map((d) => path.join(r, d)).filter((d) => fs.statSync(d).isDirectory()));
}

function loadCaseStudy(dir: string): CaseStudy {
  const f = (name: string) => path.join(dir, name);
  const optional = <T extends z.ZodType>(name: string, schema: T): z.infer<T> | null => (fs.existsSync(f(name)) ? parseContent(rel(f(name)), read(f(name)), schema) : null);
  const meta = parseContent(rel(f("meta.json")), read(f("meta.json")), S.CaseStudyMeta);
  return { meta, solution: read(f("solution.mdx")), rubric: optional("rubric.json", S.Rubric), design: optional("design.json", DesignFile) };
}

export function getCaseStudies(): CaseStudy[] {
  return caseStudyDirs().map(loadCaseStudy);
}
export const getCaseStudy = (id: string) => getCaseStudies().find((c) => c.meta.id === id);

/** Cross-file checks: glossary terms point at real sections. */
export function validateAll() {
  const sections = getAllSections();
  const ids = new Set(sections.map((s) => s.meta.id));
  for (const g of getGlossary()) if (!ids.has(g.sectionId)) throw new ContentError(`content/glossary.json: term "${g.slug}" points at unknown section "${g.sectionId}"`);
  getPlan();
  getResources();
  getCaseStudies();
  getCheatSheets();
}

/** Plan weeks plus the written sections in the shape the client pages need. */
export function getPlanView() {
  const sections: import("@/lib/learning/plan").PlanSection[] = getAllSections().map(({ meta, checkpoints }) => ({
    id: meta.id, phase: meta.phase, week: meta.week, title: meta.title, href: sectionHref(meta), checkpointIds: checkpoints.map((c) => c.id), simulatorIds: meta.simulatorIds, topics: Object.fromEntries(meta.topics.map((t) => [t.id, t.title])),
  }));
  return { weeks: getPlan(), sections };
}

export type { CheatSheet } from "./cheatsheets";

let sheetsCache: CheatSheet[] | null = null;
/** Reference cheat sheets (content/cheatsheets/*.mdx), validated and in reading order. */
export function getCheatSheets(): CheatSheet[] {
  if (sheetsCache) return sheetsCache;
  const dir = path.join(ROOT, "cheatsheets");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mdx")) : [];
  const sheets = files.map((f) => parseCheatSheet(rel(path.join(dir, f)), f.replace(/\.mdx$/, ""), read(path.join(dir, f))));
  sheetsCache = validateCheatSheets(sheets, new Set(getAllSections().map((s) => s.meta.id)));
  return sheetsCache;
}
export const getCheatSheet = (slug: string) => getCheatSheets().find((s) => s.slug === slug);
