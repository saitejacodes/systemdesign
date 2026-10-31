import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ContentError, parseContent } from "./parse";
import * as S from "./schemas";

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

export interface CaseStudy { meta: S.CaseStudyMeta; solution: string }
export function getCaseStudies(): CaseStudy[] {
  const dir = path.join(ROOT, "case-studies");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
    .map((d) => {
      const m = path.join(dir, d, "meta.json");
      return { meta: parseContent(rel(m), read(m), S.CaseStudyMeta), solution: read(path.join(dir, d, "solution.mdx")) };
    });
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
}
