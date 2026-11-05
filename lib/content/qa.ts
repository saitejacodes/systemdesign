// Pure checks behind scripts/content-qa.ts (Prompt 23 item 6). No fs, no "server-only": the script loads the content
// with the normal loaders and passes it in, and lib/content/qa.test.ts tests these functions on small inputs.

export type Severity = "error" | "warning";
export interface Issue {
  severity: Severity;
  /** Short machine-readable kind, e.g. "broken-link", "missing-element". Used to group the summary. */
  kind: string;
  /** File or entity the issue is in. */
  where: string;
  message: string;
}

/** Same slug rule as components/learn/LessonRenderer.tsx `slugify` (kept in sync by qa.test.ts). */
export const slugify = (s: string) => s.toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** MDX with fenced and inline code removed, so `<K>` in a code sample is not read as a component. */
export const stripCode = (mdx: string) => mdx.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");

/** Internal links (starting with "/", not "//") from markdown links and href attributes, in MDX or raw JSON text. */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\]\((\/[^)\s]*)(?:\s+"[^"]*")?\)/g)) out.push(m[1]);
  for (const m of text.matchAll(/href=\{?\\?["'](\/[^"'\\]*)\\?["']/g)) out.push(m[1]);
  return out.filter((l) => !l.startsWith("//"));
}

/** Values of `attr` on every `<Component ...>` tag, e.g. componentAttr(mdx, "Simulator", "id"). */
export function componentAttr(mdx: string, component: string, attr: string): string[] {
  const re = new RegExp(`<${component}\\b[^>]*?\\b${attr}=["']([^"']+)["']`, "g");
  return [...stripCode(mdx).matchAll(re)].map((m) => m[1]);
}

/** Ids of the h2/h3 headings as the renderers produce them (markdown link syntax reduced to its text). */
export function headingIds(mdx: string): Set<string> {
  return new Set([...stripCode(mdx).matchAll(/^#{2,3} (.+)$/gm)].map((m) => slugify(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim())));
}

/** Lesson word count, counted the way lib/content/content.test.ts counts it (tags stripped). */
export const wordCount = (mdx: string) => mdx.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

export interface RouteIndex {
  /** Routes with no dynamic segment, from the app/ folder, e.g. "/glossary", "/simulators/code-labs". */
  staticRoutes: ReadonlySet<string>;
  /** "phase/slug" → heading ids of that lesson. */
  lessons: ReadonlyMap<string, ReadonlySet<string>>;
  phases: ReadonlySet<number>;
  simulators: ReadonlySet<string>;
  labs: ReadonlySet<string>;
  /** Case id → whether it has a rubric (only those get /case-studies/[id] and /interview/[id] pages). */
  cases: ReadonlyMap<string, boolean>;
  sheets: ReadonlySet<string>;
  capstoneStages: ReadonlySet<number>;
  glossary: ReadonlySet<string>;
}

/** Why an internal link does not resolve, or null when it does. */
export function checkLink(link: string, idx: RouteIndex): string | null {
  const [beforeHash, hash] = link.split("#", 2);
  const route = beforeHash.split("?")[0].replace(/\/$/, "") || "/";
  const seg = route.split("/").slice(1);
  if (route === "/glossary" && hash) return idx.glossary.has(hash) ? null : `glossary term "${hash}" does not exist`;
  if (idx.staticRoutes.has(route)) return hash ? "anchor on a page without checked anchors" : null;
  const [a, b, c] = seg;
  if (a === "phase" && /^\d+$/.test(b ?? "")) {
    if (seg.length === 2) return idx.phases.has(Number(b)) ? null : `phase ${b} has no sections`;
    if (seg.length !== 3) return "no such route";
    const headings = idx.lessons.get(`${b}/${c}`);
    if (!headings) return `no section /phase/${b}/${c}`;
    return hash && !headings.has(hash) ? `no heading "#${hash}" in /phase/${b}/${c}` : null;
  }
  if (seg.length === 2 && a === "simulators") return idx.simulators.has(b) ? null : `simulator "${b}" is not in lib/simulators/registry.ts`;
  if (seg.length === 3 && a === "simulators" && b === "code-labs") return idx.labs.has(c) ? null : `code lab "${c}" does not exist`;
  if (seg.length === 2 && (a === "case-studies" || a === "interview")) {
    if (!idx.cases.has(b)) return `case study "${b}" does not exist`;
    return idx.cases.get(b) ? null : `case study "${b}" has no rubric.json, so /${a}/${b} is a 404`;
  }
  if (seg.length === 2 && a === "reference") return idx.sheets.has(b) ? null : `cheat sheet "${b}" does not exist`;
  if (seg.length === 2 && a === "capstone") return /^\d+$/.test(b) && idx.capstoneStages.has(Number(b)) ? null : `capstone stage "${b}" does not exist`;
  // Designs live in the browser, so any /studio/<id> renders (and /studio/new creates one).
  if (seg.length === 2 && a === "studio") return null;
  return "no such route";
}

/** Link issues for one file's text. */
export function linkIssues(where: string, text: string, idx: RouteIndex): Issue[] {
  const out: Issue[] = [];
  for (const link of extractLinks(text)) {
    const why = checkLink(link, idx);
    if (why) out.push({ severity: "error", kind: "broken-link", where, message: `${link}: ${why}` });
  }
  return out;
}

/** <Term slug> and <Simulator id> references in one MDX file. */
export function mdxRefIssues(where: string, mdx: string, glossary: ReadonlySet<string>, simulators: ReadonlySet<string>): Issue[] {
  const out: Issue[] = [];
  for (const slug of componentAttr(mdx, "Term", "slug")) if (!glossary.has(slug)) out.push({ severity: "error", kind: "unknown-term", where, message: `<Term slug="${slug}"> is not in content/glossary.json` });
  for (const id of componentAttr(mdx, "Simulator", "id")) if (!simulators.has(id)) out.push({ severity: "error", kind: "unknown-simulator", where, message: `<Simulator id="${id}"> is not in lib/simulators/registry.ts` });
  return out;
}

export interface SectionInput {
  id: string;
  where: string;
  lesson: string;
  simulatorIds: string[];
  quiz: { id: string; type: string; topicId: string }[];
  flashcards: { id: string; topicId: string }[];
  checkpoints: { id: string; topicId: string }[];
  resources: { id: string }[];
  topicIds: string[];
}

/** The §7 Content Standard, as lessons are actually written (see any content/phases/<phase>/<slug>/lesson.mdx). */
export function sectionStandardIssues(s: SectionInput): Issue[] {
  const out: Issue[] = [];
  const err = (kind: string, message: string) => out.push({ severity: "error", kind, where: s.where, message });
  const warn = (kind: string, message: string) => out.push({ severity: "warning", kind, where: s.where, message });
  const body = stripCode(s.lesson);
  const has = (re: RegExp) => re.test(body);
  const count = (re: RegExp) => (body.match(re) ?? []).length;

  // Elements: missing one is an error.
  const required: [string, RegExp][] = [
    ["## Why it matters", /^## Why it matters\s*$/m],
    ["<DepthStamp>", /<DepthStamp\b/],
    ["<TradeoffBox>", /<TradeoffBox\b/],
    ["<NotWhenBox>", /<NotWhenBox\b/],
    ["common misconceptions (<Misconception>)", /<Misconception\b/],
    ["interview angle", /<InterviewAngle\b|^## Interview angle/m],
    ["<CheckpointList />", /<CheckpointList\b/],
    ["<QuizPlayer />", /<QuizPlayer\b/],
    ["<FlashcardDeck />", /<FlashcardDeck\b/],
    ["<ResourceList />", /<ResourceList\b/],
  ];
  for (const [name, re] of required) if (!has(re)) err("missing-element", `lesson has no ${name}`);
  const embedded = componentAttr(s.lesson, "Simulator", "id");
  if (s.simulatorIds.length && !embedded.length) err("missing-element", `meta.json lists simulators (${s.simulatorIds.join(", ")}) but the lesson embeds none`);

  // Softer parts of the standard: warnings.
  if (!has(/worked example|^#{2,4} .*example/im)) warn("standard", "no worked example heading or label");
  if (!has(/<Figure\b|<Diagram\b/) && !/^```mermaid/m.test(s.lesson)) warn("standard", "no diagram or figure");
  const mis = count(/<Misconception\b/g);
  if (mis && (mis < 2 || mis > 4)) warn("standard", `${mis} misconceptions (standard: 2–4)`);
  // Practice links (item 12) are rendered by the lesson page from meta.practiceCaseStudyIds, so the MDX needs none.
  for (const id of s.simulatorIds) if (!embedded.includes(id)) warn("standard", `meta.json simulator "${id}" is not embedded in the lesson`);
  const order = ["<CheckpointList", "<QuizPlayer", "<FlashcardDeck", "<ResourceList"].map((t) => body.indexOf(t)).filter((i) => i >= 0);
  if (order.some((v, i) => i > 0 && v < order[i - 1])) warn("standard", "CheckpointList / QuizPlayer / FlashcardDeck / ResourceList are out of §7 order");
  // Concept H2s (any H2 that is not a fixed part of the page) should each carry a DepthStamp.
  const fixed = /^(why it matters|common misconceptions|interview angle|try it|practice|worked example|summary|recap|key takeaways|further reading)/i;
  const h2s = [...body.matchAll(/^## (.+)$/gm)];
  h2s.forEach((m, i) => {
    if (fixed.test(m[1].trim()) || /worked example/i.test(m[1])) return;
    const chunk = body.slice(m.index!, h2s[i + 1]?.index ?? body.length);
    if (!/<DepthStamp\b/.test(chunk)) warn("standard", `H2 "${m[1].trim()}" has no DepthStamp`);
  });

  // Volume targets: warnings.
  const range = (what: string, n: number, lo: number, hi: number) => {
    if (n < lo || n > hi) warn("volume", `${what}: ${n} (target ${lo}–${hi})`);
  };
  range("lesson words", wordCount(s.lesson), 1500, 3500);
  range("quiz questions", s.quiz.length, 8, 12);
  const scen = s.quiz.filter((q) => q.type === "scenario").length;
  if (scen < 3) warn("volume", `scenario questions: ${scen} (target ≥3)`);
  range("flashcards", s.flashcards.length, 10, 20);
  range("checkpoints", s.checkpoints.length, 3, 6);
  range("resources", s.resources.length, 2, 4);

  // Data integrity: errors.
  const topics = new Set(s.topicIds);
  for (const [file, items] of [["quiz.json", s.quiz], ["flashcards.json", s.flashcards], ["checkpoints.json", s.checkpoints], ["resources.json", s.resources]] as const) {
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) err("duplicate-id", `${file}: duplicate id "${it.id}"`);
      seen.add(it.id);
      if ("topicId" in it && !topics.has(it.topicId)) err("unknown-topic", `${file}: ${it.id} has topicId "${it.topicId}", not a topic in meta.json`);
    }
  }
  return out;
}

/** Glossary slugs never referenced by any <Term slug> (warnings). */
export function orphanTerms(glossary: string[], referenced: ReadonlySet<string>): string[] {
  return glossary.filter((g) => !referenced.has(g));
}

/** Errors before warnings, then by where. */
export const sortIssues = (issues: Issue[]) =>
  [...issues].sort((a, b) => (a.severity === b.severity ? a.where.localeCompare(b.where) || a.kind.localeCompare(b.kind) : a.severity === "error" ? -1 : 1));

/** Counts per severity and kind, e.g. { error: { "broken-link": 2 }, warning: { volume: 5 } }. */
export function summarize(issues: Issue[]): Record<Severity, Record<string, number>> {
  const out: Record<Severity, Record<string, number>> = { error: {}, warning: {} };
  for (const i of issues) out[i.severity][i.kind] = (out[i.severity][i.kind] ?? 0) + 1;
  return out;
}
