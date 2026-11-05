# SysDesign Lab: Project Bible

## 1. Mission
SysDesign Lab is a single website where a backend engineer (0–4 yrs experience) learns,
practices, simulates and self-tests ALL of system design over a 16-week plan, without
needing any other website. Every concept is learned by DOING: interactive simulators,
sandboxes, quizzes, flashcards and timed design practice.

## 2. Tech Stack (fixed: do not substitute without asking)
- Next.js (latest stable, 15 or newer, App Router), React 19, TypeScript (strict mode)
- Tailwind CSS v4, shadcn/ui components (restyled to §5), lucide-react icons
- MDX via next-mdx-remote or @next/mdx for lessons; JSON for structured data
- shiki (code highlighting) and mermaid (lesson diagrams, lazy-loaded)
- Zustand (UI + session state), Dexie (IndexedDB) for all persisted user data
- React Flow (@xyflow/react) for diagrams, canvases, node-based simulators
- Framer Motion for animation; Recharts for live metric charts
- Monaco Editor (@monaco-editor/react) for code editing
- PGlite (@electric-sql/pglite) for in-browser Postgres
- Pyodide for in-browser Python (loaded lazily from CDN, only on sandbox pages)
- FlexSearch (or MiniSearch) for client-side full-text search
- Vitest for unit tests, Playwright (+ @axe-core/playwright) for end-to-end tests
- Added by later prompts: JSZip (Prompt 22 capstone download), Serwist or an equivalent
  maintained service-worker tool (Prompt 23)
- No backend in v1. All data local to the browser.
- Package manager: pnpm

## 3. Folder Structure
/app                    → routes (App Router)
  /(learn)/phase/[phase]/[section]/page.tsx
  /simulators/[id]/page.tsx, /simulators/code-labs, /simulators/code-labs/[labId]
  /studio, /studio/[designId], /interview/[caseId]
  /case-studies, /case-studies/[id]
  /flashcards, /plan, /today, /dashboard, /search, /glossary
  /reference, /reference/[sheet], /resources, /capstone, /settings, /about
/components
  /ui                   → shadcn primitives, restyled to the Field Manual tokens
  /brand                → FigureCaption, NumberedCallout, PartsList, SpecLabel, HudBar,
                          PhasePath, DepthStamp (see §5)
  /layout               → Sidebar, TopBar, RightPanel, ThemeToggle
  /learn                → LessonRenderer, CheckpointList, QuizPlayer, FlashcardDeck,
                          TradeoffBox, NotWhenBox, ResourceList, Callout
  /sim                  → SimulatorShell + shared simulator UI
  /studio               → Design Studio components
/content
  /phases/phase-1/<section-slug>/
      meta.json, lesson.mdx, quiz.json, flashcards.json,
      checkpoints.json, resources.json
  /case-studies/<id>/  meta.json, solution.mdx, design.json, rubric.json
  /glossary.json, /plan.json, /cheatsheets/*.mdx, /resources.json
/design                 → exported Field Manual designs: tokens.json, screenshots, notes.md
/lib
  /content              → loaders, validators (zod), search index builder
  /db                   → Dexie schema + repository layer (StorageAdapter interface)
  /learning             → sm2.ts, progress.ts, weakspots.ts, streaks.ts
  /sim                  → engine core (rng, clock, event queue, metrics)
  /simulators/<id>/     → model.ts (pure logic), view.tsx, config.ts, challenges.ts,
                          model.test.ts
  /studio               → graph model, traffic simulation, SPOF analysis
  /ai                   → provider-agnostic client using the user's API key
/scripts                → dev scripts: content QA (Prompt 23), optional AI proxy (Prompt 21)
/tests/e2e              → Playwright specs
/tests/fixtures         → test-only content (e.g. a fixture case study)

## 4. Data Schemas (TypeScript, validated with zod at build time)
type Depth = "deep" | "tradeoffs" | "awareness";

interface SectionMeta {
  id: string;                 // "p2-sharding"
  phase: 1|2|3|4|5|6|7;
  slug: string;               // "sharding"
  title: string;
  order: number;
  week: number;               // 1–16
  estimatedMinutes: number;
  topics: { id: string; title: string; depth: Depth }[];
  simulatorIds: string[];
  practiceCaseStudyIds: string[];
  prerequisites: string[];    // section ids
}

interface QuizQuestion {
  id: string;
  type: "single" | "multi" | "scenario";
  prompt: string;             // markdown allowed
  scenario?: string;          // for scenario type
  options: { id: string; text: string }[];
  correct: string[];          // option ids
  explanation: string;        // why correct is correct AND why each distractor is wrong
  topicId: string;
  difficulty: 1|2|3;
}

interface Flashcard { id: string; front: string; back: string; topicId: string; }

interface Checkpoint { id: string; text: string; topicId: string; }

interface Resource {
  id: string; title: string; author?: string;
  kind: "book"|"free-book"|"docs"|"blog"|"paper"|"video"|"repo";
  url: string; why: string; topicIds: string[]; free: boolean;
}

interface GlossaryTerm { term: string; slug: string; definition: string; sectionId: string; }

// Persisted user data (Dexie tables)
CheckpointState   { checkpointId, done: boolean, updatedAt }
SectionCompletion { sectionId, completedAt }   // never removed when content changes
QuizAttempt       { id, sectionId, score, total, answers, startedAt, finishedAt }
CardState         { cardId, ease, interval, repetitions, due: ISODate, lapses }
ChallengeResult   { simulatorId, challengeId, passed, bestValue, attempts, updatedAt }
Note              { id, pageId, markdown, updatedAt }
Design            { id, title, caseStudyId?, graph (React Flow JSON), panels, createdAt, updatedAt }
InterviewAttempt  { id, caseStudyId, durationSec, panels, selfScores, aiFeedback?, createdAt }
StudySession      { id, date, minutes, pageIds }
TutorConversation { id, pageId, messages, updatedAt }          // Prompt 21
AiUsage           { month, requests, inputTokens, outputTokens, estimatedCost } // Prompt 21
Settings          { theme, apiKey?, aiProvider?, aiModel?, reducedMotion }

All DB access goes through a StorageAdapter interface in /lib/db so a remote backend can
replace Dexie later without touching components. Settings.apiKey is never included in
data exports.

## 5. Design System: "Field Manual"
The approved designs from Claude Design are the source of truth. Export them (tokens,
components, screens) into /design: tokens.json, screenshots per screen, and notes.md.
Match them closely; when a detail is missing, follow these rules:
- Concept: an engineering field manual / blueprint for distributed systems.
- Themes: "Paper" (warm off-white, ink black, cobalt accent) and "Blueprint" (deep navy,
  chalk lines). Implement tokens as CSS variables from /design/tokens.json.
- Phase colors: 1 sage, 2 lime, 3 coral, 4 plum, 5 lavender, 6 cobalt, 7 charcoal.
- Type: heavy grotesk display (Archivo) in sentence case, no trailing periods, light
  negative tracking only at display sizes; clean sans body (17–18px, line-height 1.6);
  sans labels and captions in sentence case; monospace only for data: metrics, numbers
  with units, code, paths and the HUD. (Revised 2026-11-05 at the user's request: the
  italic serif accent word and uppercase tracked labels were retired.)
- Signature components (build in /components/brand): FigureCaption, NumberedCallout,
  PartsList, SpecLabel, HudBar, PhasePath (the 7 phases as climbing isometric steps, SVG),
  DepthStamp (DEEP / TRADEOFFS / AWARENESS).
- Style: structural lines in the rule colour (48% ink), full ink only on controls; 2–4px
  radius; no soft shadows and no offset slabs; drafting grid only in heroes and simulator
  canvases (crosshair marks only in simulator canvases).
- No decoration that pretends to be data or a document: no FIG / sheet / revision codes,
  no § numbering, no eyebrow above every heading, no made-up telemetry. Details carry
  system meaning instead: the cursor (a request packet; wired to a node over controls),
  a packet running along link underlines, lessons as nodes on a phase pipeline, loading
  as a request in flight, errors as log lines, 404 as an HTTP status.
- Motion: diagrams assemble on first view, callout lines draw in, request dots travel;
  150–400ms; all disabled under prefers-reduced-motion.
- Simulator canvases are drawn like technical drawings: isometric blocks, leader-line
  labels, mono metrics.
- Status colors always paired with text (OK / Hot / Overloaded).
- Accessibility rules from before still apply (WCAG 2.1 AA, keyboard, focus, aria).

## 6. Simulator Standard (every simulator MUST follow)
- Logic in a PURE model.ts (no React), deterministic given a seed. View is separate.
- Uses the shared SimulatorShell: Controls panel, Canvas, Live Metrics, Event Log,
  "Break it" menu, Challenges panel, Play/Pause/Step/Reset, speed 0.25×–4×, seed input.
- Has a "What this models / What it simplifies" info drawer.
- Has 2–4 Challenges, each with a machine-checkable win condition.
- Has a "Guided tour" (3–6 steps) that walks a first-time user through it.
- Has unit tests (model.test.ts) covering core logic and at least one failure scenario.
- Runs at 60fps for its default configuration on a mid-range laptop.

## 7. Content Standard (every section MUST follow)
Lesson.mdx order:
 1. Why it matters (real-world hook, 1 short paragraph, a real company example if accurate)
 2. Concept lessons, one H2 per topic, each with a DepthStamp. Use inline diagrams
    (SVG or Mermaid rendered client-side) wherever structure matters, each with a
    FigureCaption.
 3. Worked example(s) with real numbers
 4. <TradeoffBox> and <NotWhenBox>
 5. Common misconceptions (2–4)
 6. Interview angle: how this topic shows up in interviews, typical follow-up questions
 7. Embedded simulator(s) via <Simulator id="..." />
 8. <CheckpointList /> (from checkpoints.json)
 9. <QuizPlayer /> (from quiz.json)
 10. <FlashcardDeck /> (from flashcards.json)
 11. <ResourceList /> (from resources.json)
 12. Practice link to Design Studio / case study
Volume targets per section: lesson 1,500–3,500 words; quiz 8–12 questions
(≥3 scenario-type); 10–20 flashcards; 3–6 checkpoints; 2–4 resources.
Rules:
- Technically accurate. Where the field genuinely disagrees, say so and explain both sides.
- Plain, direct language. Define every term on first use and add it to glossary.json.
- Never fabricate statistics, quotes, or URLs. Only link resources you are confident exist;
  if unsure of an exact URL, link the publisher or author homepage.
- No placeholder text anywhere, ever.

## 8. Definition of Done (applies to every prompt)
- pnpm typecheck, pnpm lint, pnpm test, pnpm build all pass with zero errors
- New routes covered by a Playwright smoke test (page loads, no console errors)
- Works in both themes (Paper and Blueprint) and at 375px width
- No placeholder content; content passes zod validation
- A short summary in CHANGELOG.md: what was built, how to verify it

## 9. Working Rules for the AI
- Read CLAUDE.md and CHANGELOG.md at session start.
- Never rewrite working code outside the prompt's scope without asking.
- If a requirement is ambiguous, choose the simplest option consistent with this file
  and note the decision in DECISIONS.md.
- After finishing, report: what was built, how to run/verify, known limitations.
- In long prompts, print a "Next: <item>" marker after each finished item so a later
  session can resume from it (see U7).

## 10. Curriculum Map (phases ↔ weeks)
Phase 1  Foundations & Networking             weeks 1–2   (Prompts 06–07)
Phase 2  APIs, Databases, Storage & Search    weeks 3–6   (Prompts 08–09)
Phase 3  Caching & Messaging                  weeks 7–8   (Prompts 10–11)
Phase 4  Distributed Systems & Reliability    weeks 9–10  (Prompts 12–13)
Phase 5  Observability, Security, Deployment  weeks 11–12 (Prompt 14)
Phase 6  Advanced & AI-Native Systems         week 13     (Prompt 15)
Phase 7  Interview Mastery                    weeks 14–16 (Prompt 20d; uses case studies
                                                            from Prompts 20a–c)
The sidebar shows all 7 phases in this order. The 7-step interview framework
(Requirements, Estimation, API, Data Model, High-Level Design, Deep Dives, Wrap-up)
is taught in full in Phase 7 and used by Design Studio notes and Interview Mode.
