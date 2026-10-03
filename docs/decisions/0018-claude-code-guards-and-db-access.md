# 0018 — Claude Code guard hooks and read-only database access

**Date:** 2026-10-03 · **Status:** done

## Problem

Two rules in CLAUDE.md protect real data, but a written rule can be forgotten mid-task:
running `bun test` from inside `tests/` skips the test-database safety preload, and
`drizzle/` must never be hand-edited (migrations are generated). Separately, AI sessions
kept writing throwaway scripts just to look at data in the local database, and typecheck
errors were only found at the end of a task.

## Decision

**1. Hooks** (`.claude/settings.json`, scripts in `.claude/hooks/`):
- `guard.sh` (before a command or edit): refuses `bun test` unless it runs from the repo
  root (including `cd somewhere && bun test`), and refuses edits under `drizzle/`.
  It errs on the safe side: a command that merely *prints* the words "bun test" after a
  `cd` is refused too.
- `typecheck.sh` (after editing a `.ts`/`.tsx` file in the repo): runs `bunx tsc --noEmit`
  (about 0.3 s with TypeScript 7) and hands any errors straight back to the session.

**2. Read-only database access for AI sessions** (`.mcp.json`):
- A database role `claude_ro` that can log in and **only read** `tradesence`: `SELECT` on
  every table (and future ones), no write rights at all, and read-only by default. Checked:
  a `DELETE` is refused even with the read-only switch turned off ("permission denied").
  It can connect to `tradesence_test` but read nothing there.
- The MCP server is Postgres MCP Pro (`postgres-mcp`) in `restricted` (read-only) mode,
  connecting as `claude_ro`.

## Problems met while setting it up

- **The official Postgres MCP server is deprecated** on npm, and it had a published flaw
  letting a crafted query escape its read-only mode. Not used. That flaw is also why the
  database role, not the server, is the real safety: even a buggy server can't write.
- **`postgres-mcp` doesn't build on Python 3.14** (its SQL-parser dependency, `pglast`,
  has no 3.14 build yet). Pinned with `--python 3.12`.
- **It breaks on version 2 of its own MCP library** (`mcp.server.fastmcp` was renamed).
  Pinned with `--with "mcp<2"`.

## Revisit when

- `postgres-mcp` supports Python 3.14 or `mcp` 2: drop the pins in `.mcp.json`.
- Moving to a server (TODO, Ops): the role and `.mcp.json` assume a local database with
  passwordless local login.
- To remove the role: `drop owned by claude_ro; drop role claude_ro;` (as the owner).
