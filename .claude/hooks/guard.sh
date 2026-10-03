#!/bin/bash
# PreToolUse guard for two mistakes CLAUDE.md warns about:
#  1. `bun test` run outside the repo root: bunfig.toml is resolved from the cwd,
#     so the test-database preload never fires (root CLAUDE.md, "Test isolation").
#  2. Hand-editing drizzle/: migrations are generated (`bun run db:generate`).
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
input=$(cat)
tool=$(jq -r '.tool_name' <<<"$input")

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

if [ "$tool" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
  grep -Eq '(^|[;&|[:space:]])bun test([[:space:]]|$)' <<<"$cmd" || exit 0
  cwd=$(jq -r '.cwd // empty' <<<"$input")
  if [ -n "$cwd" ] && [ "$cwd" != "$root" ]; then
    deny "Run bun test from the repo root ($root), not $cwd: outside it bunfig.toml's test-database preload never fires (CLAUDE.md, Test isolation)."
  fi
  # A `cd somewhere && bun test` in the same command.
  target=$(grep -Eo 'cd[[:space:]]+[^;&|[:space:]]+' <<<"$cmd" | tail -1 | awk '{print $2}')
  if [ -n "$target" ] && [ "$target" != "$root" ] && [ "$target" != "." ] && [ "$target" != '"$CLAUDE_PROJECT_DIR"' ]; then
    deny "Run bun test from the repo root ($root), not after cd $target: outside it bunfig.toml's test-database preload never fires (CLAUDE.md, Test isolation)."
  fi
  exit 0
fi

file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
case "$file" in
  "$root"/drizzle/*|drizzle/*)
    deny "drizzle/ is generated: change src/db/schema.ts, then run bun run db:generate && bun run db:migrate (src/db/CLAUDE.md)." ;;
esac
exit 0
