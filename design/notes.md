# /design — notes for Claude Code

This folder is the approved look of SysDesign Lab ("Field Manual" design system, landing direction A).
CLAUDE.md §5 says: match these files closely; when a detail is missing, follow the rules below.

## What is in here

| Path | What it is | How to use it |
| --- | --- | --- |
| `tokens.json` | Every token: colors for both themes, type scale, spacing, radius, borders, shadows | Source of truth. Generate CSS variables from it. |
| `tokens.css` | The same tokens already compiled to CSS variables | `:root` / `[data-theme="paper"]` = light, `[data-theme="blueprint"]` = dark. Copy into the app's global CSS or regenerate from tokens.json. |
| `components.css` | Reference styles for every component (`fm-*` classes) | Port to Tailwind / CSS modules; keep values identical. |
| `design-system.md` | The brand book: principles, voice, color, type, motion, layout, accessibility | Read before building any screen. |
| `components/<Name>/preview.html` + `README.md` | Live reference for each component, with usage rules | Open the HTML in a browser; rebuild as React in `/components/brand` or `/components/ui`. |
| `screenshots/components/*.png` | Every component in Paper and Blueprint | Visual check. |
| `landing/landing.html` | The approved landing page (direction A), plain HTML | Rebuild as `app/page.tsx` with real components. |
| `screenshots/landing-1440.png`, `landing-390.png` | Landing at desktop and phone width | Prompt 01's Definition of Done compares against these. |
| `directions/` | Directions A, B and C side by side (B and C were not chosen) | Reference only. Do not build B or C. |

## Fonts (exactly two typefaces + one mono)

- **Archivo** (Google Fonts): display at weight 800 with tight tracking, and all body text at 400–600.
- **Instrument Serif Italic** (Google Fonts): exactly ONE word per headline, in the accent color (`--cobalt`). Never body text.
- **IBM Plex Mono** (Google Fonts): uppercase, letter-spacing 0.12–0.14em, for labels, captions, table headers, tabs, stamps, metrics and the HUD.
- Load with `next/font/google`. Do not add a fourth family.

## Type scale (from tokens.json)

display 96–116px / h1 64 / h2 40–80 (section titles) / h3 28 / h4 20 / body-lesson 18 (line-height 1.6, max 68ch) / body 16 / small 14 / mono-label 12 / mono-caption 11 / mono-metric 32 / mono-timer 72.
Mobile: display ≈ 64, h1 44, h2 32–44, body-lesson 17.

## Color

- Paper (default): `--paper #F4EFE4`, `--surface #FAF7F0`, `--ink #121212`, `--ink-muted #4F4A42`, accent `--cobalt #3B4CF5`.
- Blueprint (dark): `--paper #0A1020`, `--ink #E8EEF6`, accent `#8A97FF`. Same structure, chalk lines on navy.
- Phase colors 1–7: sage, lime, coral, plum, lavender, cobalt, charcoal (`--phase-N`, text on them `--on-phase-N`).
- Status: OK / Hot / Overloaded always with glyph + word (● ▲ ■). All pairs pass WCAG AA in both themes.

## The hero: PhasePath (not a stack of system layers)

The landing hero is the curriculum drawn as **seven isometric steps climbing from Phase 1 to Phase 7**. Each step carries one shape for what that phase teaches:

| Step | Phase | Shape |
| --- | --- | --- |
| 1 | Foundations & Networking | two machines joined by a wire, a packet in flight |
| 2 | APIs, Data, Storage & Search | a database cylinder |
| 3 | Caching & Messaging | a queue of messages |
| 4 | Distributed Systems & Reliability | a ring of five consensus nodes |
| 5 | Observability, Security, Deploy | a shield with a heartbeat line |
| 6 | Advanced & AI-Native | a vector graph around one query node |
| 7 | Interview Mastery | a flag at the summit |

Exact geometry, colors and motion: `components/PhasePath/README.md` and `preview.html`. Build it as one inline SVG React component, `PhasePath`, with props `active` (1–7), `labels`, `interactive`. Steps rise in order on first view (400ms, 70ms stagger); nothing moves under `prefers-reduced-motion`.

## Rules that are easy to get wrong

1. Lesson pages stay calm: no drafting grid, no crosshairs, no heavy motion behind reading text. Grid only in heroes and simulator canvases.
2. Borders, not shadows. Radius 2px (controls) or 4px (cards), never more except callout circles. Only hard offset shadows (`3px 3px 0 0`), never blurred.
3. One accent color. Selected, focus, links and the italic word use it; nothing else is blue.
4. Never color alone: phases show their number, status shows glyph + word, depth shows a printed stamp.
5. Focus ring: 2px solid accent, 2px offset, on every interactive element.
6. Every figure gets a FigureCaption (`FIG. <section>.<n> · SUBJECT · DETAIL`). Every simulator/design title gets a SpecLabel (`S-03 · LOAD BALANCER · LIVE`).
7. The HudBar (32px mono strip) sits at the bottom of every screen.
8. No emoji, no icon-in-rounded-square tiles, no gradients, no glassmorphism.

## Screens not yet drawn

Only the landing page and the components are drawn. For Today, Lesson, Simulator, Design Studio, Interview and Dashboard, compose them from these components and the rules above (the prompts describe each screen's content).
