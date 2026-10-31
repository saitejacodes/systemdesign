# NumberedCallout

A numbered circle joined to one part of a diagram by a thin leader line, so prose and parts lists can refer to "part 3".

**Consumer provides:** the number, the anchor point on the diagram, and a short mono label. Use `<button class="fm-num">` when hovering or focusing it reveals detail (as in PhasePath); otherwise a `<span>`.

- Circle 28px (`fm-num`), `radius-round`, 1.5px `ink` border on `surface`. Hover, focus and the active part fill `cobalt` with `on-cobalt` text.
- Leader: 1px `ink`, horizontal from the part then a short 45° kink into the circle; a 2.5px dot marks the anchor.
- Lines never cross each other or the diagram's parts. Stack callouts in one column on the right.
- Motion: leader lines draw in over 350ms after the diagram assembles; none under reduced motion.
- Don't: use more than 9 callouts in one figure, or number things that the text never mentions.
