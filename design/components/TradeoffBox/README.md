# TradeoffBox

A two-column box that sets what a choice gains against what it costs.

**Consumer provides:** a title (the decision) and `items` as gain/cost pairs or two lists.

- `fm-box` frame: `surface`, 1px `ink`, `radius-md`, a mono header with a ⇄ glyph.
- Columns split by a 1px `ink` rule. "+ GAIN" is `status-ok`, "− COST" is `status-over`; the signs repeat the meaning in text.
- One tradeoff per box; keep each point to one line.
