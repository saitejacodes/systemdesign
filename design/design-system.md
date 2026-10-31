SysDesign Lab is a system design learning platform drawn as an engineering field manual: technical drawings, exploded isometric diagrams, numbered callouts, parts lists and spec sheets, set with bold editorial type. It must stay a calm place to read for hours. Precision first, a little play second.

## Principles

1. **Readable first, stylish second.** Lessons sit on plain `paper` in `body-lesson`. Grids, crosshairs and heavy motion belong to the landing page and simulator canvases only.
2. **Everything is a drawing.** The hero is `PhasePath`: the curriculum as seven isometric steps, each with a shape for what that phase teaches. Diagrams get a `FigureCaption`, parts get a `NumberedCallout`, titles get a `SpecLabel`, inventories get a `PartsList`.
3. **One accent.** `cobalt` marks links, the selected thing, focus, live dots and the one italic word in a headline. Nothing else is blue.
4. **Borders, not shadows.** Hairline `ink` borders, 2–4px radii, and the hard offset `shadow-hard` for the single most important card. Never a blur.
5. **Never color alone.** Phases carry their number, status carries a glyph and a word, depth carries a printed stamp.

## Content fundamentals

- Voice: a senior engineer explaining at a whiteboard. Direct, plain, specific. "You design it. Then you break it."
- Address the learner as "you". Sentence case for headings and buttons; UPPERCASE only in mono labels.
- Numbers are real and labelled with units: "QPS 12,400 · P99 182ms", never "high traffic".
- Section references use `§`: "§3.2 Cache strategies". Figures use `FIG. <section>.<n>`. Sheet codes: `B-` lesson figure, `S-` simulator, `D-` design, `C-` case study.
- Headlines: one italic `accent-italic` word in `cobalt`, the verb or the twist ("Then you *break* it.", "Cache it, then *invalidate* it."). Exactly one, never in body text.
- No emoji, no exclamation marks, no filler stats.

## Visual foundations

### Color
- Two themes. **Paper** (first): `paper` #F4EFE4 ground, `surface` cards, `surface-sunk` wells, `ink` #121212 for text and lines. **Blueprint**: `paper` becomes deep navy #0A1020, `ink` becomes chalk #E8EEF6, accents brighten. Blueprint is a night drawing, not an inverted Paper: same structure, chalk lines on navy.
- Text: `ink` and `ink-muted` on `paper`, `surface`, `surface-sunk` in both themes (6.8:1 or better). `cobalt` text 4.6:1 or better on all three grounds.
- Phase layers `phase-1` … `phase-7`: sage, lime, coral, plum, lavender, cobalt, charcoal. Use them for phase squares, iso plates, progress and chart series. Text on them is always `on-phase-N`.
- Status: `status-ok` / `status-hot` / `status-over` for text and glyphs; the `-fill` tokens for chips and nodes with `ink` text on them.
- `line` is decorative only. Controls use `line-strong` (= `ink`), which meets 3:1 everywhere.

### Type
- **Display** (Archivo 800, tight tracking): `display` 96px hero, `h1` 64, `h2` 40, `h3` 28, `h4` 20. Mobile: display 56, h1 44, h2 32.
- **Accent** (Instrument Serif italic): `accent-italic`, one word per headline, `cobalt`, at the headline's size.
- **Text** (Archivo 400/500/600, the same family as display): `body-lesson` 18/1.6 for lessons (max 68ch; 17px on mobile), `body` 16/1.55 for UI, `small` 14.
- **Mono** (IBM Plex Mono): `mono-label` 12px and `mono-caption` 11px, UPPERCASE with 0.12–0.14em tracking, for labels, captions, table headers, tabs, HUD and stamps; `mono-body` for code and logs; `mono-metric` 32px and `mono-timer` 72px with tabular figures for live numbers.
- Two typefaces plus one mono, no more: Archivo (display and text), Instrument Serif (the one italic word), IBM Plex Mono. All three are open-licensed on Google Fonts; `components/bundle.css` imports them.

### Space, radius, borders
- 4px base: `space-1` 4 … `space-9` 96. Card padding `space-4`, gaps between cards `space-5`, page sections `space-8` (desktop) / `space-7` (mobile).
- `radius-0` for tables, frames, HUD and phase squares; `radius-sm` 2px for controls; `radius-md` 4px for cards (the maximum); `radius-round` only for callout circles and live dots.
- `border-hairline` 1px for cards and rules; `border-rule` 1.5px for controls and plate outlines; `border-heavy` 2px for the parts-list top rule, the selected quiz option and the active tab.

### Surfaces and texture
- `DraftingGrid` (32px, optional 8px minor, `grid` token) with crosshairs and one registration mark: hero areas and simulator canvases only.
- Lesson pages, quizzes, forms and tables are plain `paper` / `surface`.

### Layout
- Desktop 1440: left sidebar 280px (curriculum tree of `PhaseLayer`s), content (860px max for lessons, full width for simulators and studio), right panel 340px (Notes / AI Tutor), `HudBar` 32px pinned at the bottom.
- Mobile 390: sidebar becomes a drawer, right panel a bottom sheet, simulator controls stack above the canvas; the HUD keeps its live item and two values.
- 12-column grid, 24px gutters; align figures to the text column's left edge.

### Motion
- Diagrams assemble once on first view: the `PhasePath` steps rise in order (400ms, 70ms stagger), then callout leader lines draw in (300–350ms).
- Request dots travel along connections at simulation speed; async edges are dashed.
- Hover lifts (150ms), flashcard flip (350ms), toggle knob (150ms). Nothing loops except the live HUD dot.
- Everything is 150–400ms and fully off under `prefers-reduced-motion` (the final state shows at once).

### States
- Hover: buttons and link cards lift 2px onto `shadow-hard`; rows lift to `surface`.
- Focus: 2px solid `focus` ring, 2px offset (3px on buttons), visible on every interactive element.
- Selected: `cobalt`. Disabled: dashed border plus `ink-muted` text, never an opacity fade.
- Error: `status-over` border plus a mono message starting with ■.

## Diagrams and simulators

- Draw systems in 2:1 isometric: servers as iso blocks, load balancers and queues as plates, databases as stacked rings. Outlines 1.25–1.5px `ink`, fills from phase or status tokens.
- Label parts with `NumberedCallout`s and leader lines, never text inside small shapes.
- Live metrics in mono with units; node load as `StatusLabel` (● OK / ▲ HOT / ■ OVERLOADED).
- Charts are plotted technical graphs: 1px `ink` axes, `line` gridlines, mono tick labels, series in phase colors or `cobalt`, a `FigureCaption` on top, no fills under lines except a 10% band for SLO targets.

## Iconography

- No logo exists yet: set the wordmark "SysDesign Lab" in Archivo 800 with tight tracking. Don't draw a mark until one is designed.
- UI icons: lucide (1.5px stroke, square caps) at 16/20px, `ink`. Prefer mono glyphs for state: ● ▲ ■ ✓ ✕ → ⇄ §.
- Component icons in the Design Studio palette are small iso drawings in the same style as the `PhasePath` steps, 32px, `ink` outline on the phase color of the curriculum phase that teaches the component.
- No emoji, no illustrations of people.

## Accessibility

- WCAG 2.1 AA in both themes: every text pair listed in token notes is checked at 4.5:1; borders, focus rings and meaningful marks at 3:1.
- Keyboard: every control reachable, visible focus ring, simulator canvases have an accessible text summary of their live state.
- Color is never the only signal (numbers on phases, glyph + word on status, printed depth stamps).
