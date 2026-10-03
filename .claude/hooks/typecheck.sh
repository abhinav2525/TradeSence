#!/bin/bash
# PostToolUse (Edit|Write): typecheck the project after a .ts/.tsx edit.
# TypeScript 7 checks the whole project in ~0.3s, so a full check is cheap.
# On errors, exit 2: stderr goes back to Claude so it fixes them right away.
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
file=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
case "$file" in
  "$root"/*) ;;
  *) exit 0 ;; # a file outside this repo (e.g. scratch scripts)
esac
cd "$root" || exit 0
out=$(bunx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  echo "Typecheck failed after editing ${file#$root/}:" >&2
  echo "$out" | head -30 >&2
  exit 2
fi
exit 0
