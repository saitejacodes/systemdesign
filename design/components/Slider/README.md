# Slider

A drafting-rule range control for simulator and calculator parameters, with a live mono readout.

**Consumer provides:** a label, min, max, step, value, a formatted readout (`<output>`) with units, and 3–5 tick labels.

- Track: 2px `ink` rule. Thumb: a 14×20 rectangle (`ink` with a `paper` inset), square corners, like a slide-rule cursor.
- Readout right-aligned in mono 600, tabular figures; ticks `ink-muted` mono 10px.
- Keyboard: arrows step, Page Up/Down ×10, Home/End to bounds (native range input).
- Don't: hide the readout, or use a slider for values that need exact typing (use Input).
