# 0033 — A 20:15 retry, and the reason for every failed day in the log

**Date:** 2026-10-05 · **Status:** done

## Problem

The scheduled 19:30 run on Mon 5 Oct 2026 ended with `ingest: {"error":3}`: NSE was still
publishing the day's file, and the download failed in a way that wasn't a clean "not there yet"
(which would have been a provisional `holiday`). Two things were wrong with how that showed up:

1. **The log said how many days failed, not why.** Working out that it was a timing problem
   took a manual check against NSE.
2. **The day would only have been fetched the next evening.** `error` is never treated as final
   (load-bearing design, root `CLAUDE.md`), so tomorrow's run would heal it, but the owner would
   have looked at a day-old site all evening. A manual re-run at 20:58 fetched it in two minutes.

## Options

| Option | For | Against |
|---|---|---|
| Wait inside the job and retry after 25 minutes | One process | Delays every later step by 25 minutes; lost if the job crashes |
| **A second launchd slot at 20:15, Mon–Fri** | The job is idempotent, so the retry re-fetches only failed days (~2 min); survives a crash; also catches a late Mac wake | One more entry in the schedule |
| Move the whole run later (20:15) | Simple | Loses the 19:30 fetch on normal days for no reason |

## Decision

- **Two scheduled runs, 19:30 and 20:15, Mon–Fri** (`ops/com.tradesence.nightly.plist`,
  reinstalled with `ops/install-nightly.sh`). On a normal evening the second run finds every
  day already settled and does nothing but the cheap rebuilds and the audit.
- **One WARNING per failed day, with the reason** (`src/ingest/nightly-lines.ts`, tested), e.g.
  `[nightly] WARNING 2026-10-05 not loaded: udiff: TypeError: fetch failed (retried at the
  20:15 run and tomorrow)`. The `nightly-doctor` agent reads these lines.

## Why

The job was built to be safe to re-run; a second slot is the cheapest way to use that. The
reason line turns a manual investigation into a glance.

## Revisit when

The job moves to a separate always-on server (the owner is considering one): the retry slot
moves with it; the reason line stays.
