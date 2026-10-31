Use this for every session after the first. Start a NEW Claude Code session in this folder, change NN to the next unticked prompt in PROGRESS.md, and paste:

---

Read CLAUDE.md, CHANGELOG.md and DECISIONS.md, then do what prompts/U1-resume-a-session.md says (fix anything broken first).
Then execute prompts/NN-*.md exactly as written. Use design/ as the visual source of truth (CLAUDE.md §5).
Print a "Next: <item>" marker after each finished section or simulator.
When its Definition of Done passes: commit as "Prompt NN done", tick NN in PROGRESS.md, report what you built and how I can verify it, then stop.

---

If a session stops halfway: new session, paste prompts/U7-continue-after-a-cut-off.md (replace [NN]).
20abc runs three times: "do only 20a (cases 1–5)", then 20b (6–10), then 20c (11–15).
After each content prompt (06, 08, 10, 12, 14, 15, 20abc, 20d) run prompts/U3 for that phase. End of each phase: prompts/U6.
