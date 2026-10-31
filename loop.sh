#!/usr/bin/env bash
# SysDesign Lab autopilot: runs every build prompt in order, one fresh Claude Code session each.
# Usage:  ./loop.sh            run everything that isn't done yet
#         ./loop.sh 07         stop after prompt 07 (good first checkpoint)
# Needs: git, node 20+, pnpm, Claude Code (`claude`) logged in.
# WARNING: uses --dangerously-skip-permissions. Run only inside this project folder,
#          ideally in a VM / Docker container / spare machine. Never with secrets around.
set -uo pipefail
cd "$(dirname "$0")"
STOP_AFTER="${1:-}"
MAX_TURNS="${MAX_TURNS:-250}"
ORDER=(00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20a 20b 20c 20d 21 22 23 24)
REVIEW_AFTER=(06 08 10 12 14 15 20c 20d)   # run the U3 accuracy review after these
mkdir -p logs
[ -d .git ] || { git init -q && git add -A && git commit -qm "Starter files"; }

has_commit() { [ -n "$(git log --oneline -F --grep="$1")" ]; }
done_already() { has_commit "Prompt $1 done"; }
file_for() { case "$1" in 20a|20b|20c) ls prompts/20abc-*.md ;; *) ls prompts/"$1"-*.md ;; esac; }

RULES='You are running UNATTENDED in a loop. Nobody will answer questions: never ask, never wait.
If something is ambiguous, choose the simplest option consistent with CLAUDE.md, record it in DECISIONS.md, and continue.
design/ is the visual source of truth (CLAUDE.md §5); FIXES.md / DECISIONS.md list fixes you must respect.
Never edit prompts/, design/, PROMPT_BOOK.md, START_HERE.md, FIXES.md, loop.sh.
Print "Next: <item>" after each finished section or simulator.
Keep going until the Definition of Done passes (typecheck, lint, test, build, e2e). Fix failures yourself.'

run() {  # $1=label  $2=prompt text
  local label="$1" text="$2" attempt
  for attempt in 1 2 3; do
    echo "▶ $(date +%H:%M) $label (attempt $attempt)"
    claude -p "$text" --dangerously-skip-permissions --max-turns "$MAX_TURNS" \
      >> "logs/$label.log" 2>&1
    has_commit "$label done" && { echo "✔ $label"; return 0; }
    echo "… $label not finished, resuming in 2 min"; sleep 120
    text="$RULES
You stopped partway through $label. Follow prompts/U7-continue-after-a-cut-off.md for it, then finish it.
When done: commit \"$label done\", tick it in PROGRESS.md, append 5 bullets to LOOP_LOG.md."
  done
  echo "✖ STOPPED at $label. Read logs/$label.log, fix or rerun ./loop.sh"; exit 1
}

for id in "${ORDER[@]}"; do
  if ! done_already "$id"; then
    f="$(file_for "$id")"
    extra=""
    [ "$id" = 00 ] && extra="Also: git init if needed, read START_HERE.md, design/notes.md, design/design-system.md, then copy every item of FIXES.md into DECISIONS.md."
    case "$id" in 20a) extra="Do ONLY 20a: case studies 1–5.";; 20b) extra="Do ONLY 20b: case studies 6–10.";; 20c) extra="Do ONLY 20c: case studies 11–15.";; esac
    run "Prompt $id" "$RULES
First do prompts/U1-resume-a-session.md (fix anything broken). Then execute $f exactly. $extra
When its Definition of Done passes: commit \"Prompt $id done\", tick $id in PROGRESS.md, and append to LOOP_LOG.md: ## $id + 5 bullets (built / how to verify / limitations / decisions / next)."
  fi
  if printf '%s\n' "${REVIEW_AFTER[@]}" | grep -qx "$id" && ! has_commit "Review $id done"; then
    run "Review $id" "$RULES
Run prompts/U3-content-accuracy-review.md on the content written by prompt $id (case studies if $id is 20c). Apply the fixes, keep all tests passing.
Then commit \"Review $id done\" and append the findings table summary to LOOP_LOG.md."
  fi
  [ -n "$STOP_AFTER" ] && [ "$id" = "$STOP_AFTER" ] && { echo "■ Checkpoint after $id. Run: pnpm dev  — then ./loop.sh to continue."; exit 0; }
done

has_commit "Final report done" || run "Final report" "$RULES
Everything is built. Run the full test suite once more and fix anything red. Then write REPORT.md:
what the site has (with routes), how to run it, test/Lighthouse/axe numbers, known limitations, and the 10 best places to start studying.
Commit \"Final report done\"."
echo "✔ ALL DONE. Open REPORT.md, then run: pnpm install && pnpm dev"
