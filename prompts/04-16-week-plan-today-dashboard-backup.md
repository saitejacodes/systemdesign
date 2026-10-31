Read CLAUDE.md. Task: build the study-planning layer. Match the /design Today and
Dashboard screens.

1. content/plan.json: 16 weeks. Each week: number, title, focus, sectionIds,
   simulatorChallengeIds, caseStudyIds, deliverable text, estimatedHours.
   Use this schedule (it matches CLAUDE.md §10):
   W1 Foundations + estimation | W2 Networking | W3 APIs + rate limiting |
   W4 DB I: modeling, indexing, transactions | W5 DB II: replication, sharding,
   consistent hashing | W6 Storage & search | W7 Caching | W8 Messaging |
   W9 Distributed systems | W10 Reliability | W11 Observability + security |
   W12 Deployment + capstone build | W13 Advanced + AI-native |
   W14 Interview framework + case studies 1–7 |
   W15 Case studies 8–15 + mock interviews |
   W16 Weak spots + mock interviews
   (Section ids can reference sections not yet written; render them as "Coming soon"
   links until they exist.)
2. Settings: "Plan start date" (default: first visit), "Hours per week" (default 8).
3. /plan: 16 week cards (timeline), current week highlighted, each shows progress and
   its items with checkmarks. Click a week to expand.
4. /today: computes the current week from the start date and shows, in order:
   (a) flashcards due today (count + "Review" button),
   (b) the next unfinished lesson in this week,
   (c) the next unfinished simulator challenge,
   (d) weak-spot suggestion (from weakspots.ts),
   (e) this week's deliverable.
   If the learner is behind, show a gentle "catch-up" banner with what to prioritize.
5. Study time tracking: count active minutes on learning pages (visible + interaction
   in the last 60s), saved as StudySession.
6. Streaks: consecutive days with ≥ 10 active minutes.
7. /dashboard: overall progress, per-phase bars in phase colors, quiz accuracy over time
   (Recharts, styled as plotted technical graphs with mono axes), flashcards reviewed per
   day, minutes per day (last 30 days), streak, weak spots, recent notes, interview
   attempts list.
8. Backup: Settings → "Export all data" (single JSON file of every Dexie table, versioned;
   never include Settings.apiKey) and "Import data" (validates, previews counts, asks
   merge or replace). "Reset all progress" with typed confirmation.

Definition of Done: CLAUDE.md §8. Unit tests for current-week calculation, streaks,
export/import round-trip (and that the API key is not exported).
