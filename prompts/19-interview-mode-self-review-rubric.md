Read CLAUDE.md. Task: build Interview Mode at /interview/[caseId] using the Design Studio.
Match the /design Interview Mode screen.

1. Start screen: case study prompt (from the case study's meta.json: interviewer-style
   problem statement), duration (30/45/60 min), hints on/off, "Start".
2. Layout: timer (top, a large mono countdown, with pause allowed only in practice mode),
   left = 7 framework step panels (Requirements, Estimation, API, Data Model,
   High-Level Design, Deep Dives, Wrap-up), center = Design Studio canvas, right = notes.
   - Requirements panel: functional and non-functional lists with "clarifying questions"
     the learner can click to reveal the interviewer's answer (data-driven per case).
   - Estimation panel: embedded mini estimation calculator.
   - API panel: structured endpoint editor (method, path, request, response).
   - Data model panel: entity editor (name, fields, keys) + DB choice with justification.
   - Deep dives: the case defines 3–5 likely deep-dive questions; revealed one at a time
     at timed intervals (like an interviewer pushing).
   - Suggested time per step shown; gentle nudge when over time.
3. Hints: each panel has up to 2 hints; using a hint is recorded.
4. Submit → Self-review:
   - Rubric from rubric.json (per case): ~10–14 criteria grouped by framework step, each
     scored 0–2 with clear descriptions of what 0/1/2 look like.
   - Side by side: learner's design vs reference design (loaded from design.json) and
     reference walkthrough (solution.mdx).
   - Run both designs in Run Mode against the case's traffic profile and compare metrics.
   - Saves an InterviewAttempt with self-scores; dashboard shows score trend per case.
5. "Common mistakes" checklist for the case shown after review.
6. Practice mode (untimed, hints free) vs Mock mode (timed, hints cost, no pause).
7. Until case studies exist (Prompt 20a–c), build and test with one small fixture case
   in /tests/fixtures, not in /content.

Definition of Done: CLAUDE.md §8.
