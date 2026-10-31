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
