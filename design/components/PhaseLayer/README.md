# PhaseLayer

A curriculum-tree row: the phase as a numbered colored layer with its weeks and progress, expanding into its sections.

**Consumer provides:** phase number, name, week range, percent complete, and its sections (number, title, done, current).

- Number square in `phase-N`; name `body-strong` 14px; weeks `mono-caption` `ink-muted`; percent right-aligned mono.
- Progress bar: 4px, 1px `ink` border, filled with `phase-N` (the percent is also printed).
- Current phase gets an `ink` border on `surface`. Sections hang from a `line` rule: done ones end in a `status-ok` ✓, the current one is inverted (`ink` fill, `paper` text) with `aria-current`.
