Paste everything below the line into Claude Code, once, as the very first message in this folder.

---

You are going to build SysDesign Lab, a one-stop website for learning and practising system design, over many sessions. This folder already contains everything you need:

- `START_HERE.md`: how this project is run.
- `PROMPT_BOOK.md`: the full plan (read its "How to use this book" section).
- `prompts/`: one file per build prompt, run strictly in order (00, 01, 02 … 20abc, 20d, 21–24), plus utility prompts U1–U8.
- `design/`: the approved visual design. It is the source of truth for every screen. Read `design/notes.md` and `design/design-system.md` before writing any UI.
- `PROGRESS.md`: the checklist you tick off.

Rules for every session:
1. Run exactly ONE build prompt per session, then stop and wait for me.
2. Start each session by reading `CLAUDE.md`, `CHANGELOG.md` and `DECISIONS.md` (once they exist) and doing what `prompts/U1-resume-a-session.md` says.
3. Follow the prompt file exactly. Do not start the next prompt on your own.
4. In long prompts, print a `Next: <item>` marker after each finished section or simulator, so a later session can resume (see `prompts/U7-continue-after-a-cut-off.md`).
5. When the prompt's Definition of Done passes: commit with the message `Prompt NN done`, tick that line in `PROGRESS.md`, and report (what you built, how I verify it, known limitations).
6. Never delete or rewrite `prompts/`, `design/`, `PROMPT_BOOK.md` or `START_HERE.md`.

Now do this session's work:
1. Run `git init` if this folder is not a git repository yet, and commit the starter files as `Starter files`.
2. Read `START_HERE.md`, `design/notes.md` and `PROMPT_BOOK.md` (the "How to use this book" section).
3. Execute `prompts/00-project-bible.md` exactly. It creates `CLAUDE.md`, `CHANGELOG.md` and `DECISIONS.md` and writes no app code.
4. Commit as `Prompt 00 done`, tick 00 in `PROGRESS.md`, summarise what you created in 5 bullets, then stop and wait for me.
