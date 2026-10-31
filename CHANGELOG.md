# Changelog

## Prompt 01 · Scaffold & app shell
- Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui (restyled), every §2 dependency installed.
- Field Manual tokens for Paper and Blueprint, fonts (Archivo, Instrument Serif italic, IBM Plex Mono) via next/font, theme toggle Paper / Blueprint / System.
- Brand components: FigureCaption, NumberedCallout, PartsList, SpecLabel, HudBar, PhasePath, DepthStamp, StatusLabel (Vitest render tests).
- App shell: collapsible sidebar (drawer under 1024px), top bar with breadcrumb, ⌘K palette, right panel (Notes / AI Tutor, resizable), HUD bar.
- Shortcuts: ⌘/Ctrl+K search, [ sidebar, ] right panel, ? help.
- Landing page rebuilt from the approved design; every §3 route exists.
- Verify: `pnpm dev`, open / and /today; `pnpm test`; `pnpm test:e2e` (every route × both themes × 1440/375).

## Prompt 02 · Content system, search, glossary
- Zod schemas + loaders for sections, glossary, resources, plan and case studies; malformed files fail the build with file + field.
- MDX lesson renderer with DepthStamp, Figure, Callout, TradeoffBox, NotWhenBox, Misconception, InterviewAngle, Mermaid Diagram, Term tooltips, Simulator card, code blocks with copy.
- Section page: phase/week badge, topics with depth stamps, sticky table of contents, prev/next, HUD with section and reading time. Sidebar tree reads real content.
- ⌘K palette and /search with grouped, keyboard-navigable results; /glossary with A–Z bar and filter.
- First full section: §1.1 Client–server and where state lives (lesson, 10-question quiz, 15 flashcards, 5 checkpoints, 3 resources, 11 glossary terms).
- Verify: open /phase/1/client-server, press ⌘K and type "sticky", open /glossary. `pnpm test` includes the malformed-quiz test.

## Prompt 03 · Learning engine
- Dexie database (versioned schema) behind a StorageAdapter, with live hooks.
- Checkpoints persist, show "n/m done", and mark the section complete (all checkpoints + best quiz ≥ 80%).
- QuizPlayer: one question at a time, single/multi/scenario, explanations, per-topic results, retry wrong only / retry all, shuffled options.
- SM-2 flashcards: browse deck in lessons with "add all to review"; /flashcards daily queue with new/learning/review counts, phase filter, Space/1–4 keys and a daily new-card limit.
- Notes in the right panel (Markdown, autosave 500 ms), listed on /dashboard and included in search.
- Progress (40/40/20, or 50/50 without a simulator; completed sections keep their status when a simulator arrives) and weak spots, shown in the sidebar per phase and per section.
- Verify: tick a checkpoint and reload; take the quiz; add cards and review them at /flashcards; press ] and write a note. Unit tests: sm2, progress, weakspots.

## Prompt 04 · Plan, Today, Dashboard, backup
- content/plan.json: the 16-week schedule with section ids for every phase (unwritten ones show as "Coming soon"), simulators, case studies, a deliverable and hours per week.
- /plan: timeline of 16 expandable week cards in phase colours; the current week is open and outlined, with progress, checkmarked items and the deliverable.
- /today: flashcards due, next lesson, next simulator challenge, top weak spot and this week's deliverable, plus a catch-up banner when earlier lessons are unfinished. The HUD shows due cards, minutes today and streak.
- Study tracking: one active minute is counted when the tab is visible and there was input in the last 60 s, on lesson, simulator, flashcard, studio, interview, case-study and reference pages. Streak = consecutive days with at least 10 minutes.
- /dashboard: overall/week/streak/study time stats, per-phase bars, Recharts graphs (quiz accuracy, cards per day, minutes per day over 30 days), weak spots, interview attempts, notes.
- Settings: plan start date (defaults to the first visit), hours per week, new cards per day; export all data as JSON (no API key), import with a count preview and merge/replace, and reset with typed confirmation.
- Verify: open /plan and /today; set a start date 3 weeks back in /settings and see the catch-up banner; export and re-import. Tests: lib/learning/plan.test.ts (current week, streaks, backup round-trip) and tests/e2e/plan.spec.ts.

## Prompt 05 · Simulator framework
- Engine in lib/sim/engine: seeded RNG (mulberry32 with uniform/int/normal/exponential/poisson/pick), SimClock (10 ms ticks, 0.25×–4×, pause/step/reset, capped catch-up), EventQueue (binary heap, FIFO ties), metrics (counters, gauges, sliding-reservoir histograms with p50/p95/p99, per-second rates, 250 ms time series), event log ring buffer, the SimModel/Challenge/FaultDef interfaces and a framework-free Simulation runner.
- SimulatorShell: spec-label header with depth stamp, "What this models" drawer, guided tour, lesson link; auto-generated controls (slider/select/toggle); drafting-grid canvas with crosshairs; metric cards + Recharts series; filterable event log with auto-scroll; transport (play/pause/step/reset, speed, seed, reduced animation); Break it menu with removable fault chips; challenges with pass/fail detail saved as ChallengeResult; HUD with sim time, QPS and p99. Compact mode for lessons with "Open full screen".
- Canvas helpers (components/sim/draw.tsx): IsoBlock, Leader, Dot, Wire.
- Registry (lib/simulators/registry.ts) with code-split loaders; SIM_CHALLENGES now derives from it. /simulators grid with phase filter and challenge counts; /simulators/[id] renders the shell; `<Simulator id>` in MDX embeds registered simulators inline.
- Demo: single-server-queue (M/M/1) with a slow-server fault and a "p99 < 200 ms at λ = 80/s within a μ budget" challenge.
- Fixed: breadcrumbs linked to /phase and /interview, which have no page (prefetch 404s).
- Verify: open /simulators/single-server-queue, follow the tour, press Play, break it, then set μ = 150 and start the challenge at 4×. Tests: lib/sim/engine/engine.test.ts, single-server-queue/model.test.ts (M/M/1 mean latency within 15% of 1/(μ−λ)), registry.test.ts, tests/e2e/simulator.spec.ts.
