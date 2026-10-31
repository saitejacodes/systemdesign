# Input

A single-line text or number field with a mono label above and helper or error text below.

**Consumer provides:** a `<label for>`, the input, and optional help text; for errors, `aria-invalid` and `aria-describedby` pointing at the message.

- 40px tall, 1.5px `ink` border, `radius-sm`, `surface` fill. Numbers and code use `fm-input--mono`.
- Focus: 2px `focus` ring at 2px offset. Error: `status-over` border plus a mono message starting with ■, never color alone.
- Disabled: dashed border, transparent fill, `ink-muted` text.
- Don't: put the label inside as a placeholder; placeholders are examples only.
