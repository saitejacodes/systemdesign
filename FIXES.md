# Fixes to the kit (copy into DECISIONS.md in Prompt 00)
1. Hero = PhasePath (7 isometric steps climbing Phase 1 → 7, one shape per phase). Ignore any "IsoLayerStack" / "7 layers" mention.
2. Fonts exactly: Archivo (display AND body), Instrument Serif Italic (one accent word per headline), IBM Plex Mono (labels, captions, metrics, HUD). Never IBM Plex Sans, Inter or a system stack. Load with next/font/google.
3. design/landing/landing.html uses local CSS variables; rebuild it with the variables from design/tokens.json / tokens.css.
4. Only the Paper landing is drawn. Build Blueprint (dark) from the [data-theme="blueprint"] tokens: same layout, chalk on navy.
5. Today, Lesson, Simulator, Studio, Interview, Dashboard are not drawn: compose them from design/components/* and design/notes.md.
6. If design/notes.md and design/design-system.md disagree, notes.md wins.
7. Lesson pages: no drafting grid, crosshairs or heavy motion behind reading text.
