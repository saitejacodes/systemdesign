# Checkbox

A square check for lesson checkpoints, settings and multi-select quiz answers.

**Consumer provides:** a native `<input type="checkbox">` inside its `<label>`.

- 18px square, 1.5px `ink` border, `radius-sm`, `surface` fill; checked fills `ink` with a `paper` tick.
- In checkpoint lists a checked item's text is struck through in `ink-muted` (done, but still readable).
- Disabled: dashed border plus a reason in the label.
