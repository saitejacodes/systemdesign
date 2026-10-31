# HudBar

A thin mono strip pinned to the bottom of every screen, showing live context: where you are, what the system is doing, and elapsed time.

**Consumer provides:** a live item first (week and topic, or the simulator), then key/value pairs, then a right-aligned anchor (section `§3.2`, seed, or timer). Render as `<footer role="status" aria-live="off">`; update numbers at most 4×/s.

- Height 32px, `surface` fill, 1px `ink` top rule, `mono-caption` uppercase. Keys are `ink-muted`, values `ink`.
- The live item's dot is `cobalt` and pulses (1.6s); still under reduced motion.
- Status values use `status-ok` / `status-hot` / `status-over` with their glyph and word (● OK, ▲ HOT, ■ OVERLOADED).
- On mobile keep the live item and two values; the rest scroll horizontally.
- Don't: put buttons or more than 6 items in it.
