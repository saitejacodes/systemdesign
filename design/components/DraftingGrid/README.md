# DraftingGrid

The faint blueprint grid with crosshair and registration marks, for hero areas and simulator canvases only.

**Consumer provides:** a container; add `fm-grid` (32px grid) or `fm-grid--fine` (32px major, 8px minor) and up to four `fm-cross` corner marks plus one `fm-reg` registration mark.

- Lines are the `grid` token (cobalt at 10–14% alpha): visible as texture, never competing with content.
- Crosshairs: 18px, 1px `ink`, inset 10px from the corners.
- Never behind lesson prose, quiz text, tables or forms. Lessons stay on plain `paper`.
