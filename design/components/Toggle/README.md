# Toggle

A square switch for on/off simulator toggles and settings, with the state printed as a word.

**Consumer provides:** a label and `aria-checked`. Use `<button role="switch">`.

- Track 44×24, 1.5px `ink` border, `radius-sm`; the knob is a 15px square `ink` block.
- On: `cobalt` track, `on-cobalt` knob, word "ON". Off: `surface` track, word "OFF". The word means state never depends on color.
- Disabled: dashed track, `ink-muted` text.
- Motion: knob slides in 150ms; instant under reduced motion.
