# Autopilot: let Claude Code build everything by itself

1. Unzip, open a terminal in this folder (Mac/Linux, or WSL on Windows).
2. Make sure `claude` works and is logged in, plus git, Node 20+ and pnpm (`npm i -g pnpm`).
3. First run to a checkpoint and look at it:
       ./loop.sh 07
       pnpm install && pnpm dev     # open http://localhost:3000 — Phase 1 is usable
4. Happy? Run the rest (takes many hours; leave it running):
       ./loop.sh
5. When it ends, read REPORT.md and run `pnpm dev`. Progress is visible anytime in
   PROGRESS.md, LOOP_LOG.md (5 bullets per step) and logs/.

- Stopped with "✖ STOPPED at …"? Read that log, then just run ./loop.sh again: finished prompts are skipped (it checks git for "Prompt NN done").
- Usage limit hit? The script retries after 2 minutes, 3 times; after that it stops. Run ./loop.sh again later.
- Safety: it runs with --dangerously-skip-permissions, so Claude can run any command in this folder without asking. Use a VM, a container or a spare machine if you can; keep no secrets or other projects in this folder.
- Faster/cheaper turns: `MAX_TURNS=150 ./loop.sh`.
