# SysDesign Lab — starter kit for Claude Code

## What's inside
- `KICKOFF_PROMPT.md` — paste into Claude Code ONCE, first.
- `SESSION_PROMPT.md` — paste at the start of every later session (change NN).
- `PROGRESS.md` — checklist of the 28 build prompts.
- `PROMPT_BOOK.md` — the full prompt book; `prompts/` — one file per prompt (00–24, U1–U8).
- `design/` — approved design: tokens, component styles, component previews + screenshots (Paper & Blueprint), the landing page (direction A, desktop + phone), notes. Directions B and C are in `design/directions/` for reference only.

## Autopilot (no babysitting)
See AUTOPILOT.md: `./loop.sh 07` builds up to Phase 1, then `./loop.sh` builds the rest.

## How to run it by hand
1. Unzip this folder somewhere, e.g. `~/code/sysdesign-lab`.
2. Install Node 20+ and pnpm (`npm i -g pnpm`).
3. In that folder run `claude` (Claude Code).
4. Paste `KICKOFF_PROMPT.md` (below the line). It creates CLAUDE.md and stops.
5. Each next session: new session → paste `SESSION_PROMPT.md` with the next NN → check the app (`pnpm dev`) → repeat.
6. Expect about 30–40 sessions. Phase 1 is usable after prompt 07, so start studying week 1 while you build.

## Is it a one-stop shop?
For learning and practising system design: yes — lessons, quizzes, flashcards, 29 simulators, Python coding labs, a design canvas that runs traffic, timed mock interviews with rubrics, 15 case studies, cheat sheets and a 16-week plan.
Limits: content is AI-written, so run U3 reviews; AI tutor/interviewer needs your own API key; nothing replaces a real human mock interview; the capstone (real Postgres/Redis/Kafka) runs on your own machine with Docker.
