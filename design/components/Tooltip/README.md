# Tooltip

A small inverted label that names a part or shows its live numbers on hover and focus.

**Consumer provides:** short text (one line, under 60 characters) and the element it describes; link them with `aria-describedby`. Open on hover and focus; close on Escape.

- `ink` fill, `paper` text, `mono-caption`, `radius-sm`, an 8px square arrow.
- Keys inside may be dimmed; values stay full strength.
- Don't: put links or buttons inside; use a popover card for that.
