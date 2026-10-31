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
