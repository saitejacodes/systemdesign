# PartsList

A spec-sheet table with numbered colored squares, used for the curriculum, a system's components and a simulator's inventory.

**Consumer provides:** a caption (`PARTS LIST · <SUBJECT>`) and rows of number, item, layer (or week range) and quantity. Render a real `<table>` with `<caption>` and `<th scope>`.

- Mono throughout; caption `mono-caption` 600 over a 2px `ink` rule; header row `ink-muted` over a 1px `ink` rule; body rows separated by `line`.
- The number square (`fm-sq--1` … `--7`) uses `phase-N` with `on-phase-N` text and a 1px `ink` border, so even the lime and lavender squares have an edge on `paper`.
- Quantities right-aligned, tabular figures.
- Row hover lifts to `surface`; a row may link to its phase.
- Don't: zebra-stripe, round the squares, or drop the numbers (color alone never identifies a phase).
