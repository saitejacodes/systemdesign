You stopped partway through Prompt [NN]. Read CLAUDE.md and CHANGELOG.md, then run
git status and git diff --stat to see exactly what exists. Find the last
"Next: <item>" marker you printed for Prompt [NN] (in this conversation, or ask me to
paste it). Check that the item before that marker is really complete (files exist,
validation and its tests pass); finish it if not. Then carry on from the item the
marker names, keep printing "Next:" markers, and do not redo or rewrite finished
files. When the prompt is complete, run its Definition of Done.
