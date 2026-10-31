# Button

Three weights of button: one solid ink primary per view, outlined secondary, and small mono tool buttons for canvases and toolbars.

**Consumer provides:** a label (verb first, sentence case: "Start week 1", "Open a simulator"; tool buttons are 1–2 uppercase words), optional trailing `→` for forward navigation, and `disabled` when needed. Use `<button>` or `<a class="fm-btn">` for navigation.

- Primary `fm-btn--primary`: `ink` fill, `paper` text, 44px tall, `radius-sm`. At most one per view.
- Secondary `fm-btn`: 1.5px `ink` outline, transparent.
- Hover lifts 2px up-left onto a hard shadow (`shadow-hard`; `cobalt` under primary). Pressed sits flat. Focus: 2px `focus` ring, 3px offset.
- Disabled: dashed border, `ink-muted` text, no lift. No opacity fades (they fail contrast).
- Tool `fm-btn--tool`: 28px, 1px border, `mono-label`; hover inverts; a selected tool (speed, mode) is `cobalt` with `on-cobalt` text.
- Danger: `status-over` outline and text, always behind a typed confirmation.
