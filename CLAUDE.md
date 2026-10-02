# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A NIFTY 50 market-breadth tracker. Every evening it downloads NSE's free end-of-day
bhavcopy, stores all NSE equity closes, computes three moving averages for index
members, and serves a page showing how many constituents trade above each average —
plus that percentage charted over ten years. A second page, `/crossings`
(`src/query/crossings.ts`), ranks members by how often they whipsaw across an average.

**`README.md` holds the architecture diagrams and a full function reference.** Read it
before making changes; this file covers only what the code cannot tell you. (README
predates `/crossings` and does not document it yet.)

**This is Next.js 16 — APIs differ from training data.** Read the relevant guide in
`node_modules/next/dist/docs/` before writing framework code. `next dev` rewrites the
Next.js block at the top of `AGENTS.md`; commit that change rather than reverting it.

## Commands

```bash
bun run dev                                    # dashboard on :3000
bun test                                       # always against tradesence_test
bun test tests/breadth.test.ts                 # one file
bun test --test-name-pattern "idempotent"      # one test by name
bunx tsc --noEmit                              # typecheck (no linter configured)

bun run db:generate && bun run db:migrate      # schema change -> migration -> apply

bun run ingest:nifty50 2016-09-01              # seed/replace index membership
bun run ingest:day 2026-09-25 [--force]        # one session
bun run ingest:backfill 2016-09-28 2026-09-25  # range; ~28 min, resumable
bun run indicators                             # recompute every average (~5s)
bun run ingest:nightly                         # cron entry point
```

Needs local Postgres (`brew services start postgresql@14`) and both `tradesence` and
`tradesence_test`. `DATABASE_URL` lives in `.env`.

`ingest:nightly` re-runs a trailing window (`NIGHTLY_LOOKBACK_DAYS`, default 7), not just
today, so a missed night heals on the next run. It runs from a launchd agent
(`ops/install-nightly.sh`, Mon–Fri 19:30, log in `~/Library/Logs/tradesence-nightly.log`).
`TODO.md` holds the prioritised roadmap; the survivorship fix (below) is item 1.

## Design decisions that are load-bearing

**Store everything, filter at query time.** `daily_prices` holds the whole NSE cash
market because bhavcopy contains it anyway. "NIFTY 50" is rows in `index_members`,
joined per trade date. Changing universe, or fixing survivorship, is a query change —
never a re-download. Do not "optimise" this by filtering at ingest.

**`ingest_log` drives both idempotency and resume.** A settled day short-circuits before
any network call; an interrupted backfill resumes by being restarted.

**Status classification is the whole resilience design.** Three rules, each the fix for
a real failure:

- `holiday` is **provisional for 2 days**. NSE returns 404 for a not-yet-published file
  exactly as it does for a real holiday. A cron that runs before publication would
  otherwise cache a trading day as a holiday permanently.
- `error` is **never settled**. Transient failures must be retried, or one blip becomes
  a permanent hole nothing corrects.
- Prices are written **before** the log, without a transaction, on purpose. Dying
  between them leaves no log row, so the next run re-upserts harmlessly. The reverse
  could claim `ok` with no prices behind it.

**Averages never span a hole.** `segmentByGaps` splits the series at gaps over 21 days.
Without it a partially loaded history averages 2018 closes with 2024 closes and writes
the result out as a perfectly ordinary number. The 21-day threshold is duplicated as
`MAX_GAP_DAYS` in `src/indicators/compute.ts` and `src/query/crossings.ts` (where it
stops a hole from counting as a crossing); change both together.

**Symbols with a null average are excluded from breadth, not counted as "below".**
Otherwise every backfill opens with a fabricated bearish reading.

## Gotchas that will bite you

**Test isolation is enforced twice, and both are needed.** `bunfig.toml` preloads
`tests/setup.ts`, *and* `resolveDatabaseUrl` (`src/db/url.ts`) refuses a non-`_test`
database under `NODE_ENV=test`. The second exists because `bun test` resolves
`bunfig.toml` from the **cwd** — run from `tests/`, the preload never fires, `.env` is
never read, and the fallback pointed at the dev database, whose first visitor is
`db.delete(dailyPrices)`. Do not remove either guard, and do not weaken the connection
check to a default.

**`sql.raw` appears exactly twice**, in the `column()` helpers of `src/query/breadth.ts`
and `src/query/crossings.ts`. Each is safe only because `MA_COLUMNS` is a fixed map, and
the `ma` search param is gated by an `isMaKind` of three strict comparisons, which is
duplicated in `src/app/page.tsx` and `src/app/crossings/page.tsx`. Any new page or caller
must validate the same way.

**NSE file quirks** (all verified against the live archive):
- Two formats. UDiFF from 2024-01-02; legacy up to ~2024-06. They overlap; the cutover
  constant sits inside the gap and the fetcher falls back between them.
- Holidays return **404 with a ~3.4 KB body**. Status code only; then validate the header.
- Legacy files sometimes use a **two-digit year** (`13-JUL-20` on 2020-07-13). Parsed
  naively that becomes year 20 AD and Postgres rejects it mid-backfill.
- Bhavcopy dates are honest, but NSE's *52-week high/low* file is **off by one** — the
  file labelled day D holds data through D−1. Not used here; remember it if you add it.
- Prices are **unadjusted** for splits/bonuses.

**Header validation must list every column the parser reads.** `at()` returns `-1` for a
missing column and `f[-1]` is `undefined`; the old code turned that into `0` and would
have written zeroed prices silently on the next NSE rename.

## Testing

TDD throughout — write the failing test first. Network tests hit the live NSE archive
deliberately: it is public and it is the component most likely to break, so mocking it
would only prove the mock works. Where a fake is genuinely needed (a corrupt zip), use
the injected `download` / `ingest` parameters rather than a mocking library.

## Known limitation

Historical breadth is **survivorship-biased**: `index_members` is seeded with today's 50
names over one open interval, so the ten-year chart is computed on today's winners and
reads slightly optimistically. The schema already supports point-in-time membership, and
`breadthSeries` already evaluates membership per date — so correcting it is an insert,
not a re-ingest. Sources: niftyindices.com monthly archives or niftyhistory.in. NSE's own
`IndexInclExcl.xls` is stale, with effectively nothing after ~2015.
