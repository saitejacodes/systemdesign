# Decisions

## Fixes to the kit (from FIXES.md, Prompt 00)
1. Hero = PhasePath (7 isometric steps climbing Phase 1 → 7, one shape per phase). Ignore any "IsoLayerStack" / "7 layers" mention.
2. Fonts exactly: Archivo (display AND body), Instrument Serif Italic (one accent word per headline), IBM Plex Mono (labels, captions, metrics, HUD). Never IBM Plex Sans, Inter or a system stack. Load with next/font/google.
3. design/landing/landing.html uses local CSS variables; rebuild it with the variables from design/tokens.json / tokens.css.
4. Only the Paper landing is drawn. Build Blueprint (dark) from the [data-theme="blueprint"] tokens: same layout, chalk on navy.
5. Today, Lesson, Simulator, Studio, Interview, Dashboard are not drawn: compose them from design/components/* and design/notes.md.
6. If design/notes.md and design/design-system.md disagree, notes.md wins.
7. Lesson pages: no drafting grid, crosshairs or heavy motion behind reading text.

## Prompt 01
- Next.js 16.4 (latest stable). `cacheComponents` is off: all content is static files, so the simpler caching model is enough.
- pnpm pinned to 10.24.0 via `packageManager` (corepack's pnpm 12 cache on this machine is broken). Use Node 22.
- shadcn/ui is the Base UI flavour (`base-nova`); its semantic CSS variables are mapped onto the Field Manual tokens in `app/globals.css`, radius capped at 4px.
- `design/components.css` and the landing styles are copied into `app/styles/` inside `@layer components`, so Tailwind utilities can override them. Values unchanged.
- PhasePath and the landing simulator preview use the approved SVG geometry from `design/landing/landing.html` (generated into `*-markup.ts`). Hover readouts, rise and draw-in motion are CSS from components.css.
- Theme choice is stored in localStorage (`sdl-theme`) and applied by an inline script before paint. It moves to the Dexie Settings table in Prompt 03 only if needed.
- The landing page keeps its own header (as drawn); every other route uses the app shell via the `app/(shell)` route group.
- Sidebar tree shows the 7 phases; sections come from content in Prompt 02 (empty phases say "Coming soon"). No placeholder section names.

## Prompt 02
- MDX via `next-mdx-remote/rsc` with `blockJS: false` (lessons are trusted repo files; props like `items={[...]}` need JS expressions).
- Search uses MiniSearch. The index is built at build time into the static route `/search-index.json` and loaded in the browser on first query. That route also runs cross-file validation, so bad content fails `pnpm build`.
- Content validation errors name the file and field path (`lib/content/parse.ts`). `lib/content/content.test.ts` also enforces the §7 volume targets for every section.
- `<Term>` tooltips are pure CSS (hover and keyboard focus), linking to `/glossary#slug`.
- Shiki renders both github-light and github-dark colours; CSS picks one per `data-theme`.
- `/phase/[n]` lists a phase's sections (the collapsed sidebar links there).

## Prompt 03
- Content-derived ids are namespaced in the DB: checkpoint `"<sectionId>:<checkpointId>"`, card `"<sectionId>:<cardId>"`.
- SM-2 follows Wozniak's original text: on q < 3 the card restarts (repetitions 0, interval 1 day) and the ease factor is left unchanged. Otherwise EF' is applied, min 1.3.
- Extra table `cardReviews` (one row per grading) feeds the daily new-card limit and the Prompt 04 dashboard. `CardState.reviewedAt` was added to tell new cards from learning ones.
- Card stages: new = never graded; learning = interval ≤ 6 days; review = longer.
- Only full quiz runs are saved as QuizAttempts; "Retry wrong only" is practice and does not change the best score.
- Hooks use Dexie `useLiveQuery` over the StorageAdapter. A remote adapter would need its own change feed.
- Notes are keyed by URL path and searched from IndexedDB at query time (not in the build index). Note previews use react-markdown with no raw HTML.
- `lib/simulators/challenge-index.ts` lists challenge ids per registered simulator; progress weighting reads it.

## Prompt 04
- `plan.json` `simulatorChallengeIds` entries are either `"simulatorId"` (all its challenges) or `"simulatorId:challengeId"`, because challenge ids are only defined by the simulator prompts.
- Section ids for unwritten phases come from the section lists in prompts 08, 10, 12, 14, 15 and 20d (`p<phase>-<slug>`).
- The current week counts calendar days from local midnight of the start date, clamped to 1–16. Before the start date it is week 1.
- A day that hasn't reached 10 minutes yet doesn't break the streak until it ends.
- "Behind" means a written lesson from an earlier week that isn't complete. Unwritten sections never count.
- Import keeps the local API key in both modes. Reset keeps the Settings row (theme, plan start, key) and clears everything else.
- Study time is counted only on learning pages (lessons, simulators, flashcards, studio, interview, case studies, reference, capstone), not on the dashboard or settings.

## Prompt 05
- "Pure" model means no React, DOM or globals, and deterministic for a seed. `tick` may mutate and return the same state object, so 60 fps runs don't copy state every tick.
- Histograms keep the last 1,024 observations (a sliding reservoir), so percentiles react to faults. Mean and count cover the whole run.
- Rates are per second over the last 1 s of sim time, read from the 250 ms counter samples.
- Challenges run live at the chosen speed. Config keys set by a challenge's `setup` are locked while it runs. A challenge passes once and stays passed; `bestValue` keeps the best value from passing runs (direction set by `better`, default lower).
- The guided tour opens automatically on a learner's first visit to each full-screen simulator (localStorage flag), never in lesson embeds.
- The Web Worker path is not built yet. shortcut: every model ticks on the main thread; add a worker runner when a model opts in with `worker: true` and can't hold 60 fps.
- Registry entries list `challengeIds` statically so progress can use them without loading the module. registry.test.ts checks they match the module.
- Uppercase mono labels wrap Greek letters in `.greek` (no text-transform), so μ never renders as M.

## Prompt 06
- Seven Phase 1 sections (DNS through realtime) were drafted in Antigravity, then rewritten and fact-checked here. Unverifiable company stats were replaced or removed rather than kept.
- Analogies use a new `analogy` Callout type instead of a separate component, so they share the box styling and the MDX stays simple.
- Lessons that embed simulators not built yet (Prompt 07) keep the `<Simulator id>` tag; the embed falls back to the plain simulator card until the registry has the id.

## Prompt 07
- Simulator config and controls live in each module's index.ts (as in Prompt 05) rather than a separate config.ts.
- Interactive simulators (estimation, request journey) still use the shared shell: the clock drives drill timers and the journey animation, and `Challenge.done` ends a run as soon as its goal is met.
- Load balancer service time is 60% fixed plus an exponential part (p99 ≈ 2.4× mean). A pure exponential put p99 near 270 ms with no queueing at all, which hid the effect of the algorithms.
- The heterogeneous-servers challenge accepts least connections as well as weighted round robin: both adapt to capacity, and the result explains the difference.
- Request journey: the "under 100 ms" challenge uses a 35 ms CDN edge, so it needs CDN, connection reuse and a cached DNS answer together (each alone fails). Resolvers usually cache root and TLD answers; the cold walk is shown as a worst case and stated in the simplifications.
- The fixed-window challenge requires choosing the boundary-attack pattern: plain Poisson traffic can also slip 2× through by chance, which is true but not the lesson.
- The token-burst challenge checks the measured burst (≥ 20 in one second) and that the refill rate is 5/s; average throughput alone can't distinguish R under bursty traffic with idle gaps.
- Drill inputs are labelled as illustrative assumptions, not company figures.

## Prompt 08
- Section JSON was generated from compact per-section specs with a scratch script that also checks volumes, topic ids and glossary slugs; the lessons were written by hand.
- Lessons embed `<Simulator>` only for simulators that exist (rate-limiter, consistent-hashing). Prompt 09's simulators are listed in meta.json `simulatorIds`, so they appear on the plan and section cards and become live when the registry gains them, without an embed that would link to a missing page.
- Vendor-specific behaviour is stated with the vendor named (Postgres defaults to Read Committed, InnoDB to Repeatable Read; S3 limits and consistency as AWS documents them). Where only an illustrative number exists (timeout rates, per-server capacity) the lesson says it's an assumption.
- Where practitioners disagree (how far to denormalise in relational stores, HTAP vs a separate analytics path), the lesson gives both sides.
- The plan e2e test now checks week 7 for "Coming soon": weeks 3–6 are fully live.
