#!/usr/bin/env bash
# Install ClaudeGTM skills for local testing by symlinking them into ~/.claude/skills.
# Symlinks (not copies) so edits to skills/ here go live immediately — just restart Claude.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/skills"
DEST="$HOME/.claude/skills"
mkdir -p "$DEST"

count=0
for d in "$SRC"/*/; do
  name="$(basename "$d")"
  ln -sfn "$d" "$DEST/$name"
  count=$((count + 1))
done

echo "✅ Linked $count ClaudeGTM skills into $DEST"
echo "   Restart Claude (or start a new session), then run: /gtm-onboard"
echo ""
echo "To uninstall later:"
echo "  for d in \"$SRC\"/*/; do rm -f \"$DEST/\$(basename \"\$d\")\"; done"
