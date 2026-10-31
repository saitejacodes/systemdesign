# QuizOption

One answer row in a quiz: letter key, answer text, and a verdict once answered.

**Consumer provides:** the letter, the answer text (markdown allowed), and state: default, selected, correct, incorrect or dimmed. Single-choice uses radio semantics, multi-choice checkbox semantics; number keys 1–5 select.

- Default: `surface`, 1px `ink` border, `radius-sm`, mono key box.
- Selected (before submit): 2px `cobalt` border, `cobalt` key.
- After submit: correct → `status-ok-fill` + "● CORRECT"; the learner's wrong pick → `status-over-fill` + "■ INCORRECT" and a struck key; other options dim with a dashed border. The words carry the meaning, not the fills.
- The explanation (why right is right and each wrong is wrong) appears below in a Card.
