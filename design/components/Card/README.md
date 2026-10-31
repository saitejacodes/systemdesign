# Card

The basic container: a `surface` panel with a hairline `ink` border and a mono header strip.

**Consumer provides:** an optional header (mono label left, a number square or action right), a body, and an optional footer. Make the whole card a link only when it has one destination.

- `surface` fill, 1px `ink` border, `radius-md` (4px, the largest radius in the system). No blur shadows.
- Header 1px `ink` rule, `mono-caption`; body `space-4` padding; footer separated by `line`.
- Raised (`fm-card--raised`) adds `shadow-hard` for the one card that matters most on a screen. Link cards lift on hover like buttons.
- Don't: add a colored left border, gradient or icon tile. Use a phase square in the header to tie a card to a phase.
