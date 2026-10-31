Read CLAUDE.md §7 and §10. Task: write ALL Phase 7 sections fully (all six files each).
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."
Phase 7 teaches HOW to run a system design interview, using everything from Phases 1–6
and the 15 case studies. No new simulators: embed existing ones and link to
/interview/[caseId] for practice.

Sections and MUST-COVER points:

1. interview-framework (week 14): the 7 steps (Requirements, Estimation, API, Data Model,
   High-Level Design, Deep Dives, Wrap-up) as the home of this framework; a time budget
   for a 45-minute interview; what to say and what to draw at each step; how to drive the
   conversation; a full worked walkthrough of url-shortener step by step.
   Embed estimation-calculator.
2. requirements-scoping (week 14): functional vs non-functional requirements; a bank of
   reusable clarifying questions (users, scale, read/write mix, latency, consistency,
   durability, regions); stating assumptions out loud; cutting scope on purpose.
3. building-blocks-map (week 14): one decision table mapping problems to components
   ("need X → consider Y, watch out for Z") covering LB, cache, CDN, queue, SQL, NoSQL,
   object storage, search, sharding, replication, rate limiter, vector DB; every row
   links to its Phase 1–6 section.
4. tradeoff-communication (week 14): presenting 2–3 options with criteria; turning
   "it depends" into a decision; handling pushback (defend vs change your mind);
   saying "I don't know" well. Include 5 short example exchanges.
5. deep-dive-patterns (week 15): the recurring deep dives — hot keys & celebrities,
   fan-out, idempotency & exactly-once effects, consistency vs availability choices,
   scaling reads vs writes, backpressure, multi-region. For each: the problem signal,
   2–3 standard solutions, and which case studies use it.
6. mock-interview-playbook (week 15): how to use Interview Mode (practice vs mock),
   self-review with rubrics, running a peer mock (script for interviewer and candidate),
   tracking scores over time, which 6 cases to mock first and why.
7. level-expectations (week 16): how expectations generally differ for junior, mid and
   senior engineers (depth of tradeoffs, driving the discussion, operational concerns).
   Describe general patterns only; do not claim any specific company's internal rubric.
8. final-review (week 16): a last-two-weeks routine using /today weak spots, flashcard
   review, re-doing failed simulator challenges and mocks; links to the interview-day
   checklist cheat sheet.

Also:
- Update plan.json so weeks 14–16 include these sections (1–4 in W14, 5–6 in W15,
  7–8 in W16) alongside the case studies already scheduled.
- Quizzes here are mostly scenario-type: show a candidate's answer and ask what is
  missing or what to do next.

Definition of Done: CLAUDE.md §8, all files pass validation, every section renders,
sidebar shows Phase 7 with real sections.
