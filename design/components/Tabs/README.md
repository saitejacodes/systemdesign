# Tabs

Folder-tab navigation for panels (Notes / AI Tutor), simulator modes and dashboard views.

**Consumer provides:** 2–6 tab labels (1–2 words), optional two-digit numbers, and the panel for each. Use the ARIA tabs pattern (`role=tablist/tab/tabpanel`, arrow-key movement).

- `mono-label` uppercase; the row sits on a 1.5px `ink` rule.
- The selected tab is a raised folder tab: 1.5px `ink` border on three sides, `surface` fill, joined to its panel; its number turns `cobalt`.
- Unselected tabs are `ink-muted`, `ink` on hover.
