/**
 * Content QA (Prompt 23 item 6). Run: pnpm qa:content [--json] [--quiet]
 *
 * Loads every piece of content through the app's own loaders and zod schemas (lib/content, lib/capstone, lib/labs),
 * then checks cross-references: internal links, <Simulator id>, <Term slug>, section/case/simulator ids in meta.json,
 * plan.json, case studies, cheat sheets, code labs, the simulator registry and the capstone guides. It also checks
 * every section against the CLAUDE.md §7 Content Standard and reports orphan glossary terms.
 *
 * Errors (exit 1): invalid content, broken references, a lesson missing a required §7 element.
 * Warnings (exit 0): volume targets, softer parts of the standard, orphan glossary terms.
 *
 * lib/content imports "server-only"; the npm script runs tsx with --conditions=react-server so it resolves to the
 * package's empty export, exactly as it does inside Next's server build. The loaders themselves are unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { getAllSections, getCaseStudies, getCheatSheets, getGlossary, getPlan, getResources, validateAll } from "@/lib/content";
import { getBreakIt, getCapstoneGuides, CAPSTONE_DIR } from "@/lib/capstone";
import { getLabs } from "@/lib/labs";
import { REGISTRY } from "@/lib/simulators/registry";
import { componentAttr, headingIds, linkIssues, mdxRefIssues, orphanTerms, sectionStandardIssues, sortIssues, summarize, type Issue, type RouteIndex } from "@/lib/content/qa";

const json = process.argv.includes("--json");
const quiet = process.argv.includes("--quiet");
const ROOT = process.cwd();
const rel = (p: string) => path.relative(ROOT, p);
const issues: Issue[] = [];
const err = (kind: string, where: string, message: string) => issues.push({ severity: "error", kind, where, message });
const warn = (kind: string, where: string, message: string) => issues.push({ severity: "warning", kind, where, message });

/** Load step: any loader throw (zod or missing file) is an "invalid-content" error, and the run stops there. */
function load<T>(what: string, fn: () => T): T | null {
  try {
    return fn();
  } catch (e) {
    err("invalid-content", what, (e as Error).message);
    return null;
  }
}

/** Routes with no dynamic segment, read from app/ (route groups like "(shell)" dropped). */
function staticRoutes(dir = path.join(ROOT, "app"), prefix = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && /^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name)) out.push(prefix || "/");
    if (!e.isDirectory() || e.name.startsWith("[") || e.name.startsWith("_") || e.name.startsWith("@")) continue;
    const seg = /^\(.*\)$/.test(e.name) ? "" : `/${e.name}`;
    out.push(...staticRoutes(path.join(dir, e.name), prefix + seg));
  }
  return out;
}

function run() {
  const sections = load("content/phases", getAllSections);
  const glossaryList = load("content/glossary.json", getGlossary);
  const plan = load("content/plan.json", getPlan);
  const resources = load("content/resources.json", getResources);
  const cases = load("content/case-studies", getCaseStudies);
  const sheets = load("content/cheatsheets", getCheatSheets);
  const guides = load("content/capstone/guide", getCapstoneGuides);
  const breakIt = load("content/capstone/guide/break-it.json", getBreakIt);
  const labs = load("content/labs", getLabs);
  load("cross-file checks (validateAll)", validateAll);
  if (!sections || !glossaryList || !plan || !resources || !cases || !sheets || !guides || !breakIt || !labs) return report({});

  const sectionIds = new Set(sections.map((s) => s.meta.id));
  const glossary = new Set(glossaryList.map((g) => g.slug));
  const simulators = new Map(REGISTRY.map((r) => [r.id, new Set(r.challengeIds)]));
  const simIds = new Set(simulators.keys());
  const caseIds = new Map(cases.map((c) => [c.meta.id, c.rubric !== null]));
  const idx: RouteIndex = {
    staticRoutes: new Set(staticRoutes()),
    lessons: new Map(sections.map((s) => [`${s.meta.phase}/${s.meta.slug}`, headingIds(s.lesson)])),
    phases: new Set(sections.map((s) => s.meta.phase)),
    simulators: simIds,
    labs: new Set(labs.map((l) => l.meta.id)),
    cases: caseIds,
    sheets: new Set(sheets.map((s) => s.slug)),
    capstoneStages: new Set(guides.map((g) => g.meta.stage)),
    glossary,
  };
  const needSection = (where: string, what: string, id: string) => {
    if (!sectionIds.has(id)) err("unknown-section", where, `${what} "${id}" is not a section id`);
  };
  const referencedTerms = new Set<string>();
  const scanMdx = (where: string, mdx: string) => {
    issues.push(...mdxRefIssues(where, mdx, glossary, simIds), ...linkIssues(where, mdx, idx));
    for (const t of componentAttr(mdx, "Term", "slug")) referencedTerms.add(t);
  };
  const scanFile = (file: string) => issues.push(...linkIssues(rel(file), fs.readFileSync(file, "utf8"), idx));

  // Phases: all 7 have sections.
  for (let p = 1; p <= 7; p++) if (!sections.some((s) => s.meta.phase === p)) err("empty-phase", `content/phases/phase-${p}`, `phase ${p} has no sections`);

  // Sections.
  for (const s of sections) {
    const dir = `content/phases/phase-${s.meta.phase}/${s.meta.slug}`;
    const m = s.meta;
    for (const id of m.prerequisites) {
      needSection(`${dir}/meta.json`, "prerequisite", id);
      if (id === m.id) err("unknown-section", `${dir}/meta.json`, "lists itself as a prerequisite");
    }
    for (const id of m.simulatorIds) if (!simIds.has(id)) err("unknown-simulator", `${dir}/meta.json`, `simulatorIds: "${id}" is not in lib/simulators/registry.ts`);
    for (const id of m.practiceCaseStudyIds) {
      if (!caseIds.has(id)) err("unknown-case", `${dir}/meta.json`, `practiceCaseStudyIds: "${id}" is not a case study`);
      else if (!caseIds.get(id)) warn("case-incomplete", `${dir}/meta.json`, `practiceCaseStudyIds: "${id}" has no rubric.json yet, so its page is hidden`);
    }
    issues.push(...sectionStandardIssues({ id: m.id, where: `${dir}/lesson.mdx`, lesson: s.lesson, simulatorIds: m.simulatorIds, quiz: s.quiz, flashcards: s.flashcards, checkpoints: s.checkpoints, resources: s.resources, topicIds: m.topics.map((t) => t.id) }));
    scanMdx(`${dir}/lesson.mdx`, s.lesson);
    for (const f of ["meta.json", "quiz.json", "flashcards.json", "checkpoints.json", "resources.json"]) scanFile(path.join(ROOT, dir, f));
  }

  // Plan: only real sections, cases and simulators; every section is scheduled once.
  const planned = new Map<string, number>();
  const weeks = new Set<number>();
  for (const w of plan) {
    const where = `content/plan.json week ${w.week}`;
    if (weeks.has(w.week)) err("plan", where, `week ${w.week} appears twice`);
    weeks.add(w.week);
    for (const id of w.sectionIds) {
      needSection(where, "sectionIds", id);
      if (planned.has(id)) warn("plan", where, `section "${id}" is also scheduled in week ${planned.get(id)}`);
      planned.set(id, w.week);
    }
    for (const id of w.caseStudyIds) if (!caseIds.has(id)) err("unknown-case", where, `caseStudyIds: "${id}" is not a case study`);
    for (const ref of w.simulatorChallengeIds) {
      const [sim, ch] = ref.split(":");
      if (!simulators.has(sim)) err("unknown-simulator", where, `simulatorChallengeIds: "${sim}" is not in lib/simulators/registry.ts`);
      else if (ch && !simulators.get(sim)!.has(ch)) err("unknown-simulator", where, `simulatorChallengeIds: "${sim}" has no challenge "${ch}"`);
    }
  }
  for (let wk = 1; wk <= 16; wk++) if (!weeks.has(wk)) warn("plan", "content/plan.json", `week ${wk} is missing`);
  for (const s of sections) {
    const wk = planned.get(s.meta.id);
    if (wk === undefined) warn("plan", "content/plan.json", `section "${s.meta.id}" is not scheduled in any week`);
    else if (wk !== s.meta.week) warn("plan", "content/plan.json", `section "${s.meta.id}" is in week ${wk} but its meta.json says week ${s.meta.week}`);
  }
  scanFile(path.join(ROOT, "content/plan.json"));

  // Case studies.
  for (const c of cases) {
    const dir = `content/case-studies/${c.meta.id}`;
    if (!fs.existsSync(path.join(ROOT, dir))) continue; // fixture cases (SDL_FIXTURE_CASES) live elsewhere
    for (const id of c.meta.relatedSectionIds) needSection(`${dir}/meta.json`, "relatedSectionIds", id);
    if (!c.rubric) warn("case-incomplete", dir, "no rubric.json, so /case-studies and /interview hide it");
    if (!c.design) warn("case-incomplete", dir, "no design.json");
    scanMdx(`${dir}/solution.mdx`, c.solution);
    for (const f of ["meta.json", "rubric.json"]) if (fs.existsSync(path.join(ROOT, dir, f))) scanFile(path.join(ROOT, dir, f));
  }

  // Cheat sheets (related sections are already checked by getCheatSheets).
  for (const s of sheets) scanMdx(`content/cheatsheets/${s.slug}.mdx`, s.body);

  // Capstone guides.
  for (const g of guides) {
    const where = `content/capstone/guide/stage-${String(g.meta.stage).padStart(2, "0")}`;
    for (const c of g.meta.concepts) needSection(`${where}.json`, "concepts.sectionId", c.sectionId);
    if (g.meta.folder && !fs.existsSync(path.join(CAPSTONE_DIR, g.meta.folder))) err("capstone", `${where}.json`, `folder "${g.meta.folder}" does not exist`);
    scanMdx(`${where}.mdx`, g.mdx);
    scanFile(path.join(ROOT, `${where}.json`));
  }
  for (const b of breakIt) for (const id of b.concepts) needSection("content/capstone/guide/break-it.json", `${b.id} concepts`, id);
  scanFile(path.join(ROOT, "content/capstone/guide/break-it.json"));

  // Code labs and the simulator registry point at sections.
  for (const l of labs) {
    for (const id of l.meta.sectionIds) needSection(`content/labs/${l.meta.id}/meta.json`, "sectionIds", id);
    issues.push(...linkIssues(`content/labs/${l.meta.id}/explanation.md`, l.explanation, idx));
  }
  for (const r of REGISTRY) for (const id of r.sectionIds) needSection(`lib/simulators/registry.ts (${r.id})`, "sectionIds", id);

  // Glossary and resources.
  const slugs = new Set<string>();
  for (const g of glossaryList) {
    if (slugs.has(g.slug)) err("duplicate-id", "content/glossary.json", `duplicate slug "${g.slug}"`);
    slugs.add(g.slug);
  }
  scanFile(path.join(ROOT, "content/glossary.json"));
  scanFile(path.join(ROOT, "content/resources.json"));
  for (const t of orphanTerms([...slugs], referencedTerms)) warn("orphan-term", "content/glossary.json", `"${t}" is never referenced by a <Term>`);

  return report({ sections: sections.length, caseStudies: cases.length, glossaryTerms: glossaryList.length, planWeeks: plan.length, resources: resources.length, cheatSheets: sheets.length, capstoneStages: guides.length, codeLabs: labs.length, simulators: REGISTRY.length, termRefs: referencedTerms.size });
}

function report(counts: Record<string, number>) {
  const sorted = sortIssues(issues);
  const summary = summarize(sorted);
  const errors = sorted.filter((i) => i.severity === "error").length;
  const warnings = sorted.length - errors;
  if (json) {
    console.log(JSON.stringify({ counts, errors, warnings, summary, issues: sorted }, null, 2));
  } else {
    if (!quiet) {
      // A warning repeated in more than 8 files prints once with a count (use --json for every file).
      const same = new Map<string, Issue[]>();
      for (const i of sorted) if (i.severity === "warning") same.set(`${i.kind}\0${i.message}`, [...(same.get(`${i.kind}\0${i.message}`) ?? []), i]);
      const printed = new Set<string>();
      for (const i of sorted) {
        const group = i.severity === "warning" ? same.get(`${i.kind}\0${i.message}`)! : [i];
        const tag = `${i.severity === "error" ? "ERROR" : "warn "} [${i.kind}]`;
        if (group.length <= 8) console.log(`${tag} ${i.where}: ${i.message}`);
        else if (!printed.has(`${i.kind}\0${i.message}`)) {
          printed.add(`${i.kind}\0${i.message}`);
          console.log(`${tag} ${group.length} files: ${i.message} (first: ${group.slice(0, 3).map((g) => g.where).join(", ")}, ...)`);
        }
      }
    }
    console.log(`\nContent QA: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    for (const sev of ["error", "warning"] as const) {
      const kinds = Object.entries(summary[sev]).map(([k, v]) => `${k} ${v}`).join(", ");
      console.log(`${sev === "error" ? "Errors  " : "Warnings"}: ${sev === "error" ? errors : warnings}${kinds ? ` (${kinds})` : ""}`);
    }
  }
  process.exitCode = errors ? 1 : 0;
}

run();
