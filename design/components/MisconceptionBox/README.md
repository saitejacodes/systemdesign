# MisconceptionBox

A box that strikes a common wrong belief and states the correct one beneath it.

**Consumer provides:** `wrong` and `right`, one or two sentences each.

- The wrong line is `ink-muted` with a 2px `status-over` strike, tagged "✕ WRONG". The right line is `ink`, tagged "✓ RIGHT" in `status-ok`.
- Keep the strike readable: never lower the wrong text below `ink-muted`.
