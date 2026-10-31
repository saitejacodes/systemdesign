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
