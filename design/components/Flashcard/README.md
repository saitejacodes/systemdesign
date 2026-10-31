# Flashcard

A 3:2 index card that flips to its answer, with four grade buttons for spaced repetition.

**Consumer provides:** front text (a question), back text (the answer), the card's position and section, and a grade handler (Again / Hard / Good / Easy). Space flips; 1–4 grade.

- `surface` face, 1.5px `ink` border, `radius-md`, `shadow-hard`, corner register marks. The back is `paper`.
- Question in `h4`-scale display type; answer in `body`.
- Flip: 350ms rotateY. Under reduced motion the faces swap instantly.
- Grade buttons are tool buttons; the suggested grade may be shown selected.
