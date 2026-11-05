Read CLAUDE.md, CHANGELOG.md and DECISIONS.md. Task: get SysDesign Lab ready to deploy on Vercel. No new features.

State at start: Prompts 01–23, the design revision, the Studio tools and free arrows are done (last commit 20ce2b3).
There is no git remote yet, and the owner will push. Use Node 22 and pnpm 10.24.0, which is pinned in package.json.

1. Platform: Vercel only. Do not use `output: 'export'`. Record this in DECISIONS.md as the owner's choice.
   Add a `vercel.json` only if a header or setting can't live in `next.config.ts` `headers()`.
   Set framework=nextjs, installCommand `pnpm install --frozen-lockfile` and buildCommand `pnpm build`.
2. Large assets:
   - PGlite (.wasm/.data), Pyodide and Monaco (both from the cdn.jsdelivr.net / unpkg.com CDN) and any large JSON must load in a production build.
   - They need the correct MIME types (`application/wasm`).
   - Hashed `/_next/static/*` gets `Cache-Control: public, max-age=31536000, immutable`.
   - HTML gets no long cache.
3. Cross-origin isolation: find out whether PGlite or Pyodide actually need SharedArrayBuffer here.
   - If they do not, set no COOP/COEP headers.
   - If they do, scope the headers to the routes that need them. Use `COEP: credentialless` so the CDN loads still work.
   - Either way, prove nothing else breaks (Monaco, Mermaid, AI calls, the service worker).
   - Write the finding in DECISIONS.md.
4. Service worker (Serwist, app/sw.ts):
   - Precache only the app shell and lessons. Heavy WASM and CDN files are cached on first use.
   - Add a cache version constant so a deploy replaces old caches; old caches are deleted on activate.
   - Finish the "first-pass" limits noted in DECISIONS.md.
5. CSP and security headers, in next.config.ts `headers()`:
   - `connect-src` must allow 'self' and the AI endpoints:
     - https://api.anthropic.com
     - https://generativelanguage.googleapis.com
     - https://api.groq.com
     - https://openrouter.ai
     - https://api.openai.com
     - the CDN hosts (https://cdn.jsdelivr.net, https://unpkg.com)
     - http://localhost:* and http://127.0.0.1:* (the optional local AI proxy from Prompt 21)
   - The "openai-compatible" custom base URL can't be listed ahead of time. Choose the simplest safe option, document it in DECISIONS.md, and show a clear error in Settings when the CSP blocks a custom host.
   - `script-src` needs 'wasm-unsafe-eval' (PGlite/Pyodide) and whatever Next's inline scripts and Monaco need. Avoid nonces if they would force dynamic rendering.
   - `worker-src` covers 'self' and blob:. `style-src` keeps 'unsafe-inline' for Mermaid and React Flow.
   - Also set: `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a Permissions-Policy that turns off camera, mic and geolocation.
   - Test the CSP in the production build with the browser console open on every route. There must be zero CSP violations.
6. CI: add `.github/workflows/ci.yml`.
   - On every push and pull request run `pnpm install --frozen-lockfile`, typecheck, lint, unit tests and build.
   - Then run the Playwright suite against `pnpm start`, i.e. the production build, not dev.
   - Cache the pnpm store and the Playwright browsers.
   - Deploy only from main and only when every check passes. Use the Vercel Git integration with the "CI" check set as required, OR a deploy job with the Vercel CLI using `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` secrets. Pick one and document it.
   - Make the Playwright config honour `PLAYWRIGHT_BASE_URL`, so the same suite can run against a deployed URL.
7. /about already exists at app/(shell)/about. Check that it says what the site is, that all data stays in the browser, how to back up and restore progress (Settings export/import), and that AI features use the learner's own key, which is never exported. Fix only what is missing.
8. Production check, run locally:
   - Run `pnpm build && pnpm start`, then the full Playwright suite against it.
   - By hand (or with Playwright), check one SQL sandbox query, one Python lab run, one simulator challenge, an AI Settings "test connection" error path (no real key needed), and an offline reload of a visited lesson.
   - Report the numbers.
9. Write a short "Deploy" section in README.md:
   - how to connect the GitHub repo to Vercel;
   - which env vars or secrets are needed (none for the site; the Vercel ones only if the CLI deploy is used);
   - how to run `PLAYWRIGHT_BASE_URL=https://<deployed-url> pnpm test:e2e` after the first deploy.
10. Update CHANGELOG.md, DECISIONS.md and PROGRESS.md.
   - Commit as "Prompt 24 done". The message must end with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
   - Never commit `.claude/` or `design/screenshots/revision/`.
   - Do NOT add a remote or push.

Definition of Done:
- CLAUDE.md §8 (typecheck, lint, unit, build, e2e all green).
- Zero CSP violations on every route in the production build.
- The four manual checks in step 8 pass.
- CI workflow and deploy docs are in place.
- Report what was built, how to verify it, and known limits (for example the custom AI hosts under CSP).
