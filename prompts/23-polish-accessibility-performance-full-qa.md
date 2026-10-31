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
