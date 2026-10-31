# CodeBlock

A sunk panel for code, SQL, Redis commands and config, with a filename strip and a copy button.

**Consumer provides:** the code, language, and an optional filename or caption. Highlighting comes from shiki mapped to these colors.

- `surface-sunk` fill, 1px `ink` border, `radius-md`; header strip `surface` with `mono-caption` filename and a Copy tool button.
- `mono-body` 14px / 1.65. Line numbers `ink-muted`.
- Syntax: keywords `cobalt` 600, strings `status-ok`, numbers `status-hot`, comments `ink-muted` italic (all 4.5:1+ on `surface-sunk` in both themes).
- Long lines scroll horizontally; never wrap code.
