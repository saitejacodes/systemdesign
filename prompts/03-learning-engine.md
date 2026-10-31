Read CLAUDE.md. Task: make all learning components interactive and persisted.

1. Dexie database per CLAUDE.md §4 with versioned schema and a StorageAdapter interface
   (/lib/db/adapter.ts) plus DexieAdapter implementation. All components use hooks
   (useCheckpoints, useQuizAttempts, useCards, useNotes...) built on the adapter.
2. CheckpointList: checkbox per item, persisted, shows "3/5 done", section marked
   "complete" when all checkpoints done AND best quiz score ≥ 80% (write a
   SectionCompletion row with completedAt the first time this happens).
3. QuizPlayer:
   - One question at a time, progress bar, supports single, multi, scenario types.
   - After answering: show correct/incorrect, the explanation, and why each wrong option
     is wrong. Then "Next".
   - End screen: score, per-topic breakdown, "Retry wrong only", "Retry all".
   - Shuffle options each attempt (stable ids). Save QuizAttempt.
4. Flashcards with SM-2:
   - Implement SM-2 in /lib/learning/sm2.ts exactly: grades 0–5 mapped to buttons
     Again(1) Hard(3) Good(4) Easy(5); ease starts 2.5, min 1.3;
     EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02));
     if q < 3: repetitions=0, interval=1; else rep1→1 day, rep2→6 days,
     then interval = round(interval × EF). Unit test it thoroughly.
   - FlashcardDeck in lessons: browse mode (flip, next/prev, "add all to review").
   - /flashcards page: daily review queue across all sections (due today), counts of
     new/learning/review, filter by phase, keyboard: Space flip, 1–4 grade.
   - Daily new-card limit setting (default 20).
5. Notes: RightPanel "Notes" tab gets a markdown editor (Monaco or textarea + preview)
   tied to the current page id; autosave (debounced 500ms). /dashboard lists all notes;
   notes are included in global search.
6. Progress: /lib/learning/progress.ts computes per-section, per-phase and overall %
   (weights: checkpoints 40%, best quiz 40%, simulator challenges 20%; if a section has
   no simulator, split 50/50 between checkpoints and quiz).
   A section's simulator weight only applies once at least one simulator for that section
   is registered. When a simulator is added later, sections the learner already completed
   stay marked complete (store a completedAt timestamp); show their new challenge as a
   'New: try the simulator' badge instead of lowering their percentage.
   Sidebar shows progress per phase on its numbered layer and checkmarks per completed
   section.
7. Weak spots (/lib/learning/weakspots.ts): topics where quiz accuracy < 70% over the
   last 2 attempts, or sections with checkpoints untouched for 14+ days after their week.

Definition of Done: CLAUDE.md §8. Unit tests for sm2, progress (including the
"simulator added after completion" case), weakspots.
