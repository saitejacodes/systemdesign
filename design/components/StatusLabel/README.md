# StatusLabel

The OK / Hot / Overloaded chip for node load in simulators, Run Mode and dashboards.

**Consumer provides:** the state and, optionally, the number behind it (utilization ρ, error rate).

- 22px chip, 1px `ink` border, `radius-sm`, `mono-caption` 600, `ink` text on `status-ok-fill`, `status-hot-fill` or `status-over-fill`.
- Each state has its own glyph and word: ● OK (ρ < 0.7), ▲ HOT (0.7–0.9), ■ OVERLOADED (≥ 0.9 or dropping requests). Never color alone.
- On canvases, place the chip under the node it describes.
