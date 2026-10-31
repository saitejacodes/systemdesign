# FigureCaption

The mono caption with a leading rule that labels every diagram, chart and simulator canvas.

**Consumer provides:** a figure number (`FIG. <section>.<n>`), a subject in bold, and an optional detail. Render as `<figcaption>` inside the `<figure>` it labels.

- Set in `mono-caption`, uppercase, `ink-muted`; the subject is `ink` 600.
- The 40px rule is `ink`, 1px. Separators are a middle dot `·` with a space each side.
- Number figures per lesson section (`FIG. 2.4` = section 2, fourth figure). The landing hero is `FIG. 0`.
- Place it above the figure, aligned to the figure's left edge, `space-3` gap.
- Do: keep it to one line. Don't: write sentences, use it as a heading, or color it.
