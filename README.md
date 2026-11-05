# SysDesign Lab

A single website for learning system design end to end over a 16-week plan, aimed at backend engineers with 0–4 years
of experience. Every concept is practised, not just read: lessons are paired with interactive simulators, quizzes,
flashcards, a design canvas and timed interview practice. There is no backend; everything you do is stored in your
browser.

The project bible is [CLAUDE.md](CLAUDE.md). It defines the stack, folder layout, data schemas, the design system,
the Simulator Standard (§6) and the Content Standard (§7). Design decisions and their reasons are logged in
[DECISIONS.md](DECISIONS.md), and per-prompt changes in [CHANGELOG.md](CHANGELOG.md).

## What is in it

- **Curriculum: 7 phases over 16 weeks, 98 sections.** Foundations & Networking, APIs/Databases/Storage/Search,
  Caching & Messaging, Distributed Systems & Reliability, Observability/Security/Deployment, Advanced & AI-Native
  Systems, and Interview Mastery. Each section has a lesson (MDX), a quiz, flashcards, checkpoints and curated
  resources. `/plan` lays out the 16 weeks, `/today` shows what to do next, and `/dashboard` shows progress, streaks
  and weak spots.
- **Simulators (31).** Deterministic, seedable simulations with controls, live metrics, an event log, a "Break it"
  fault menu, 2–4 machine-checked challenges and a guided tour: queues, load balancers, caches, sharding,
  replication, quorums, Raft, sagas, rate limiters, circuit breakers, LLM inference, RAG and more. The SQL sandbox
  runs a real PostgreSQL in the browser (PGlite).
- **Code labs (15)** under `/simulators/code-labs`: implement an LRU cache, token bucket, consistent-hash ring, Bloom
  filter and others in Python, JavaScript, TypeScript, Java or C++. Python, JavaScript and TypeScript run in the
  browser (Python through Pyodide); Java and C++ are downloaded and run on your machine.
- **Design Studio** (`/studio`): a drag-and-drop architecture canvas (React Flow) with framework notes, templates for
  every case study, Run Mode (simulated traffic through your design, with a pass/fail run challenge) and SPOF
  analysis. Designs export as JSON and SVG.
- **Case studies (19)** with a written solution, a reference design and a self-review rubric: URL shortener, news
  feed, chat, ticket booking, payments, ride sharing, video streaming, RAG docs assistant, API gateway, search engine,
  Instagram, food delivery and others.
- **Interview Mode** (`/interview/<case>`): a timed run through the 7-step framework (Requirements, Estimation, API,
  Data Model, High-Level Design, Deep Dives, Wrap-up) in Practice or Mock mode, scored against the case rubric.
- **Flashcards** (`/flashcards`): spaced repetition with SM-2 across every section's cards.
- **Reference** (`/reference`): 11 cheat sheets (latency numbers, estimation, availability nines, consistency
  models, caching, messaging semantics, interview framework and others), plus a 681-term glossary and full-text
  search (MiniSearch).
- **Resources** (`/resources`): the books, papers, docs and talks the lessons cite, filterable by phase.
- **Capstone** (`/capstone`): "Serve an open-weights LLM like a frontier lab". A stage 0 design review plus 10 code
  stages, run locally with Docker: llama.cpp model servers, a TypeScript gateway speaking the OpenAI Chat Completions
  API with streaming, admission control, routing, rate limits, caching, a batch queue, observability, reliability
  and a k6 load test, then an 8-item Break-it checklist. The project downloads as a zip.
- **Optional AI features, bring your own key.** A lesson tutor, design explanations and an AI interviewer/scorer.
  Supported providers: Anthropic, Google Gemini, Groq, OpenRouter, OpenAI, or any other OpenAI-compatible endpoint.
  The key is stored in your browser and sent only to the provider you pick. Nothing in the app needs AI to work.

Progress (checkpoints, quiz attempts, card states, challenge results, notes, designs, interview attempts) can be
exported and imported as JSON from `/settings`. The API key is never included in exports.

## Running it

Requirements: Node.js 22 or newer and pnpm 10 (`packageManager` in package.json pins the version).

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Checks:

```bash
pnpm typecheck      # next typegen + tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest: models, loaders, content volume, case studies, labs, capstone
pnpm test:e2e       # playwright: builds, serves on :3100 with fixture case studies, runs every spec
pnpm qa:content     # content QA report (see below)
pnpm build          # production build; all content is validated with zod at build time
```

### Content QA

`pnpm qa:content` (`scripts/content-qa.ts`) loads all content through the app's own loaders and zod schemas
(sections, case studies, glossary, plan, resources, cheat sheets, code labs, capstone guides) and then checks:

- every internal link in MDX and JSON (`/phase/N/slug#heading`, `/simulators/id`, `/simulators/code-labs/id`,
  `/case-studies/id`, `/interview/id`, `/reference/slug`, `/capstone/N`, `/glossary#term` and the static routes);
- every `<Simulator id>` against `lib/simulators/registry.ts` and every `<Term slug>` against `glossary.json`;
- section references in meta.json (prerequisites, simulatorIds, practiceCaseStudyIds), plan.json, case studies,
  code labs, the simulator registry and the capstone guides;
- that all 7 phases have sections and plan.json lists only real sections, cases and simulators;
- every section against the §7 Content Standard (required elements, volume targets) and glossary terms that no
  lesson references.

Errors (invalid content, broken references, a lesson missing a required element) exit with code 1. Warnings
(volume targets, softer parts of the standard, orphan glossary terms) do not. `--json` prints the full report;
`--quiet` prints only the summary. The checks themselves are in `lib/content/qa.ts` and tested in
`lib/content/qa.test.ts`.

### Optional AI proxy

The app calls AI providers directly from the browser. Anthropic and the built-in Gemini, Groq, OpenRouter and OpenAI
presets accept that. For an OpenAI-compatible endpoint that does not send CORS headers, run the local proxy in
[scripts/ai-proxy](scripts/ai-proxy/README.md):

```bash
AI_PROXY_TARGET=https://api.example.com/v1 node scripts/ai-proxy/proxy.mjs
```

and point Settings → AI → "Other OpenAI-compatible endpoint" at `http://127.0.0.1:8787`.

## Architecture

Next.js 16 (App Router), React 19, TypeScript in strict mode, Tailwind CSS v4. No server state: pages are rendered
from files in `/content` at build time, and all user data lives in IndexedDB.

```
app/(shell)/            routes inside the sidebar/top-bar shell
  (learn)/phase/[phase]/[section]   lessons
  simulators/[id], simulators/code-labs/[labId]
  studio/[designId], interview/[caseId], case-studies/[id]
  reference/[sheet], capstone/[stage], plan, today, dashboard, flashcards, glossary, resources, search, settings
app/search-index.json, app/capstone-files.json   build-time JSON routes (search index, capstone zip contents)
components/             brand (Field Manual signature parts), layout, learn, sim, studio, interview, labs, capstone, ui
content/                all curriculum content (MDX + JSON)
lib/                    content loaders, storage, learning logic, simulator engine and models, studio, AI client
scripts/                content QA, optional AI proxy
tests/e2e, tests/fixtures
```

**Content pipeline.** `content/phases/phase-N/<slug>/` holds `meta.json`, `lesson.mdx`, `quiz.json`,
`flashcards.json`, `checkpoints.json` and `resources.json`. Case studies, cheat sheets, code labs, the capstone, the
glossary, the plan and the resource library sit beside them. `lib/content` reads these files with `fs`, validates
every file against the zod schemas in `lib/content/schemas.ts` (errors name the file and field) and runs cross-file
checks. The loaders import `server-only`, so content is only ever read on the server, and pages are statically
generated. Lessons are compiled with `next-mdx-remote` into the components in `components/learn` (DepthStamp,
Figure, TradeoffBox, NotWhenBox, Misconception, InterviewAngle, Term, Simulator, CheckpointList, QuizPlayer,
FlashcardDeck, ResourceList). Search is a MiniSearch index built from the same loaders.

**Storage.** `lib/db/adapter.ts` defines a `StorageAdapter` interface (get, all, where, put, bulkPut, delete, clear)
and a Dexie implementation. Every read and write of user data goes through it, so a remote backend could replace
Dexie without touching components. `lib/db/backup.ts` handles export and import. `lib/learning` holds the pure logic
on top: SM-2 scheduling, section completion, progress weighting, streaks, weak spots and plan scheduling.

**Simulators.** `lib/sim/engine` is the shared core: a seeded RNG, a simulation clock, an event queue and a metrics
registry. Each simulator lives in `lib/simulators/<id>/` with a pure, deterministic `model.ts` (no React, no DOM),
`challenges.ts`, a separate `view.tsx`, an `index.ts` that exports its `SimDefinition` (model, default config,
controls, challenges, tour, view, metric cards, charts, HUD), and `model.test.ts`. `lib/simulators/registry.ts` lists
every simulator with its metadata and a dynamic `load()` import, so each one is its own chunk. `components/sim`
renders any definition in the shared SimulatorShell (controls, canvas, live metrics, event log, Break it, challenges,
play/pause/step/reset, speed and seed).

**Design Studio.** `lib/studio` holds the graph model and component catalog, templates, undo history, JSON/SVG export
and the Run Mode traffic model (`lib/studio/sim`) with SPOF analysis. `components/studio` is the React Flow editor.
Interview Mode (`lib/interview`, `components/interview`) reuses the framework headings and the case rubrics.

**AI client.** `lib/ai/client.ts` is provider-agnostic: Anthropic through `@anthropic-ai/sdk`, everything else
through the OpenAI chat-completions protocol. It streams, times out after 60 s and retries once only if no text has
streamed. Token usage and an estimated cost are recorded per month (`lib/ai/usage.ts`, `lib/ai/pricing.ts`).

## Adding content

- **A section:** follow CLAUDE.md §7 (lesson order, volume targets, accuracy rules) and
  [prompts/U5-add-a-new-lesson-section.md](prompts/U5-add-a-new-lesson-section.md). Create the six files in
  `content/phases/phase-N/<slug>/`, add new terms to `content/glossary.json`, add the section to `content/plan.json`,
  then run `pnpm test` and `pnpm qa:content`.
- **A simulator:** follow CLAUDE.md §6 and
  [prompts/U4-add-a-new-simulator.md](prompts/U4-add-a-new-simulator.md). Add `lib/simulators/<id>/` with the files
  above, register it in `lib/simulators/registry.ts`, list it in the sections' `simulatorIds` and embed it with
  `<Simulator id="<id>" />`.
- **A case study:** add `content/case-studies/<id>/` with `meta.json`, `solution.mdx`, `design.json` and
  `rubric.json`, plus a matching Design Studio template in `lib/studio/templates.ts`.
  `lib/content/case-studies.test.ts` checks the solution's section order and length, and that the reference design
  passes its run challenge. A case without `rubric.json` stays hidden from `/case-studies` and Interview Mode.

## Known limitations

- All data is local to one browser. There are no accounts and no sync; clearing site data deletes progress. Use
  Settings → export to move or back up progress.
- AI features need your own API key, and requests are billed by your provider. Some OpenAI-compatible endpoints need
  the local proxy because they block browser calls; on the deployed site, custom endpoints must go through the
  proxy because the CSP allows only the listed providers and localhost.
- The capstone runs on your machine, not in the browser: it needs Docker with Compose v2, Node.js 22, about 2 GB of
  disk for model files and 4–6 GB of free RAM for the later stages (k6 for stage 10).
- Python code labs load Pyodide from the jsDelivr CDN on first use, so they need a network connection the first
  time. Java and C++ labs run locally, not in the browser.
- Simulators and Run Mode are teaching models with stated simplifications (each simulator's info drawer lists them);
  numbers are illustrative, not benchmarks.

## Deployment

The site deploys to **Vercel** (Next.js on Vercel's runtime; no static export). The site itself needs **no
environment variables or secrets**: there is no backend, and AI keys are entered by each learner in Settings.

**How deploys happen.** `.github/workflows/ci.yml` runs on every push and pull request: install, typecheck, lint,
unit tests, build, then the Playwright suite against `next start` (the production build). On a push to `main`,
a second job deploys to Vercel production only if all of that passed. `vercel.json` turns off Vercel's own
automatic deploys of `main`, so an untested commit never reaches production. Other branches still get Vercel
preview deploys.

**First-time setup**

1. Push the repository to GitHub.
2. In Vercel: **Add New → Project**, import the repository. Framework, install and build commands come from
   `vercel.json` (pnpm, `pnpm build`). Leave environment variables empty and deploy once.
3. Create a token at vercel.com/account/tokens. Find the **Project ID** (Project → Settings → General) and the
   **Team/Org ID** (Team → Settings → General, or `.vercel/project.json` after `vercel link`).
4. In GitHub: **Settings → Secrets and variables → Actions**, add `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
   `VERCEL_PROJECT_ID`. From then on, every green push to `main` deploys to production.

Without those three secrets the deploy job skips itself. To let Vercel deploy `main` on its own instead (no CI
gate), delete the `git` block from `vercel.json`.

**Test the deployed site**

```bash
PLAYWRIGHT_BASE_URL=https://<your-project>.vercel.app pnpm test:e2e
```

With `PLAYWRIGHT_BASE_URL` set, Playwright starts no local server. Tests that need the test-only fixture case
study skip themselves.

**Headers.** `next.config.ts` sends a Content Security Policy and security headers, built in
`lib/security/csp.ts`. Pages may call only this site, the listed AI providers, the jsDelivr/unpkg CDNs and
localhost. A custom OpenAI-compatible endpoint on another host is blocked: Settings says so and points to the
local proxy (`scripts/ai-proxy`). The code-lab workers in `/labs` alone get `'unsafe-eval'` to run learner code.
No cross-origin isolation headers are set, because nothing uses SharedArrayBuffer.
