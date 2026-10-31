# SysDesign Lab: The Prompt Book

Oct 31, 2026

## How to use this book

This book has 28 build prompts and 8 utility prompts. Paste them in order into Claude Code (Opus), one prompt per session. When you finish, you'll have SysDesign Lab: one website with lessons, 29 simulators, coding labs, a design canvas, mock interviews and a 16-week plan.

1. **Prompt 00 is the Project Bible.** Have Claude save it as `CLAUDE.md` at the repo root. Every later prompt points back to it, so standards stay the same across sessions.
2. **Run prompts in order.** Each one builds on the ones before it.
3. **One prompt per session.** Start each new session with **U1 (Resume)**, then paste the next build prompt.
4. **Don't move on until the prompt's Definition of Done passes.** Run the app yourself and click through it.
5. **Commit after every prompt** (`git commit -m "Prompt 07 done"`) so you can roll back.
6. **Content prompts are long on purpose.** If Claude stops partway, paste **U7 (Continue)**.

### What changed from the first draft

- Phase 7 (Interview Mastery, weeks 14–16) is now defined. The old draft promised 7 phases but only wrote 6. It gets its own content prompt, **20d**.
- The 7-step interview framework now lives in Phase 7. Phase 1's estimation section only teaches estimation.
- The Project Bible has a new §10 that maps phases to weeks, so every prompt agrees on the curriculum.
- Two new utility prompts: **U7 Continue** and **U8 Weekly Study Check-in**.
- **Fix 1:** Prompt 07 can now pass its own Definition of Done. S4 and S5 are embedded in load-balancers for now, and Prompt 08 moves them into their own Phase 2 sections.
- **Fix 2:** Every long prompt now uses the same "Next:" resume marker, and U7 resumes from the last marker.
- **Fix 3:** The Isolation Lab in Prompt 09 is now always a simulated MVCC engine in TypeScript, with tested Postgres behavior for three isolation levels.
- **Fix 4:** Progress never goes backwards. A new `SectionCompletion` table keeps completed sections complete when simulators are added later (Bible §4, Prompt 03).
- **Fix 5:** New Prompt 24 (Deploy) is the last build prompt. The build prompt count is now 28 (the old "25" was wrong even before this).
- **Fix 6:** Prompts 21–23 and U1–U8 were reviewed against the rest of the book. The Bible now lists the extra libraries, the `/scripts` folder, the `/about` route and the AI data tables. The API key is kept out of exports. Resource filters match the schema, and U3 and U6 now cover all 7 phases and the case studies. Prompt 24 uses Next's current static-export setting (output: 'export'), because the old \`next export\` command no longer exists.

* **Design system:** Bible §5 is now the "Field Manual" design system, exported from Claude Design into `/design`. Prompt 01 builds the shell, layout and landing page from `/design`, with PhasePath (the curriculum as 7 climbing isometric steps, one shape per phase) as the landing-page hero. Prompts 02–05, 17, 19 and 23 point at the matching screens.

### Prompt map

| # | Prompt | What it builds |
| --- | --- | --- |
| 00 | Project Bible | Standards, schemas, folder structure, phase map |
| 01 | Scaffold & App Shell | Layout, themes, routes, shortcuts |
| 02 | Content System | MDX pipeline, search, glossary, sample lesson |
| 03 | Learning Engine | Checkpoints, quizzes, SM-2 flashcards, notes, progress |
| 04 | Plan & Dashboard | 16-week plan, Today page, stats, backup |
| 05 | Simulator Framework | Shared engine every simulator uses |
| 06–07 | Phase 1 | 12 sections + 5 simulators (S1–S5) |
| 08–09 | Phase 2 | 18 sections + 4 simulators (S6–S9, incl. SQL sandbox) |
| 10–11 | Phase 3 | 13 sections + 4 simulators (S10–S13) |
| 12–13 | Phase 4 | 15 sections + 9 simulators (S14–S22) |
| 14 | Phase 5 | 14 sections + 4 simulators (S23–S26) |
| 15 | Phase 6 | 12 sections + 2 simulators (S27–S28) |
| 16 | Algorithm Sandboxes | 15 Python coding labs (S29) |
| 17–19 | Design Studio | Canvas, traffic simulation, interview mode |
| 20a–c | Case Studies | 15 full reference designs |
| 20d | Phase 7 | 8 Interview Mastery sections |
| 21 | AI Features | Tutor, AI interviewer (bring your own key) |
| 22 | Reference Library | Cheat sheets, resources, capstone |
| 23 | Polish & QA | Accessibility, performance, full test |
| 24 | Deploy | Public site, CI, production checks |
| U1–U8 | Utilities | Resume, bug fix, review, extend, audit, continue, check-in |

### Progress tracker

- [ ] 00 Project Bible
- [ ] 01 Scaffold & App Shell
- [ ] 02 Content System
- [ ] 03 Learning Engine
- [ ] 04 Plan & Dashboard
- [ ] 05 Simulator Framework
- [ ] 06 Phase 1 Content
- [ ] 07 Phase 1 Simulators
- [ ] 08 Phase 2 Content
- [ ] 09 Phase 2 Simulators + SQL Sandbox
- [ ] 10 Phase 3 Content
- [ ] 11 Phase 3 Simulators
- [ ] 12 Phase 4 Content
- [ ] 13 Phase 4 Simulators
- [ ] 14 Phase 5 Content + Simulators
- [ ] 15 Phase 6 Content + Simulators
- [ ] 16 Algorithm Sandboxes
- [ ] 17 Design Studio: Canvas
- [ ] 18 Design Studio: Run Mode
- [ ] 19 Interview Mode
- [ ] 20a Case Studies 1–5
- [ ] 20b Case Studies 6–10
- [ ] 20c Case Studies 11–15
- [ ] 20d Phase 7 Interview Mastery
- [ ] 21 AI Features
- [ ] 22 Reference Library & Capstone
- [ ] 23 Polish & QA
- [ ] 24 Deploy

## Foundation prompts (00–05)

These six prompts build the skeleton: standards, app shell, content pipeline, learning engine, study plan and simulator engine. After them, the app works but has only one lesson. Before Prompt 01, finish and export the "Field Manual" designs into `/design` (see §5).

### Prompt 00: Project Bible

```markdown
Create a file named CLAUDE.md at the repository root with EXACTLY the content below
(fix only obvious typos). This file is the permanent source of truth for the project.
Read it at the start of every future session. Do not write any app code in this session.

---
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
- Type: heavy grotesk display; one italic serif cobalt word per headline; clean sans body
  (17–18px, line-height 1.6); uppercase wide-tracked monospace for labels, captions,
  metrics, tables and HUD.
- Signature components (build in /components/brand): FigureCaption, NumberedCallout,
  PartsList, SpecLabel, HudBar, PhasePath (the 7 phases as climbing isometric steps, SVG),
  DepthStamp (DEEP / TRADEOFFS / AWARENESS).
- Style: hairline borders, 2–4px radius, no soft shadows (hard offset shadows allowed),
  drafting grid and crosshair marks only in heroes and simulator canvases.
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
---

After creating the file, also create empty CHANGELOG.md and DECISIONS.md,
then stop and confirm.
```

### Prompt 01: Scaffold & App Shell

```markdown
Read CLAUDE.md, especially §5. Task: scaffold the project and build the app shell.
No curriculum content yet.

0. Check that /design exists with tokens.json, screenshots and notes.md. If it is
   missing, stop and ask for the Field Manual export. The app shell, landing page and
   layout must follow /design; read notes.md and look at every screenshot first.
1. Initialize Next.js (App Router, TypeScript strict, Tailwind v4, ESLint) with pnpm.
   Install every dependency listed in CLAUDE.md §2. Set up shadcn/ui and restyle it to
   the Field Manual tokens (hairline borders, 2–4px radius, no soft shadows).
2. Create the full folder structure from CLAUDE.md §3 (empty index files where needed).
3. Generate CSS variables for both themes (Paper and Blueprint) from /design/tokens.json.
   Load the fonts named in tokens.json (display grotesk, italic serif accent, body sans,
   mono) with next/font. ThemeToggle in the TopBar with three options:
   Paper / Blueprint / System. Persist choice.
4. Build the brand components in /components/brand that the shell needs now:
   FigureCaption, NumberedCallout, PartsList, SpecLabel, HudBar, PhasePath (SVG,
   7 isometric steps rising from Phase 1 to Phase 7, each with its phase shape and a
   numbered callout) and DepthStamp. Each matches /design and has a Vitest render test.
   Motion: steps rise in order and callout lines draw in (150–400ms); none under
   prefers-reduced-motion.
5. Build the layout to match the /design screens:
   - Sidebar: wordmark "SysDesign Lab", nav groups: Today, Plan, Learn (curriculum tree:
     the 7 phases from CLAUDE.md §10 as numbered layers in their phase colors,
     collapsible, placeholder section names allowed ONLY in the tree for now, read from
     a temporary nav config), Simulators, Design Studio, Case Studies, Flashcards,
     Reference, Resources, Capstone, Dashboard, Settings.
     Collapsible to icon-only. On <1024px becomes a slide-in drawer.
   - TopBar: breadcrumb, global search trigger (⌘K / Ctrl+K opens a command palette,
     empty results for now), theme toggle, right-panel toggle.
   - RightPanel: tabs "Notes" and "AI Tutor" (both show "Coming in a later step" stubs:
     this is the ONLY allowed stub). Collapsible, width resizable, state persisted.
   - HudBar footer on every page (mono strip with live context; static values for now).
6. Create every route from §3 as a minimal page with correct title and breadcrumb.
7. Keyboard shortcuts: ⌘/Ctrl+K search, [ toggle sidebar, ] toggle right panel,
   ? opens a shortcuts help dialog listing all shortcuts.
8. Landing page (/), matching the /design landing screen: PhasePath is the hero
   (hovering a callout shows its phase name); FigureCaption
   "FIG. 0 · ONE PATH · 7 PHASES · 16 WEEKS"; headline "You design it. Then you
   break it." with "break" as the italic serif cobalt word; subtext; primary button
   "Start week 1 →" linking to /today and secondary "Open a simulator" linking to
   /simulators; a PartsList "CURRICULUM" of the 7 phases with week ranges; scroll
   sections for how it works, a simulator preview, a Design Studio preview and the
   16-week timeline. Drafting grid and crosshairs only in the hero.
9. Set up Vitest and Playwright. Add one Playwright test that visits every route
   in both themes and asserts no console errors.
10. Add scripts: dev, build, typecheck, lint, test, test:e2e.

Definition of Done: CLAUDE.md §8, and the landing page, shell and layout visibly match
the /design screenshots at 1440px and 390px in both themes. Report what you built and
how to verify.
```

### Prompt 02: Content System, Search & Glossary

```markdown
Read CLAUDE.md. Task: build the content pipeline that every lesson will use.

1. Zod schemas for every content type in CLAUDE.md §4 in /lib/content/schemas.ts.
2. Loaders in /lib/content:
   - getAllSections(), getSection(phase, slug), getSectionsByPhase(phase)
   - getCaseStudies(), getCaseStudy(id), getGlossary(), getResources(), getPlan()
   - Validate every file at build time; a malformed file must FAIL the build with a
     clear message naming the file and field.
3. The sidebar curriculum tree now reads from real content (meta.json files),
   ordered by phase and order. Remove the temporary nav config. Phases with no
   sections yet show as "Coming soon".
4. MDX rendering with these custom components (build all of them now, styled per §5):
   - <DepthStamp depth="deep|tradeoffs|awareness" /> (from /components/brand)
   - <Figure caption="..."> wrapping diagrams with a FigureCaption
   - <Callout type="info|warning|tip|example">
   - <TradeoffBox> with props: items {gain, cost}[]
   - <NotWhenBox> with a list of situations
   - <Misconception wrong="..." right="..." />
   - <InterviewAngle> with questions list
   - <Diagram> that renders Mermaid client-side (lazy-loaded) with theme support
   - <Term slug="..."> that shows the glossary definition on hover/focus and links
     to /glossary#slug
   - <Simulator id="..." />: placeholder card for now saying the simulator name
     and linking to /simulators/[id] (it will embed real simulators later)
   - <CheckpointList />, <QuizPlayer />, <FlashcardDeck />, <ResourceList />:
     render static content for now (interactivity comes in Prompt 03)
   - Code blocks with syntax highlighting (shiki) and a copy button
5. Section page layout (match the /design lesson screen): title, phase/week badge,
   estimated time, topic list with depth stamps, table of contents (sticky on desktop),
   lesson, prev/next section navigation, HudBar with section number and reading time.
   No drafting grid behind lesson text.
6. Search: build a FlexSearch/MiniSearch index at build time over lessons (by heading),
   glossary, flashcards, case studies, resources. Wire it to the ⌘K palette and /search
   page with grouped results and keyboard navigation.
7. /glossary page: alphabetical, A–Z jump bar, filter box, each term links to its section.
8. Create ONE complete sample section to prove the pipeline: phase-1 "client-server",
   following the Content Standard §7 fully (real content, full quiz, flashcards etc.).

Definition of Done: CLAUDE.md §8, plus a unit test proving a malformed quiz.json fails validation.
```

### Prompt 03: Learning Engine

```markdown
Read CLAUDE.md. Task: make all learning components interactive and persisted.

1. Dexie database per CLAUDE.md §4 with versioned schema and a StorageAdapter interface
   (/lib/db/adapter.ts) plus DexieAdapter implementation. All components use hooks
   (useCheckpoints, useQuizAttempts, useCards, useNotes...) built on the adapter.
2. CheckpointList: checkbox per item, persisted, shows "3/5 done", section marked
   "complete" when all checkpoints done AND best quiz score ≥ 80% (write a
   SectionCompletion row with completedAt the first time this happens).
3. QuizPlayer:
   - One question at a time, progress bar, supports single, multi, scenario types.
   - After answering: show correct/incorrect, the explanation, and why each wrong option
     is wrong. Then "Next".
   - End screen: score, per-topic breakdown, "Retry wrong only", "Retry all".
   - Shuffle options each attempt (stable ids). Save QuizAttempt.
4. Flashcards with SM-2:
   - Implement SM-2 in /lib/learning/sm2.ts exactly: grades 0–5 mapped to buttons
     Again(1) Hard(3) Good(4) Easy(5); ease starts 2.5, min 1.3;
     EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02));
     if q < 3: repetitions=0, interval=1; else rep1→1 day, rep2→6 days,
     then interval = round(interval × EF). Unit test it thoroughly.
   - FlashcardDeck in lessons: browse mode (flip, next/prev, "add all to review").
   - /flashcards page: daily review queue across all sections (due today), counts of
     new/learning/review, filter by phase, keyboard: Space flip, 1–4 grade.
   - Daily new-card limit setting (default 20).
5. Notes: RightPanel "Notes" tab gets a markdown editor (Monaco or textarea + preview)
   tied to the current page id; autosave (debounced 500ms). /dashboard lists all notes;
   notes are included in global search.
6. Progress: /lib/learning/progress.ts computes per-section, per-phase and overall %
   (weights: checkpoints 40%, best quiz 40%, simulator challenges 20%; if a section has
   no simulator, split 50/50 between checkpoints and quiz).
   A section's simulator weight only applies once at least one simulator for that section
   is registered. When a simulator is added later, sections the learner already completed
   stay marked complete (store a completedAt timestamp); show their new challenge as a
   'New: try the simulator' badge instead of lowering their percentage.
   Sidebar shows progress per phase on its numbered layer and checkmarks per completed
   section.
7. Weak spots (/lib/learning/weakspots.ts): topics where quiz accuracy < 70% over the
   last 2 attempts, or sections with checkpoints untouched for 14+ days after their week.

Definition of Done: CLAUDE.md §8. Unit tests for sm2, progress (including the
"simulator added after completion" case), weakspots.
```

### Prompt 04: 16-Week Plan, Today, Dashboard, Backup

```markdown
Read CLAUDE.md. Task: build the study-planning layer. Match the /design Today and
Dashboard screens.

1. content/plan.json: 16 weeks. Each week: number, title, focus, sectionIds,
   simulatorChallengeIds, caseStudyIds, deliverable text, estimatedHours.
   Use this schedule (it matches CLAUDE.md §10):
   W1 Foundations + estimation | W2 Networking | W3 APIs + rate limiting |
   W4 DB I: modeling, indexing, transactions | W5 DB II: replication, sharding,
   consistent hashing | W6 Storage & search | W7 Caching | W8 Messaging |
   W9 Distributed systems | W10 Reliability | W11 Observability + security |
   W12 Deployment + capstone build | W13 Advanced + AI-native |
   W14 Interview framework + case studies 1–7 |
   W15 Case studies 8–15 + mock interviews |
   W16 Weak spots + mock interviews
   (Section ids can reference sections not yet written; render them as "Coming soon"
   links until they exist.)
2. Settings: "Plan start date" (default: first visit), "Hours per week" (default 8).
3. /plan: 16 week cards (timeline), current week highlighted, each shows progress and
   its items with checkmarks. Click a week to expand.
4. /today: computes the current week from the start date and shows, in order:
   (a) flashcards due today (count + "Review" button),
   (b) the next unfinished lesson in this week,
   (c) the next unfinished simulator challenge,
   (d) weak-spot suggestion (from weakspots.ts),
   (e) this week's deliverable.
   If the learner is behind, show a gentle "catch-up" banner with what to prioritize.
5. Study time tracking: count active minutes on learning pages (visible + interaction
   in the last 60s), saved as StudySession.
6. Streaks: consecutive days with ≥ 10 active minutes.
7. /dashboard: overall progress, per-phase bars in phase colors, quiz accuracy over time
   (Recharts, styled as plotted technical graphs with mono axes), flashcards reviewed per
   day, minutes per day (last 30 days), streak, weak spots, recent notes, interview
   attempts list.
8. Backup: Settings → "Export all data" (single JSON file of every Dexie table, versioned;
   never include Settings.apiKey) and "Import data" (validates, previews counts, asks
   merge or replace). "Reset all progress" with typed confirmation.

Definition of Done: CLAUDE.md §8. Unit tests for current-week calculation, streaks,
export/import round-trip (and that the API key is not exported).
```

### Prompt 05: Simulator Framework

```markdown
Read CLAUDE.md, especially §5 and §6. Task: build the shared simulator engine and shell
that all 29 simulators will use. Build one tiny demo simulator to prove it. Do not build
real simulators yet. Match the /design simulator screen.

1. /lib/sim/engine:
   - Seeded RNG (mulberry32) with helpers: uniform, normal, exponential, poisson, pick.
   - SimClock: simulated time in ms, tick-based (default tick = 10ms sim time),
     speed multiplier 0.25×–4×, pause, step (advance one tick), reset.
   - EventQueue: priority queue of scheduled events (discrete-event style) so models can
     schedule "request arrives at t", "server finishes at t".
   - Metrics registry: counters, gauges, histograms (p50/p95/p99 via a fixed-size
     reservoir), time-series ring buffers sampled every 250ms sim time.
   - Event log: ring buffer of {t, level: info|warn|error, message}.
   - Model interface:
       interface SimModel<Config, State> {
         init(config: Config, rng: Rng): State;
         tick(state: State, ctx: TickContext): State;   // pure
         actions: Record<string, (state: State, payload?: any) => State>; // e.g. killServer
         faults: FaultDef<State>[];                    // "Break it" menu entries
         metrics(state: State): MetricSnapshot;
       }
   - Run the loop with requestAnimationFrame; decouple sim ticks from render frames.
     Optionally run heavy models in a Web Worker (provide the hook, use it if a model
     opts in with `worker: true`).
2. /components/sim/SimulatorShell.tsx with regions:
   - Header: SpecLabel title (e.g. "S-03 · LOAD BALANCER · NTS"), depth stamp,
     "What this models / simplifies" drawer button, "Guided tour" button, link to the
     related lesson.
   - Controls panel: auto-generated from a config schema (number slider with min/max/step,
     select, toggle) plus custom controls slot.
   - Canvas slot (view.tsx renders here) on a faint drafting grid with crosshair marks;
     shared helpers for isometric blocks, leader-line labels and travelling request dots.
   - Live Metrics panel: mono metric cards + Recharts line charts from time-series.
   - Event Log panel: filterable by level, auto-scroll toggle.
   - Transport bar: Play/Pause, Step, Reset, speed selector, seed input, reduced-animation toggle.
   - "Break it" dropdown listing model.faults; active faults shown as removable chips.
   - Challenges panel (see 3).
   - HudBar with live QPS, p99 and sim time.
   Layout: desktop = controls left, canvas center, metrics right, log bottom;
   mobile = stacked.
3. Challenge system:
   interface Challenge { id; title; description; setup?: Partial<Config>;
     durationMs; winCondition: (history: MetricHistory, state) => {passed:boolean; value:number; detail:string};
     hint: string }
   Starting a challenge resets the sim with its setup, runs for durationMs sim time,
   evaluates, shows pass/fail with detail, saves ChallengeResult (Prompt 03 DB).
4. Guided tour component: steps that highlight a region with a tooltip (accessible).
5. Simulator registry /lib/simulators/registry.ts:
   { id, title, phase, sectionIds, summary, models: string[], simplifies: string[],
     load: () => import(...) }  (dynamic import so each simulator is code-split)
6. /simulators page: grid of all registered simulators, filter by phase, shows
   challenges completed. /simulators/[id] renders the shell full-width.
   The <Simulator id> MDX component now embeds the real simulator inline (compact mode,
   with an "Open full screen" button).
7. Demo simulator "single-server-queue": one server, Poisson arrivals at rate λ,
   exponential service at rate μ; shows queue length, utilization, latency percentiles;
   fault "slow server (μ/3)"; challenge "keep p99 < 200ms at λ = 80/s by choosing μ".
   Unit test: at λ=50, μ=100, measured mean latency is within 15% of the M/M/1 formula
   1/(μ−λ) over a long run.

Definition of Done: CLAUDE.md §8. Engine unit tests for RNG determinism, clock, event queue, percentiles.
```

## Curriculum prompts (06–16)

Each phase gets a content prompt, then a simulator prompt. Run **U3 (Content Accuracy Review)** after every content prompt, and **U6 (Phase Audit)** at the end of each phase.

### Prompt 06: Phase 1 Content

```markdown
Read CLAUDE.md §7. Task: write ALL Phase 1 sections fully. "client-server" already exists;
review it against the standard, then write the rest. Each section gets meta.json,
lesson.mdx, quiz.json, flashcards.json, checkpoints.json, resources.json.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

Sections and MUST-COVER points:

1. client-server (week 1): request/response lifecycle; stateless vs stateful servers;
   where state lives (client, server memory, DB, cache); why statelessness enables scaling.
2. monolith-vs-microservices (week 1): modular monolith; microservice benefits (independent
   deploy, team ownership, independent scaling); costs (network latency, partial failure,
   distributed data, observability burden); Conway's law; when NOT to use microservices.
3. scaling (week 1): vertical vs horizontal; limits of vertical; stateless app tier;
   scaling the data tier is the hard part; autoscaling basics.
4. estimation (week 1): a repeatable back-of-envelope method (this section is its home;
   the full 7-step interview framework lives in Phase 7); DAU→QPS (1 day ≈ 10⁵ s),
   peak factor 2–10×; storage per year; bandwidth; read:write ratio; latency numbers
   table; availability nines table; 3 fully worked examples (Twitter-like timeline,
   image hosting, chat).
5. latency-throughput (week 1): definitions; percentiles p50/p95/p99; tail latency and
   fan-out amplification; Little's Law (L = λW) with an example.
6. dns (week 2): resolution chain (stub, recursive, root, TLD, authoritative); record types
   A/AAAA/CNAME/NS/TXT; TTL tradeoffs; DNS load balancing and GeoDNS; anycast basics.
7. tcp-udp (week 2): TCP handshake, reliability, ordering, flow & congestion control
   (conceptual); UDP use cases; head-of-line blocking.
8. http (week 2): HTTP/1.1 keep-alive, HTTP/2 multiplexing, HTTP/3 & QUIC; methods,
   status codes, idempotent vs safe methods; headers relevant to caching.
9. tls (week 2): what TLS provides; handshake overview; certificates & CAs;
   TLS termination at LB; mTLS between services.
10. load-balancers (week 2): L4 vs L7; algorithms (round robin, weighted, least
    connections, IP hash, consistent hashing); health checks; sticky sessions and why
    to avoid them; LB as SPOF and how to make it redundant.
11. reverse-proxy (week 2): reverse vs forward proxy; Nginx/Envoy roles; TLS offload,
    compression, buffering; sidecar proxies (awareness).
12. realtime (week 2): short polling, long polling, SSE, WebSockets compared on latency,
    server cost, direction, proxy compatibility; scaling WebSocket connections.

Volume and quality: per CLAUDE.md §7. Add every new term to glossary.json.
Reference simulator ids in meta.json (they'll be built in Prompt 07):
estimation-calculator, request-journey, load-balancer, consistent-hashing, rate-limiter
(rate-limiter belongs to Phase 2 but link from load-balancers as "related").

Definition of Done: CLAUDE.md §8, all files pass validation, every section renders.
```

### Prompt 07: Phase 1 Simulators (S1–S5)

```markdown
Read CLAUDE.md §6 and the framework from Prompt 05. Build these 5 simulators. Each gets
model.ts, view.tsx, config.ts, challenges.ts, model.test.ts, a guided tour, and a
models/simplifies drawer. Embed S1–S3 in their lesson sections. S4 and S5 belong to
Phase 2 sections that don't exist yet: for now, embed S4 in load-balancers and S5 in
load-balancers as 'Related simulator'. Prompt 08 embeds them in their own sections.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S1. estimation-calculator (section: estimation)
 Inputs: DAU, actions/user/day per action type (up to 4 rows: name, count, read|write,
 payload bytes), peak factor, retention years, replication factor, cache hit target.
 Outputs (live): avg & peak QPS per action and total; read:write ratio; storage/day,
 /year, total with replication; ingress/egress bandwidth; servers needed (input: QPS
 per server); cache memory for hot set (input: hot %).
 Show the formula for each output with the numbers substituted.
 Drill mode: 10 scenarios (Twitter, Instagram, WhatsApp, YouTube, Uber, Dropbox,
 URL shortener, Google Docs, Netflix, Slack). Learner enters estimates; accept within
 ±50% (order-of-magnitude thinking); show model answer with reasoning. Label scenario
 inputs as illustrative assumptions, not real company figures.
 Challenges: complete 5 drills within tolerance; complete a drill in under 3 minutes.

S2. request-journey (section: client-server / dns / http / tls)
 Step-through animation: browser cache → DNS (recursive, root, TLD, authoritative) →
 TCP handshake → TLS handshake → LB → app server → cache (hit/miss toggle) → DB → response.
 Each step shows elapsed ms (editable RTT inputs) and a 2–3 sentence explanation.
 Toggles: DNS cached, connection reused, HTTP/2 vs HTTP/1.1, cache hit, CDN in front.
 Total latency breakdown bar.
 Challenges: get first-byte time under 100ms for a user 150ms RTT away (needs CDN +
 reuse + DNS cache); explain which toggle saved the most (multiple choice).

S3. load-balancer (section: load-balancers)
 Model: N servers (2–10), each with capacity (req/s) and base latency; Poisson traffic;
 algorithms: round robin, weighted round robin, least connections, IP hash, random.
 Health checks with interval and failure threshold; LB stops routing after threshold.
 Faults: kill server, make server slow (latency ×5), make server flaky (30% errors),
 traffic spike (×3 for 10s).
 Metrics: per-server load and connections, error rate, p50/p95/p99, dropped requests.
 View: LB drawn as an isometric plate fanning out to isometric server blocks; animated
 request dots; server fill = load; OK / Hot / Overloaded labels.
 Challenges: keep error rate < 1% while one server is killed; pick the algorithm that
 handles heterogeneous servers best (weighted); keep p99 < 300ms during a spike.

S4. consistent-hashing (section: sharding (Phase 2) and load-balancers)
 Model: hash ring (0–2³²), nodes with V virtual nodes each, K keys (100–10,000).
 Actions: add node, remove node, change V. Compare mode: modulo hashing (key % N).
 Metrics: keys per node (bar chart), std deviation of load, % keys moved on last change
 (consistent vs modulo, side by side).
 View: circular ring with node and key positions; moved keys flash.
 Challenges: keep load std dev < 10% of mean with 5 nodes (needs vnodes);
 show that adding a node to 4 moves ≈ 1/5 of keys with consistent hashing vs ≈ 80% with modulo.

S5. rate-limiter (section: rate-limiting (Phase 2), linked from Phase 1)
 Algorithms side by side on the SAME traffic: token bucket (capacity, refill rate),
 leaky bucket (queue size, leak rate), fixed window (limit, window), sliding window log,
 sliding window counter.
 Traffic patterns: steady, bursty, boundary attack (burst at window edge), ramp.
 Metrics per algorithm: allowed, rejected, max burst allowed, memory per user (estimated).
 Distributed mode toggle: 3 app servers with local limiters vs one shared Redis counter
 (simulated): show over-admission with local limits.
 Challenges: find the boundary-attack weakness in fixed window; configure token bucket
 to allow bursts of 20 but average 5/s.

Definition of Done: CLAUDE.md §8; each simulator's tests pass; S1–S3 embedded in their
sections and S4–S5 embedded in load-balancers.
```

### Prompt 08: Phase 2 Content

```markdown
Read CLAUDE.md §7. Task: write ALL Phase 2 sections fully (all six files each).
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

APIs (week 3):
1. rest: resources & URIs; verbs & idempotency; status codes; pagination (offset vs
   cursor, why cursor wins at scale); filtering/sorting; versioning strategies; HATEOAS (awareness).
2. graphql: schema, queries, mutations; over/under-fetching; N+1 and DataLoader;
   caching difficulty; persisted queries; when NOT to use it.
3. grpc: protobuf, HTTP/2, unary & streaming; service-to-service use; browser limits & gRPC-web;
   comparison table REST vs GraphQL vs gRPC.
4. api-gateway: routing, auth, rate limiting, aggregation, BFF pattern; gateway as SPOF.
5. rate-limiting: why; algorithms (token bucket, leaky bucket, fixed window, sliding log,
   sliding counter) with pros/cons; distributed limiting with Redis (atomic INCR, Lua);
   where to place limiters; returning 429 + Retry-After.
6. idempotency: idempotency keys; storing results; safe retries for payments; idempotent
   consumers (preview for Phase 3).

Databases (weeks 4–5):
7. sql-vs-nosql: relational, document, key-value, wide-column, graph; choose by access
   pattern; a decision table with 8 example use cases.
8. data-modeling: normalization (1NF–3NF briefly), denormalization tradeoffs, query-first
   modeling, modeling for a NoSQL store (Cassandra-style partition key + clustering key).
9. indexing: B-tree vs LSM tree; composite index & leftmost prefix; covering index; write
   amplification; when indexes hurt; reading EXPLAIN.
10. transactions: ACID; isolation levels (read uncommitted, read committed, repeatable read,
    serializable); anomalies (dirty read, non-repeatable read, phantom, lost update,
    write skew) each with a concrete two-transaction example; MVCC overview.
11. locking: pessimistic (SELECT FOR UPDATE), optimistic (version column), deadlocks & detection.
12. replication: leader-follower, multi-leader, leaderless; sync vs async vs semi-sync;
    replication lag problems (read-your-writes, monotonic reads) and fixes; failover & split brain.
13. sharding: why and when (shard last); range, hash, directory; choosing a shard key;
    hot shards & celebrity problem; cross-shard queries/transactions; resharding strategies.
14. consistent-hashing: ring, virtual nodes, minimal movement; where it's used (Dynamo-style
    stores, caches, LBs).
15. connection-pooling: why DBs run out of connections; pool sizing intuition; PgBouncer (awareness).

Storage & search (week 6):
16. object-storage: blob vs file vs block; S3-style model; presigned URLs; multipart
    upload; storage classes & lifecycle; why files don't go in the DB; serving through CDN.
17. search: inverted index; tokenization basics; relevance (TF-IDF/BM25 concept);
    Elasticsearch architecture (shards, replicas); typeahead with tries & precomputed top-k.
18. olap-vs-oltp: row vs column storage; warehouse vs lake vs lakehouse (awareness); time-series DBs.

Simulator ids to reference: rate-limiter, sql-sandbox, isolation-lab, index-visualizer,
replication, sharding, consistent-hashing.

Embed the existing consistent-hashing simulator in the consistent-hashing and sharding
sections, and the existing rate-limiter simulator in the rate-limiting section.

Definition of Done: CLAUDE.md §8.
```

### Prompt 09: Phase 2 Simulators (S6–S9) + SQL Sandbox

```markdown
Read CLAUDE.md §6. Build these. Each follows the Simulator Standard.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S6. sql-sandbox + isolation-lab (sections: indexing, transactions, data-modeling)
 A. SQL Sandbox (PGlite, lazy-loaded with a loading state):
   - Monaco editor with SQL highlighting and autocomplete for table/column names;
     run selection or all (Ctrl/Cmd+Enter); results grid with row count & timing;
     EXPLAIN ANALYZE output rendered as an indented plan tree with cost highlights.
   - Preloaded datasets (generated deterministically on load): users (50k), posts (200k),
     follows (300k), orders (100k), order_items, products. "Reset database" button.
   - 15 guided exercises in 3 tracks, each with goal, starter query, hint, and an
     auto-checker (compare result set or plan property):
     Indexing (5): find slow query via EXPLAIN, add index, composite index order,
       covering index, show index hurting a bulk insert.
     Modeling (5): write a feed query, denormalize a counter, pagination with keyset,
       find N+1 pattern and fix with a join, design a schema for a given requirement.
     Transactions (5): BEGIN/COMMIT/ROLLBACK, SELECT FOR UPDATE, optimistic locking with a
       version column, unique constraint as a guard, idempotency-key table.
 B. Isolation Lab: Two side-by-side session panes backed by a small simulated MVCC engine
   in TypeScript (PGlite runs a single connection per database, so it can't give two
   truly concurrent sessions on the same data). The engine must reproduce Postgres
   behavior for READ COMMITTED, REPEATABLE READ and SERIALIZABLE (including serialization
   failures for write skew under SERIALIZABLE). Say this in the simplifies drawer. Unit
   test each preset scenario's expected outcome against documented Postgres behavior.
   A step sequencer runs statements alternately (T1 step, T2 step).
   Preset scenarios with expected outcomes: dirty read (explain Postgres never allows it),
   non-repeatable read, phantom, lost update, write skew (on-call doctors example).
   Isolation level selector per session. After each scenario: explanation of what happened and why.
 Challenges: complete each track; prevent lost update using two different techniques.

S7. index-visualizer (section: indexing)
 Two panes: B-tree (order 3–5) animated insert/search/delete with node splits;
 LSM tree: memtable → flush to SSTable L0 → compaction into L1/L2; reads check
 memtable, then SSTables (with optional Bloom filter skip).
 Inputs: insert sequential vs random keys, batch size, Bloom filter toggle.
 Metrics: writes per insert (write amplification), nodes/files touched per read.
 Challenges: show which structure has lower write cost for 1,000 random inserts;
 reduce read cost on the LSM with Bloom filters.

S8. replication (section: replication)
 Model: 1 leader + 2–4 followers; per-link replication delay (adjustable, ms);
 modes: async, sync, semi-sync (1 sync follower). Clients write to leader, read from
 leader or random follower (toggle).
 Faults: leader crash (failover after timeout; with async, unreplicated writes are lost:
 show them), network partition between leader and followers, follower lag spike.
 Metrics: write latency, replication lag per follower, stale reads %, lost writes on failover.
 Fix toggles: read-your-writes (route user's reads to leader for N seconds after write),
 monotonic reads (sticky follower per user).
 View: nodes with log entries filling, animated replication arrows.
 Challenges: zero stale reads for the writing user with async replication;
 zero lost writes on leader crash (requires sync or semi-sync) while keeping write p99 under a limit.

S9. sharding (section: sharding)
 Model: 4–16 shards; 10k users; request distribution uniform or Zipf (skew slider);
 strategies: range (by user id or by name), hash, directory (lookup table).
 Actions: mark "celebrity" users (receive 100× traffic); add shards (resharding: show
 data moved under each strategy); split a hot shard (directory strategy).
 Metrics: load per shard (heatmap), max/avg load ratio, % data moved on reshard,
 cross-shard query count for a "friends' posts" query.
 Challenges: keep max/avg load < 1.5 with Zipf skew 1.1; handle a celebrity without
 overloading a shard (key splitting / dedicated shard).

Definition of Done: CLAUDE.md §8, PGlite lazy-loaded only on its pages, all exercise auto-checkers unit tested.
```

### Prompt 10: Phase 3 Content

```markdown
Read CLAUDE.md §7. Task: write ALL Phase 3 sections fully.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

Caching (week 7):
1. cache-layers: client/browser, CDN, reverse proxy, application (in-process), distributed
   cache, DB buffer pool; latency at each layer; what to cache.
2. cache-strategies: cache-aside, read-through, write-through, write-behind, write-around;
   sequence diagram for each; consistency and durability implications; decision table.
3. eviction: LRU, LFU, FIFO, TTL, random; how LRU is implemented (hash map + doubly linked
   list); approximate LRU in Redis (awareness).
4. invalidation: TTL vs explicit delete vs versioned keys; the delete-then-update race
   condition with a timeline diagram; why "delete on write" beats "update on write".
5. cache-failures: thundering herd/stampede (locking, request coalescing, early refresh,
   jittered TTL); cache penetration (null caching, Bloom filters); hot keys (local caching,
   key replication); cache avalanche.
6. cdn: push vs pull; cache-control/ETag headers; cache keys; purging; dynamic content at
   the edge (awareness); cost tradeoffs.
7. redis: data structures and their use cases (strings, hashes, lists, sets, sorted sets,
   streams, HyperLogLog); TTLs; persistence (RDB/AOF); replication & cluster (hash slots);
   single-threaded command execution model; atomic ops and Lua scripts.

Messaging (week 8):
8. queues-vs-pubsub: point-to-point vs fan-out; push vs pull consumers; why async
   (decoupling, buffering spikes, retries).
9. delivery-semantics: at-most-once, at-least-once, exactly-once (and why it really means
   "effectively once" via idempotency or transactions); acks and visibility timeouts.
10. partitioning-ordering: partitions, partition keys, ordering per partition only;
    consumer groups; rebalancing; consumer lag.
11. failure-handling: retries with backoff, poison messages, dead-letter queues,
    backpressure, max in-flight.
12. event-driven: events vs commands; event notification vs event-carried state transfer;
    event sourcing; CQRS; outbox pattern (with the dual-write bug explained first);
    change data capture (awareness).
13. kafka-vs-queues: Kafka log model, retention, replay, offsets; RabbitMQ exchanges &
    routing; SQS; decision table.

Simulator ids: cache, redis-playground, message-queue, outbox.

Definition of Done: CLAUDE.md §8.
```

### Prompt 11: Phase 3 Simulators (S10–S13)

```markdown
Read CLAUDE.md §6. Build these.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S10. cache (sections: cache-strategies, eviction, cache-failures, invalidation)
 Model: app → cache → DB. Key popularity Zipf (skew slider), keyspace size, cache size
 (items), TTL, read:write ratio, DB latency & capacity, cache latency.
 Strategy selector: cache-aside, read-through, write-through, write-behind.
 Eviction selector: LRU, LFU, FIFO, random.
 Faults: flush entire cache (cold start), hot key (one key 50% of traffic),
 mass expiry (all keys share the same TTL), DB slowdown, cache node down.
 Mitigations (toggles): request coalescing, mutex rebuild, jittered TTL, null caching,
 local in-process cache for hot keys.
 Metrics: hit rate over time, DB QPS, DB saturation, p99 latency, stale reads
 (for write-behind/ invalidation races).
 Race demo mode: animated two-request timeline reproducing the stale-cache race with
 "update cache on write", then fixed with "delete on write".
 Challenges: keep DB below 80% capacity after a full cache flush (needs coalescing);
 survive mass expiry (needs jitter); beat 90% hit rate with a cache 5% the size of the keyspace.

S11. redis-playground (section: redis)
 An in-browser interpreter implementing a Redis-compatible SUBSET with correct semantics
 and reply formats: PING, GET, SET (EX, PX, NX, XX), DEL, EXISTS, EXPIRE, TTL, PERSIST,
 INCR, INCRBY, DECR, MGET, MSET, KEYS (with warning), SCAN, HSET, HGET, HGETALL, HDEL,
 HINCRBY, LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN, SADD, SREM, SMEMBERS, SISMEMBER,
 SCARD, ZADD, ZINCRBY, ZRANGE (WITHSCORES), ZREVRANGE, ZRANK, ZSCORE, ZREM, PFADD,
 PFCOUNT, MULTI/EXEC/DISCARD, FLUSHALL. TTL expiry driven by a simulated clock
 (with a "fast-forward time" button).
 UI: terminal-style REPL (history with ↑/↓, autocomplete command names),
 key browser panel showing type, value, TTL live.
 Exercises (auto-checked against final state or outputs): session store with TTL;
 page-view counter; leaderboard with top-10 and a user's rank; unique visitors with
 HyperLogLog; fixed-window rate limiter with INCR + EXPIRE; atomic transfer with MULTI.
 Label clearly: "A simulation of Redis behavior, not a real Redis server."
 Unit tests for every command, including edge cases (wrong type error, missing keys).

S12. message-queue (sections: partitioning-ordering, delivery-semantics, failure-handling, kafka-vs-queues)
 Mode toggle: "Log (Kafka-style)" vs "Queue (RabbitMQ/SQS-style)".
 Model: producers (rate, key distribution), topic with P partitions (log mode) or one
 queue, consumer group(s) with C consumers (processing time, failure %).
 Log mode: offsets per partition, commit after processing vs before (affects duplicates
 vs loss), add/remove consumer → rebalance pause, consumers > partitions idle,
 second consumer group reads independently, replay from offset.
 Queue mode: visibility timeout, ack, redelivery, max receive count → DLQ.
 Faults: consumer crash mid-message, slow consumer, poison message, producer burst.
 Metrics: throughput, consumer lag per partition, duplicates processed, messages lost,
 out-of-order deliveries per key, DLQ size.
 Idempotent consumer toggle (dedupe by message id) → duplicates become harmless.
 Challenges: zero lost messages under consumer crash; keep per-key order with 4
 consumers; clear lag of 10k messages in under 30s sim time; route a poison message to DLQ.

S13. outbox (section: event-driven)
 Animated sequence: service writes DB row then publishes event. Inject failure between
 the two steps → DB and event stream diverge (show the inconsistency).
 Then switch to outbox: write row + outbox row in one transaction; relay polls outbox
 and publishes; crash relay mid-publish → duplicate event → idempotent consumer dedupes.
 Metrics: inconsistencies, duplicates, publish delay.
 Challenge: run 1,000 orders with random crashes and get zero inconsistencies.

Definition of Done: CLAUDE.md §8.
```

### Prompt 12: Phase 4 Content

```markdown
Read CLAUDE.md §7. Task: write ALL Phase 4 sections fully.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

Distributed systems (week 9):
1. cap-pacelc: CAP stated precisely; partitions are not optional; CP vs AP examples;
   why "pick 2 of 3" is misleading; PACELC (latency vs consistency when no partition).
2. consistency-models: linearizability, sequential (awareness), causal, eventual,
   read-your-writes, monotonic reads; examples of each in real products.
3. quorums: N, R, W; R + W > N; sloppy quorums & hinted handoff (awareness);
   read repair and anti-entropy.
4. consensus: why consensus is needed; Raft in detail (terms, leader election, log
   replication, commit index, safety); Paxos (awareness); etcd/ZooKeeper uses
   (config, leader election, locks).
5. time-ordering: clock skew; NTP limits; Lamport clocks; vector clocks; detecting
   concurrent updates; hybrid logical clocks & TrueTime (awareness).
6. distributed-transactions: 2PC (phases, coordinator failure blocking problem);
   Saga (orchestration vs choreography, compensating actions); when to avoid distributed
   transactions entirely.
7. id-generation: UUIDv4 vs UUIDv7, DB auto-increment, ticket servers, Snowflake
   (bit layout, clock skew handling); sortability tradeoffs.
8. distributed-locks: leases; why locks need fencing tokens (with the GC-pause example);
   Redis-based locks and their caveats (state the debate fairly); ZooKeeper/etcd locks.

Reliability (week 10):
9. high-availability: redundancy; active-active vs active-passive; multi-AZ & multi-region;
   availability math (series multiply, parallel 1 − Π(1−a)).
10. fault-tolerance: eliminate SPOFs; graceful degradation; static stability (awareness).
11. timeouts-retries: always set timeouts; timeout budgets across hops; retries:
    exponential backoff + jitter (full jitter formula); retry budgets; retry storms;
    idempotency as a prerequisite.
12. circuit-breakers: states (closed, open, half-open), thresholds; fallbacks.
13. bulkheads-load-shedding: isolating thread pools/connections; priority-based shedding;
    admission control.
14. disaster-recovery: RPO vs RTO; backup strategies; backup vs replication; DR tiers
    (backup/restore, pilot light, warm standby, active-active); practicing failover.
15. chaos-engineering: principles; steady-state hypothesis; game days (awareness).

Simulator ids: cap, quorum, raft, clocks, saga, snowflake, retry-storm,
circuit-breaker, availability-calculator.

Definition of Done: CLAUDE.md §8.
```

### Prompt 13: Phase 4 Simulators (S14–S22)

```markdown
Read CLAUDE.md §6. Build these nine simulators.
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S14. cap (section: cap-pacelc)
 3–5 replica nodes of a key-value store; clients attached to nodes.
 Cut/restore any network link by clicking it. Mode: CP (majority required; minority side
 rejects) or AP (every node accepts; conflicts resolved on heal by last-write-wins or
 "keep siblings").
 Metrics: rejected requests, stale reads, conflicts on heal, lost writes (LWW).
 Challenges: show a stale read in AP mode; show unavailability in CP mode; heal a
 partition and resolve conflicts with siblings without losing data.

S15. quorum (section: quorums)
 Sliders N (1–7), R, W. Node failure toggles. Simulated reads/writes with per-node latency.
 Shows: whether R+W>N, read/write availability with current failures, latency (wait for
 Rth/Wth fastest), probability of stale read (simulated). Preset configs: (3,2,2),
 (3,1,3), (3,3,1), (5,3,3).
 Challenge: choose settings that keep strong consistency AND tolerate 1 node failure for
 both reads and writes with N=3.

S16. raft (section: consensus)
 5 nodes; randomized election timeouts; heartbeats; terms; votes; log replication with
 commit index; client writes go to leader.
 Actions: crash/restart node, partition cluster (drag nodes into groups), slow node,
 send client write.
 View: nodes with role color + label (follower/candidate/leader), term number, log
 entries (committed solid, uncommitted outlined), animated messages
 (RequestVote, AppendEntries).
 Faithfully implement Raft election and log replication rules (no membership changes,
 no snapshots, and say so in simplifies). Unit tests: at most one leader per term;
 committed entries never lost after leader crash.
 Challenges: trigger an election by crashing the leader; create a partition where the
 minority's leader can't commit; recover and observe log reconciliation.

S17. clocks (section: time-ordering)
 3 processes on a space-time diagram; user adds events (local, send, receive) by clicking.
 Show Lamport timestamps and vector clocks for every event; highlight happens-before
 chains; pick two events → shows "A→B", "B→A", or "concurrent".
 Physical clock skew slider shows how wall-clock ordering can contradict causality.
 Challenge: construct two concurrent events that Lamport ordering misleadingly orders.

S18. saga (section: distributed-transactions)
 Order flow: Order → Payment → Inventory → Shipping. Mode: orchestration (central
 orchestrator node) vs choreography (event chain). Also a 2PC mode for comparison.
 Inject failure at any step; watch compensations run in reverse (refund, release stock).
 2PC mode: crash the coordinator after prepare → participants blocked (show locks held).
 Metrics: completed, compensated, stuck, locks held time.
 Challenges: complete 100 orders with 10% random failures and zero inconsistent states;
 demonstrate the 2PC blocking problem.

S19. snowflake (section: id-generation)
 Interactive bit layout (sign | timestamp | datacenter | machine | sequence) with
 adjustable bit widths; computes lifetime years, max machines, max IDs/ms/machine.
 Generator: multiple machines generating IDs; show sortability; sequence overflow within
 1ms → wait; clock moves backwards fault → show duplicate risk and the "refuse until
 clock catches up" fix.
 Challenge: design a layout supporting 1,000 machines, 10k IDs/s each, for 50+ years.

S20. retry-storm (sections: timeouts-retries)
 N clients (100–5,000) calling a service with fixed capacity; service degrades then
 recovers on a schedule (fault).
 Client policy: no retry, immediate retry (max k), exponential backoff, backoff + full
 jitter, plus optional retry budget (≤10% extra) and client timeout.
 Metrics: offered load vs capacity (show amplification factor), success rate, time to
 recover after the service heals.
 Challenges: recover within 5s after the service heals (needs jitter + budget);
 keep amplification < 1.2×.

S21. circuit-breaker (section: circuit-breakers)
 Service A → Service B (with failure injection). Breaker config: failure threshold %,
 min requests, open duration, half-open probe count. Fallback toggle (cached response).
 View: state machine diagram with current state highlighted + live request flow.
 Metrics: requests to B, A's latency, fallback rate, B's load during recovery.
 Challenge: keep A's p99 < 100ms while B is down and avoid hammering B while it recovers.

S22. availability-calculator (section: high-availability)
 Drag components onto a mini canvas; connect in series or group in parallel (redundant
 sets); each has availability % (presets: 99, 99.9, 99.95, 99.99).
 Computes total availability and downtime per year/month/week; highlights the weakest link.
 Challenge: reach 99.99% overall using components that are individually 99.9%.

Definition of Done: CLAUDE.md §8. Raft and quorum tests are mandatory.
```

### Prompt 14: Phase 5 Content + Simulators (S23–S26)

```markdown
Read CLAUDE.md §6 and §7. Task: write ALL Phase 5 sections and build 4 simulators.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."
Do the content first, report, then the simulators.

CONTENT
Observability (week 11):
1. logging: structured logs, levels, correlation/request IDs, centralized logging, cost & sampling.
2. metrics: counters/gauges/histograms; RED and USE methods; cardinality explosions.
3. tracing: spans, trace context propagation, sampling, OpenTelemetry; finding the slow hop.
4. slos: SLI vs SLO vs SLA; choosing SLIs; error budgets & burn-rate alerts; policy when
   the budget is exhausted.
5. alerting: symptom-based alerts, paging vs ticketing, alert fatigue, runbooks.
Security (week 11):
6. authn-authz: sessions vs tokens; OAuth 2.0 flows (authorization code + PKCE, client
   credentials); OIDC; JWT structure, signing, expiry, and the revocation problem
   (short TTL + refresh tokens, denylists).
7. access-control: RBAC vs ABAC; least privilege; service-to-service auth (mTLS, workload identity).
8. data-protection: encryption in transit/at rest; key management (KMS, envelope
   encryption); secrets management; PII handling.
9. common-attacks: DDoS & mitigation layers; injection; SSRF; OWASP Top 10 overview.
Deployment (week 12):
10. containers: images, layers, why containers; Docker basics.
11. kubernetes: pods, deployments, services, ingress, HPA, probes (liveness/readiness);
    what to know for interviews vs not.
12. ci-cd: pipeline stages, testing pyramid, artifact promotion, rollback.
13. release-strategies: rolling, blue-green, canary, feature flags, dark launches;
    database migrations without downtime (expand/contract pattern).
14. iac: Terraform concepts, declarative infra, drift (awareness).

SIMULATORS
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S23. observability-lab (sections: logging, metrics, tracing)
 A fake system: gateway → users, orders, payments, inventory services + DB + cache,
 generating synthetic logs, metrics and traces continuously.
 UI: mini dashboard (RED metrics per service), log explorer (filter by service, level,
 request id), trace explorer (waterfall view of spans).
 Incident mode: 5 scripted incidents (slow DB query in orders, payments 3rd-party
 timeout, cache node down, memory leak in inventory, bad deploy raising 500s in users).
 The learner investigates and submits a root cause (multiple choice + which service);
 scored on correctness and time.
 Challenge: solve all 5 incidents.

S24. error-budget (section: slos)
 Set SLO (e.g. 99.9% over 30 days); simulate a month with random + learner-triggered
 incidents (duration, % errors). Shows budget remaining, burn rate, and when fast-burn
 (14.4× over 1h) and slow-burn alerts would fire.
 Challenge: given a month of incidents, decide whether a risky release should ship
 (policy question, auto-checked).

S25. deployment (section: release-strategies)
 10 servers, traffic flowing; deploy v2 using rolling (batch size), blue-green, or canary
 (% steps, automated analysis on error rate). v2 can be "good" or "bad" (hidden until
 errors appear; learner chooses which to test).
 Metrics: users affected by errors, deployment time, extra capacity needed,
 rollback time. Database migration mini-mode: expand/contract steps in correct order
 (learner arranges steps; wrong order causes simulated errors).
 Challenge: deploy a bad version affecting < 1% of users.

S26. jwt-inspector (section: authn-authz)
 Paste or generate a JWT; decode header/payload with explanation of each claim;
 sign with HS256 using a demo secret (Web Crypto) and verify; tamper with payload →
 signature fails; show "alg: none" attack explanation (no executable attack, explanation only).
 Revocation demo: user logs out but token stays valid until exp; compare fixes
 (short TTL + refresh, denylist) with a timeline.
 Use only demo keys generated in-browser; never send tokens anywhere.

Definition of Done: CLAUDE.md §8.
```

### Prompt 15: Phase 6 Content + Simulators (S27–S28)

```markdown
Read CLAUDE.md §6 and §7. Task: write ALL Phase 6 sections and build 2 simulators.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

CONTENT (week 13)
1. serverless: FaaS model, cold starts, concurrency limits, cost at low vs high scale,
   when NOT to use it.
2. edge-computing: edge functions, edge caching & personalization, data locality limits.
3. stream-processing: streams vs batch; windowing (tumbling, sliding, session); event time
   vs processing time; watermarks; late data; exactly-once effects; Flink/Kafka Streams (awareness).
4. batch-processing: MapReduce model, ETL/ELT, Spark (awareness); lambda vs kappa architecture.
5. multi-region: active-passive vs active-active, data residency, conflict resolution,
   latency-based routing.
AI-native systems:
6. embeddings-vector-search: what embeddings are; cosine similarity; exact vs ANN search;
   HNSW intuition; IVF (awareness); recall vs latency tradeoff; pgvector vs dedicated
   vector DBs; metadata filtering.
7. rag: ingestion (parsing, chunking strategies & sizes, overlap), embedding, retrieval,
   hybrid search (BM25 + vectors), reranking, context assembly, citation; failure modes
   (bad chunking, retrieval misses, stale index); freshness & re-indexing.
8. llm-serving: tokens, prefill vs decode, batching (continuous batching), KV cache,
   streaming responses, GPU memory constraints; latency metrics (time to first token,
   tokens/sec); using hosted APIs vs self-hosting.
9. llm-cost-latency: model routing (small model first, escalate), prompt caching,
   semantic caching (and its risks), token budgets, rate limits & quotas.
10. ai-reliability: timeouts, retries, provider failover, fallbacks, graceful degradation,
    structured output validation.
11. evals-guardrails: offline eval sets, LLM-as-judge (with caveats), regression testing
    prompts, input/output filtering, PII handling, monitoring quality in production.
12. agents: tool calling loop, state, idempotent tools, limits on steps/cost, human-in-the-loop.
Be careful about accuracy: describe concepts that are stable; avoid specific vendor
pricing or benchmark numbers.

SIMULATORS
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S27. vector-search (section: embeddings-vector-search)
 Ship a small precomputed dataset (~2,000 short texts across 8 topics, with embeddings
 reduced to 2D via PCA/UMAP done at build time and stored as JSON; also store
 full-dimension vectors if size allows, else use 64-d).
 Query by picking a sample query or nearest dataset item; shows top-k neighbors
 (cosine), 2D scatter with query and neighbors highlighted.
 Implement brute-force search and a small HNSW (M, efConstruction, efSearch params)
 in TypeScript; compare recall@10 and "distance computations" for both.
 Metadata filter toggle (pre-filter vs post-filter, showing post-filter's "too few results" issue).
 Challenge: reach recall@10 ≥ 0.95 with < 20% of brute-force computations.

S28. rag-pipeline (section: rag)
 Node-based pipeline builder (React Flow): Source docs → Chunker (size, overlap,
 strategy: fixed/sentence/heading) → Embedder → Index → Retriever (top-k, hybrid toggle)
 → Reranker (toggle) → Prompt assembler (token budget) → LLM → Answer.
 Bundled corpus: a fictional company handbook (write it: ~25 pages of policy docs) and
 20 evaluation questions with gold answers and gold source passages.
 Offline mode (default, no API key): retrieval runs for real in-browser (lexical BM25 +
 precomputed embeddings); generation step shows the assembled prompt and a precomputed
 reference answer; eval shows retrieval hit rate (did gold passage appear in context).
 Online mode (API key set): generation runs for real via /lib/ai; eval can use
 LLM-as-judge with a visible rubric.
 Metrics: retrieval hit rate, context tokens, estimated cost per query (user-entered
 price per 1k tokens), latency breakdown.
 Challenge: reach ≥ 90% retrieval hit rate on the 20 questions with ≤ 2,000 context tokens.

Definition of Done: CLAUDE.md §8. The whole simulator works without an API key.
```

### Prompt 16: Algorithm Sandboxes (S29)

```markdown
Read CLAUDE.md. Task: build in-browser coding labs at /simulators/code-labs and
/simulators/code-labs/[labId].
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."
(Build the engine first, then the labs in order; use the lab id as the marker.)

Engine:
- Pyodide loaded lazily in a Web Worker (never block the UI) with a loading indicator.
- Monaco editor (Python), Run (Ctrl/Cmd+Enter), Run Tests, Reset to starter code,
  Show hint (up to 3 progressive hints), Show reference solution (after 3 failed runs
  or a confirm dialog).
- Test runner: each lab defines tests in Python; show each test pass/fail with
  input, expected, actual, and stdout. Enforce 5s timeout per run (terminate worker).
- Code autosaved per lab in IndexedDB. Passing all tests records a ChallengeResult.
- Optional JavaScript/TypeScript version of each lab executed in a sandboxed Web Worker
  (language toggle).

Labs (each with explanation, starter code, ≥ 8 tests including edge cases,
complexity targets, reference solution):
1. LRU cache with O(1) get/put (hash map + doubly linked list)
2. LFU cache
3. Token bucket rate limiter (with injectable clock)
4. Sliding window counter rate limiter
5. Consistent hash ring with virtual nodes (add/remove/get_node)
6. Bloom filter (configurable m, k; measure false positive rate)
7. Trie with top-k autocomplete
8. Snowflake ID generator (injectable clock; handle sequence overflow & clock going backwards)
9. Exponential backoff with full jitter (deterministic with seeded random)
10. Circuit breaker state machine
11. Lamport clock and vector clock (compare/concurrent detection)
12. Simple quorum read/write coordinator with versioned values and read repair
13. Geohash encode/decode + neighbors (for the ride-sharing case study)
14. Merkle tree for detecting differing blocks (for file sync / anti-entropy)
15. Leaky bucket queue

Link each lab from its related lesson section.

Definition of Done: CLAUDE.md §8; reference solutions pass all tests (automated test in CI
runs reference solutions through Pyodide in Node, or through local Python if simpler: document which).
```

## Practice prompts (17–20d)

These prompts turn learning into practice: a design canvas, traffic simulation on your own designs, timed mock interviews, 15 reference case studies and the Phase 7 lessons.

### Prompt 17: Design Studio, Part 1 (Canvas)

```markdown
Read CLAUDE.md. Task: build the Design Studio canvas at /studio and /studio/[designId].
Match the /design Design Studio screen.

1. /studio: list of saved designs (title, case study, updated time), "New design",
   "New from case study template", duplicate, delete, import JSON.
2. Canvas (React Flow): infinite, snap-to-grid, minimap, zoom controls, multi-select,
   copy/paste, undo/redo (Ctrl/Cmd+Z / Shift+Z, history of 100), delete, align tools,
   group/frame boxes with labels (e.g. "Region us-east"), text notes, edges with labels
   and arrow direction, edge types: sync request, async message, replication.
3. Component palette (searchable, draggable), each with a small isometric icon and
   default properties:
   Client (web/mobile; users count), DNS, CDN (hit rate), Load Balancer (L4/L7, algorithm),
   API Gateway (rate limit), Service (name, instances, capacity QPS per instance,
   base latency ms, stateless toggle), Cache (size, hit rate, latency), SQL DB (primary,
   replicas count, capacity QPS, latency), NoSQL DB (nodes, consistency), Shard group
   (shard count), Queue/Topic (partitions), Worker (instances, processing time),
   Object Storage, Search Index, Vector DB, LLM API (latency, tokens/s, rate limit),
   Monitoring, External 3rd-party API, Region/AZ frame.
4. Properties panel: edit the selected node/edge; validation (e.g. capacity > 0).
5. Autosave to IndexedDB (debounced); "Saved" indicator; version history (last 20 snapshots).
6. Export: PNG (whole diagram, Paper/Blueprint theme), SVG, JSON. Import JSON with validation.
7. Side panel "Notes" per design with the 7 framework headings (CLAUDE.md §10)
   prefilled as a markdown template.
8. Keyboard: Delete, Ctrl/Cmd+C/V/D (duplicate), arrows to nudge, Space+drag to pan.

Definition of Done: CLAUDE.md §8; unit tests for graph model serialization and undo/redo.
```

### Prompt 18: Design Studio, Part 2 (Run Mode)

```markdown
Read CLAUDE.md. Task: add a "Run" mode to the Design Studio that simulates traffic
through the learner's design. Put the model in /lib/studio/sim (pure, tested).

1. Traffic config: total QPS from clients, read:write ratio, peak multiplier,
   request types (up to 3, each with a path through the graph defined by edges from Client).
2. Flow model (steady-state, recomputed every 500ms sim time, with smoothing):
   - Traffic enters at clients, follows outgoing sync edges.
   - LB/gateway split traffic across targets (per algorithm, weighted by capacity).
   - Cache/CDN: hit fraction returns; misses continue downstream.
   - Reads may go to replicas if a read-replica edge exists; writes go to primary.
   - Async edges: traffic to queue returns immediately to caller; workers consume at
     their capacity; queue depth grows if inflow > consumption.
   - Utilization ρ = incoming QPS / (instances × capacity per instance).
   - Node latency = base latency / (1 − ρ) for ρ < 0.95; for ρ ≥ 0.95 cap latency and
     drop excess requests (count as errors).
   - End-to-end latency per request type = sum along path (sync only); p99 approximated
     as mean × factor based on ρ (document the approximation in the simplifies drawer).
3. Visualization: edges animate with thickness ∝ QPS; nodes colored by utilization
   (with text labels: OK / Hot / Overloaded, not color alone); tooltips show QPS,
   ρ, latency, errors; queue nodes show depth.
4. Analysis panel:
   - Bottlenecks: nodes with ρ > 0.8, sorted.
   - SPOF detection: for each node, check if removing it disconnects any client from any
     datastore/required service (graph reachability); list SPOFs.
   - Availability estimate using component availability (series/parallel derived from graph).
   - Cost estimate (optional per-node $/month input).
5. Failure injection: click any node → kill / slow down; watch reroutes, errors, and
   queue growth. Scenario buttons: "Traffic ×10", "Lose an AZ" (kills all nodes in a frame),
   "Cache flush" (hit rate → 0 then recovers over 60s).
6. Challenges per case-study template (data-driven): e.g. "Handle 50k QPS reads with
   p99 < 200ms, zero SPOFs".

Definition of Done: CLAUDE.md §8; unit tests: utilization math, cache split, SPOF detection on 4 sample graphs.
```

### Prompt 19: Interview Mode + Self-Review Rubric

```markdown
Read CLAUDE.md. Task: build Interview Mode at /interview/[caseId] using the Design Studio.
Match the /design Interview Mode screen.

1. Start screen: case study prompt (from the case study's meta.json: interviewer-style
   problem statement), duration (30/45/60 min), hints on/off, "Start".
2. Layout: timer (top, a large mono countdown, with pause allowed only in practice mode),
   left = 7 framework step panels (Requirements, Estimation, API, Data Model,
   High-Level Design, Deep Dives, Wrap-up), center = Design Studio canvas, right = notes.
   - Requirements panel: functional and non-functional lists with "clarifying questions"
     the learner can click to reveal the interviewer's answer (data-driven per case).
   - Estimation panel: embedded mini estimation calculator.
   - API panel: structured endpoint editor (method, path, request, response).
   - Data model panel: entity editor (name, fields, keys) + DB choice with justification.
   - Deep dives: the case defines 3–5 likely deep-dive questions; revealed one at a time
     at timed intervals (like an interviewer pushing).
   - Suggested time per step shown; gentle nudge when over time.
3. Hints: each panel has up to 2 hints; using a hint is recorded.
4. Submit → Self-review:
   - Rubric from rubric.json (per case): ~10–14 criteria grouped by framework step, each
     scored 0–2 with clear descriptions of what 0/1/2 look like.
   - Side by side: learner's design vs reference design (loaded from design.json) and
     reference walkthrough (solution.mdx).
   - Run both designs in Run Mode against the case's traffic profile and compare metrics.
   - Saves an InterviewAttempt with self-scores; dashboard shows score trend per case.
5. "Common mistakes" checklist for the case shown after review.
6. Practice mode (untimed, hints free) vs Mock mode (timed, hints cost, no pause).
7. Until case studies exist (Prompt 20a–c), build and test with one small fixture case
   in /tests/fixtures, not in /content.

Definition of Done: CLAUDE.md §8.
```

### Prompt 20a / 20b / 20c: Case Studies

Run this prompt **three times**, swapping the case list each time: 20a = cases 1–5, 20b = 6–10, 20c = 11–15.

```markdown
Read CLAUDE.md §7 and the case-study format below. Task: write these case studies
completely: [20a: 1–5] / [20b: 6–10] / [20c: 11–15].
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."
(Here a "section" is one case study; use its id as the marker.)

Case list:
1 url-shortener | 2 rate-limiter-service | 3 news-feed | 4 chat-app |
5 notification-system | 6 typeahead | 7 video-streaming | 8 ride-sharing |
9 file-sync | 10 payment-system | 11 ticket-booking | 12 job-scheduler |
13 web-crawler | 14 metrics-monitoring | 15 rag-docs-assistant

For EACH case create /content/case-studies/<id>/ with:

meta.json: id, title, difficulty (1–3), weekRecommended, relatedSectionIds,
  interviewerPrompt (2–4 sentences, deliberately underspecified like a real interview),
  clarifyingQuestions [{question, answer}] (8–12),
  deepDiveQuestions [] (3–5), trafficProfile (for Run Mode: qps, readWriteRatio,
  requestTypes), runChallenge (target metrics), commonMistakes [] (5–8).

solution.mdx (2,500–5,000 words), sections in this exact order:
  1. Requirements (functional, non-functional, out of scope)
  2. Estimation (every number derived step by step)
  3. API design (endpoints with request/response examples)
  4. Data model (entities, keys, DB choice with justification)
  5. High-level design (Mermaid diagram + walkthrough of each request type)
  6. Deep dives (one H3 per deepDiveQuestion, with alternatives considered and the
     tradeoff that decides it)
  7. Failure modes & mitigations (table)
  8. Scaling to 10× (what breaks first and what changes)
  9. Tradeoffs summary (table: decision, alternative, why)
  10. What interviewers look for

design.json: a reference design in Design Studio JSON format (must load and pass its
  runChallenge in Run Mode: verify this programmatically in a test).

rubric.json: 10–14 criteria, grouped by framework step, each with descriptions for
  scores 0, 1, 2.

Case-specific must-covers:
- url-shortener: ID generation options (hash vs counter vs Snowflake), base62, 301 vs 302,
  read-heavy caching, analytics via async events, custom aliases, expiry.
- rate-limiter-service: algorithm choice, distributed counters in Redis, Lua atomicity,
  multi-region limits, failure mode (fail open vs closed).
- news-feed: fan-out on write vs read vs hybrid (celebrities), feed cache, ranking (high
  level), pagination with cursors.
- chat-app: WebSocket gateway, connection registry, message ordering per conversation,
  delivery receipts, offline delivery, group chat fan-out, presence, end-to-end encryption (awareness).
- notification-system: multi-channel (push/SMS/email), templates, user preferences,
  queues per channel, retries & DLQ, deduplication, rate limiting per user.
- typeahead: trie vs precomputed top-k, update pipeline from query logs, caching at edge, personalization (awareness).
- video-streaming: upload with multipart + presigned URLs, transcoding pipeline (DAG of
  jobs), adaptive bitrate (HLS/DASH), CDN strategy, metadata store, view counts.
- ride-sharing: location updates at scale, geospatial indexing (geohash/quadtree/H3),
  matching, trip state machine, surge (awareness), consistency of driver assignment.
- file-sync: chunking, content hashing & dedup, metadata vs block storage, sync protocol,
  conflict handling, Merkle trees / delta sync, notifications of changes.
- payment-system: idempotency keys, double-entry ledger, state machine, PSP integration,
  reconciliation, exactly-once effects, audit, never losing money.
- ticket-booking: seat inventory contention, temporary holds with expiry, optimistic vs
  pessimistic locking, virtual waiting room for spikes, payment timeout handling.
- job-scheduler: job definitions, time-based triggers, leader election or partitioned
  scheduling, at-least-once execution + idempotent jobs, retries, visibility.
- web-crawler: URL frontier, politeness per host, dedup (URL + content hashing, Bloom
  filters), robots.txt, distributed workers, recrawl scheduling.
- metrics-monitoring: high-cardinality write path, time-series storage & compression
  (awareness), downsampling, query path, alert evaluation.
- rag-docs-assistant: ingestion pipeline, chunking, hybrid retrieval, permissions-aware
  retrieval (document ACLs), caching, evals, cost controls, freshness.

Definition of Done: CLAUDE.md §8 + every design.json passes its runChallenge test.
```

### Prompt 20d: Phase 7 Content (Interview Mastery)

```markdown
Read CLAUDE.md §7 and §10. Task: write ALL Phase 7 sections fully (all six files each).
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."
Phase 7 teaches HOW to run a system design interview, using everything from Phases 1–6
and the 15 case studies. No new simulators: embed existing ones and link to
/interview/[caseId] for practice.

Sections and MUST-COVER points:

1. interview-framework (week 14): the 7 steps (Requirements, Estimation, API, Data Model,
   High-Level Design, Deep Dives, Wrap-up) as the home of this framework; a time budget
   for a 45-minute interview; what to say and what to draw at each step; how to drive the
   conversation; a full worked walkthrough of url-shortener step by step.
   Embed estimation-calculator.
2. requirements-scoping (week 14): functional vs non-functional requirements; a bank of
   reusable clarifying questions (users, scale, read/write mix, latency, consistency,
   durability, regions); stating assumptions out loud; cutting scope on purpose.
3. building-blocks-map (week 14): one decision table mapping problems to components
   ("need X → consider Y, watch out for Z") covering LB, cache, CDN, queue, SQL, NoSQL,
   object storage, search, sharding, replication, rate limiter, vector DB; every row
   links to its Phase 1–6 section.
4. tradeoff-communication (week 14): presenting 2–3 options with criteria; turning
   "it depends" into a decision; handling pushback (defend vs change your mind);
   saying "I don't know" well. Include 5 short example exchanges.
5. deep-dive-patterns (week 15): the recurring deep dives — hot keys & celebrities,
   fan-out, idempotency & exactly-once effects, consistency vs availability choices,
   scaling reads vs writes, backpressure, multi-region. For each: the problem signal,
   2–3 standard solutions, and which case studies use it.
6. mock-interview-playbook (week 15): how to use Interview Mode (practice vs mock),
   self-review with rubrics, running a peer mock (script for interviewer and candidate),
   tracking scores over time, which 6 cases to mock first and why.
7. level-expectations (week 16): how expectations generally differ for junior, mid and
   senior engineers (depth of tradeoffs, driving the discussion, operational concerns).
   Describe general patterns only; do not claim any specific company's internal rubric.
8. final-review (week 16): a last-two-weeks routine using /today weak spots, flashcard
   review, re-doing failed simulator challenges and mocks; links to the interview-day
   checklist cheat sheet.

Also:
- Update plan.json so weeks 14–16 include these sections (1–4 in W14, 5–6 in W15,
  7–8 in W16) alongside the case studies already scheduled.
- Quizzes here are mostly scenario-type: show a candidate's answer and ask what is
  missing or what to do next.

Definition of Done: CLAUDE.md §8, all files pass validation, every section renders,
sidebar shows Phase 7 with real sections.
```

## Finishing prompts (21–24)

AI features are optional and work only with your own API key. The reference library and polish pass make the site complete enough to study from without any other website. Prompt 24 puts it online.

### Prompt 21: AI Features (Optional, Bring Your Own Key)

```markdown
Read CLAUDE.md. Task: add optional AI features. Everything must work without a key and
degrade gracefully.

1. Settings → AI: provider selector (Anthropic, OpenAI-compatible endpoint), API key
   (stored only in IndexedDB in Settings.apiKey; never sent anywhere except the chosen
   provider; never included in "Export all data"; clear warning text about storing keys
   in the browser), model name, "Test connection".
   /lib/ai/client.ts: provider-agnostic interface with streaming, timeout (60s),
   one retry with backoff, clear error messages (invalid key, rate limit, network).
   Check each provider's current docs for direct browser access (some require an
   explicit opt-in header, others block browser requests with CORS). If a provider
   blocks browser requests, explain that in the UI and document an optional tiny local
   proxy script in /scripts/ai-proxy.
2. AI Tutor (RightPanel tab): context-aware chat. System prompt includes the current page
   title, section topics and (trimmed) lesson text. Modes: "Explain simpler",
   "Give me an example", "Quiz me on this page", "Check my understanding" (learner explains,
   tutor critiques). Streamed responses with markdown. Conversation stored per page in
   the TutorConversation table (CLAUDE.md §4).
3. AI Interviewer (Interview Mode): when enabled, the interviewer
   - answers clarifying questions in character (grounded in meta.json clarifying answers),
   - asks follow-up deep-dive questions based on the learner's current design
     (send a compact text serialization of the graph + panels),
   - after submission, scores against rubric.json with a justification per criterion
     and 3 specific improvements, saved in InterviewAttempt.aiFeedback. Show AI scores
     next to self-scores (never replace them).
4. Explain-my-design button in Design Studio: identifies bottlenecks, SPOFs and missing
   pieces, referencing Run Mode metrics.
5. Token/cost display per request (estimated) and a monthly usage counter stored in the
   AiUsage table (CLAUDE.md §4).
6. All AI output is labeled "AI-generated: may contain mistakes".

Definition of Done: CLAUDE.md §8; with no key, all AI entry points show a friendly
"Add an API key in Settings" message; unit tests for the graph serializer, prompt
builders, and that exports never contain the key.
```

### Prompt 22: Reference Library, Resources & Capstone Guide

```markdown
Read CLAUDE.md §5 and §7. Task: build the reference layer.

1. /reference and /reference/[sheet] with cheat sheets in /content/cheatsheets (one MDX
   each, styled as Field Manual spec sheets, printable via a print stylesheet):
   latency numbers; availability nines & math; estimation formulas & conversions;
   database selection guide; caching strategy guide; consistency models; messaging
   semantics; reliability patterns; the 7-step framework (1-page, matching Phase 7);
   "tradeoffs glossary" (50 common tradeoffs, one line each); interview day checklist.
2. /resources: library from resources.json (aggregate all section resources + extra):
   filter by topic, phase (derived from topicIds), kind and free/paid; search.
   Include the classics:
   Designing Data-Intensive Applications (Kleppmann), System Design Interview Vol 1 & 2
   (Alex Xu), Google SRE Book & Workbook (free online), Release It! (Nygard),
   The System Design Primer (GitHub), High Performance Browser Networking (free),
   Dynamo, Bigtable, Spanner, Raft papers, plus engineering blogs (Netflix, Uber, Discord,
   Stripe, Cloudflare, Meta, Shopify). Never fabricate URLs; if unsure, link the
   publisher/blog homepage.
3. /capstone: a step-by-step guide (10 stages) to build a URL shortener with analytics
   LOCALLY (clearly state it runs on the learner's machine, not in the browser):
   stage 1 single service + Postgres → 2 Docker Compose → 3 Redis cache-aside →
   4 two app instances behind Nginx → 5 read replica → 6 rate limiter → 7 click events
   to a queue (Redpanda or RabbitMQ) + consumer → 8 Prometheus + Grafana dashboards →
   9 OpenTelemetry tracing (Jaeger) → 10 load testing with k6.
   Provide full, working code for each stage (Node.js/TypeScript or Python: pick one,
   note it in DECISIONS.md): docker-compose.yml, service code, config files, k6 scripts.
   Include a "Break it" checklist (8 experiments: kill cache, kill replica, kill one app
   instance, slow DB with tc/netem or a sleep injection, flood traffic, fill disk
   (simulated), restart broker, clock skew discussion) with what to observe and how to fix.
   Each stage has checkboxes saved as CheckpointState rows (ids "capstone-<stage>-<n>")
   so they appear in progress and backups.
   Also offer the whole capstone as a downloadable zip generated in-browser (JSZip).

Definition of Done: CLAUDE.md §8. Capstone code must be syntactically valid
(lint the code files in CI) and the compose file must validate with `docker compose config`
if Docker is available; otherwise note it.
```

### Prompt 23: Polish, Accessibility, Performance & Full QA

```markdown
Read CLAUDE.md. Task: final polish and verification. Do not add features.

1. Performance: route-level code splitting; lazy-load PGlite, Pyodide, Monaco, Mermaid,
   React Flow-heavy pages; Lighthouse ≥ 90 performance on lesson pages (desktop);
   simulators keep 60fps in default config (profile the 5 heaviest and fix).
2. Accessibility: run axe on every route in both themes (Playwright +
   @axe-core/playwright); fix all serious/critical issues; keyboard-only walkthrough of
   lessons, quiz, flashcards, one simulator, Design Studio basics; screen-reader labels
   on all simulator controls.
3. Mobile pass at 375px and 768px on every route type; fix overflow and touch targets ≥ 44px.
4. Design pass: compare every screen with /design; fix drift in tokens, type and
   components; confirm no drafting grid or heavy motion on lesson pages and that motion
   is fully off under prefers-reduced-motion.
5. Empty states, loading states and error boundaries on every page (friendly messages,
   retry buttons). 404 page.
6. Content QA script in /scripts: validates all content, checks every internal link and
   every <Simulator id>, <Term slug>, section/case reference resolves; reports orphan
   glossary terms and sections missing any Content Standard element. Confirms all 7
   phases have sections and plan.json references only sections that exist.
7. Offline: add a service worker (Serwist or an equivalent maintained option) so lessons
   work offline after first visit and simulators work offline after their first use
   (heavy WASM is cached on first use; Prompt 24 finalizes caching); "Install app" prompt.
8. Full Playwright suite: every route loads without console errors; complete one quiz,
   one flashcard review, one simulator challenge, create/save/reload a design, run one
   interview in practice mode, export/import progress.
9. Write README.md: what the app is, how to run, architecture overview, how to add a
   section / simulator / case study (link to CLAUDE.md), known limitations.

Definition of Done: CLAUDE.md §8 + all of the above reported with numbers
(Lighthouse scores, axe results, test counts).
```

### Prompt 24: Deploy

```markdown
Read CLAUDE.md. Task: deploy SysDesign Lab publicly. No new features.
1. Choose static export (output: 'export' in next.config) if every route works without a
   server; otherwise deploy to Vercel. Note the choice and reason in DECISIONS.md.
2. Make sure WASM and large assets (PGlite, Pyodide, Monaco, embeddings JSON) load
   correctly in production: correct MIME types, caching headers, and paths that work
   under a sub-path if deployed to one.
3. Set the headers PGlite/Pyodide need, if any (for example cross-origin isolation for
   SharedArrayBuffer); verify no other feature breaks because of them.
4. The service worker precaches lessons and app shell only; heavy WASM is cached on
   first use. Add a cache version so updates replace old files.
5. Add a basic CSP and security headers that still allow the chosen AI provider endpoints.
6. Set up CI (GitHub Actions): on every push run typecheck, lint, unit tests, build and
   the Playwright suite against a production build; deploy only from main when all pass.
7. Add a /about page: what the site is, that all data stays in the browser, how to back
   up progress, and that AI features use the learner's own key.
8. Run the full Playwright suite against the deployed URL and report results.
Definition of Done: CLAUDE.md §8 + the site works at the deployed URL, including one SQL
sandbox query, one Python lab run, one simulator challenge and offline reload of a lesson.
```

## Utility prompts (U1–U8)

Use these between build prompts. U1 starts every session; U7 rescues a prompt that stopped halfway.

### U1: Resume a Session

```markdown
Read CLAUDE.md, CHANGELOG.md and DECISIONS.md. Run pnpm typecheck, lint, test and build.
Summarize in 5 bullets: what exists, what's broken (if anything), and which prompt was
last completed. Fix anything broken before we continue. Then wait for the next prompt.
```

### U2: Bug Fix

```markdown
Bug: [describe what you did, what you expected, what happened; paste any console error].
Reproduce it first (write a failing test if possible), find the root cause, fix it with
the smallest change, confirm the test passes, and check nothing else broke
(run the full test suite). Explain the cause in 2–3 sentences.
```

### U3: Content Accuracy Review

```markdown
Review all content in Phase [N] (1–7), or case studies [ids], as a senior
distributed-systems engineer and a strict technical editor. For each section or case
check: technical accuracy, missing must-cover points (per its prompt), quiz questions
with more than one defensible answer, weak distractors, explanations that don't explain
why wrong answers are wrong, undefined terms, and any fabricated statistics or URLs.
Produce a findings table first (section, issue, severity, fix), then apply all fixes.
Don't rewrite content that's already correct and clear.
```

### U4: Add a New Simulator

```markdown
Add a new simulator following CLAUDE.md §5 and §6 exactly.
Id: [id]. Section(s): [section ids]. Purpose: [what concept it teaches].
Inputs: [...]. Model behavior: [...]. Faults: [...]. Metrics: [...].
Challenges: [2–4 with win conditions]. Simplifications to disclose: [...].
Register it, embed it in its section(s), add tests and a guided tour.
```

### U5: Add a New Lesson Section

```markdown
Add a new section following CLAUDE.md §7 exactly.
Phase: [N]. Week: [W]. Slug: [slug]. Title: [title].
Must-cover points: [list]. Related simulators: [ids]. Related case studies: [ids].
Create all six files, add glossary terms, update plan.json if needed, verify it renders.
```

### U6: Phase Verification Audit

```markdown
Audit everything built for Phase [N] against its prompts and CLAUDE.md.
N is 1–7; find the phase's prompts in CLAUDE.md §10:
1 = Prompts 06–07, 2 = 08–09, 3 = 10–11, 4 = 12–13, 5 = 14, 6 = 15,
7 = 20d plus the case studies (20a–20c) and the tools it relies on (17–19).
For work outside the phases (Prompts 00–05, 16, 21–24), name the prompt numbers
instead of a phase.
Produce a checklist table: requirement → status (done / partial / missing) → evidence
(file path or test name). Then complete everything partial or missing, and re-run the
full Definition of Done.
```

### U7: Continue After a Cut-Off

```markdown
You stopped partway through Prompt [NN]. Read CLAUDE.md and CHANGELOG.md, then run
git status and git diff --stat to see exactly what exists. Find the last
"Next: <item>" marker you printed for Prompt [NN] (in this conversation, or ask me to
paste it). Check that the item before that marker is really complete (files exist,
validation and its tests pass); finish it if not. Then carry on from the item the
marker names, keep printing "Next:" markers, and do not redo or rewrite finished
files. When the prompt is complete, run its Definition of Done.
```

### U8: Weekly Study Check-in

Use this once the site is usable, in a normal chat with Claude, not in Claude Code. Paste your exported progress JSON (the API key is never in it) or a screenshot of /dashboard.

```markdown
I'm in week [W] of my 16-week system design plan. Here is my progress: [paste dashboard
numbers or export]. Act as a strict study coach. Tell me: (1) which weak spots matter
most for interviews, (2) a plan for my next 7 days that fits [H] hours, (3) 5 rapid-fire
questions on this week's topics. Ask them one at a time, then grade my answers.
```

## Final tips

- **Lock the design system first.** Finish the Field Manual designs and export them to `/design` before Prompt 01. Changing fonts and colors after 20 prompts means touching every screen.
- **Readability beats style on lesson pages.** Keep the grid, crosshairs and heavy motion on the landing page and simulators. Lessons stay calm, because you'll read them for 16 weeks.
- **Expect about 30–40 sessions in total.** Content and simulator prompts are the heaviest. Use U7 when one stops, and U6 at the end of each phase.
- **Run U3 after every content prompt.** It's the cheapest way to catch mistakes before you study from them.
- **Study while you build.** Once Prompts 00–07 are done, Phase 1 works, so start Week 1 while the rest gets built.
- **Short on time? Use this order:** 00 → 05, then 06–09, 10–11, 17–19, 20a, 20d, 24. That gives you foundations, data, caching, messaging, the Design Studio, five case studies, the interview playbook and a live site.
- **Check new versions before Prompt 01.** Library APIs change. If an install fails, tell Claude to use the latest stable version and record it in DECISIONS.md.
