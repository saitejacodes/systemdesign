# DepthStamp

An inspection-stamp tag saying how deeply a topic must be known: DEEP, TRADEOFFS or AWARENESS.

**Consumer provides:** `depth` = `deep` | `tradeoffs` | `awareness`. The word is always printed; the three-square gauge (■■■ / ■■□ / ■□□) is a second, non-color cue and is `aria-hidden`.

- `mono-caption` 600, uppercase, 1.5px border plus a 1px outline 2px outside it (the double stamp ring), `radius-sm`, rotated −1.5°.
- Colors: Deep `cobalt`; Tradeoffs `status-hot`; Awareness `ink-muted` with a dashed outer ring. All pass 4.5:1 on `paper` in both themes.
- Place beside a topic heading or in a section's topic list.
- Don't: use it for status, scores or anything other than depth.
