# PhasePath

The brand's hero visual: the 16-week curriculum drawn as seven isometric steps climbing from Phase 1 to Phase 7, each carrying a shape for what that phase teaches.

**Consumer provides:** nothing for the default path. Optional: `active` (1–7) to mark the learner's current phase, `labels` off for small sizes, `interactive` off for print. Built as one inline SVG (`PhasePath` in `/components/brand`).

| Step | Phase | Shape on the step |
| --- | --- | --- |
| 1 | Foundations & Networking | two machines joined by a wire, a packet in flight |
| 2 | APIs, Data, Storage & Search | a database cylinder |
| 3 | Caching & Messaging | a queue of messages, the newest in `cobalt` |
| 4 | Distributed Systems & Reliability | a ring of five consensus nodes, the leader in `cobalt` |
| 5 | Observability, Security, Deploy | a shield with a heartbeat line |
| 6 | Advanced & AI-Native | a vector graph around one `cobalt` query node |
| 7 | Interview Mastery | a flag at the summit |

- Steps are 2:1 isometric blocks (width 124, 16px gaps) filled `phase-1` … `phase-7`, each 24px taller than the last, so the path visibly climbs. Side faces carry an `ink` shade (16% left, 32% right).
- Shapes sit on each step's top face in `surface` with `ink` outlines; one accent part per shape is `cobalt`.
- A dotted `cobalt` route joins the steps' centres: the learner's way through.
- Each step has a `NumberedCallout` below it with a short name (`mono-label`) and its weeks. Hover or focus shows a readout in the top-left: phase name, weeks, section and simulator counts. `active` keeps that readout on and fills its circle `cobalt`.
- Motion: steps rise in order (400ms, 70ms stagger), then the route fades in and leader lines draw. Plays once per view; static under reduced motion.
- Use: landing hero, the Plan page header, empty states, the 404 page. Don't: reorder the steps, add an eighth, or use it as a progress bar with fake numbers.
