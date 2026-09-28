<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A NIFTY 50 **market-breadth tracker**: it answers "how many constituents are trading
above their moving average?" and charts that percentage over ten years. A single
reading is meaningless — 24% could be a panic low or a dull Tuesday — so the
historical series is the product, not the daily list.

Data comes from **free public NSE bhavcopy archives**. There is no broker account,
no API key, no auth anywhere in the codebase, and no paid subscription.

## Commands

```bash
bun run dev                                    # Next.js dashboard on :3000
bun test                                       # full suite (always uses tradesence_test)
bun test tests/breadth.test.ts                 # one file
bun test --test-name-pattern "idempotent"      # one test by name

bun run db:generate && bun run db:migrate      # schema change -> migration -> apply
bun run db:studio                              # browse data

bun run ingest:nifty50 2016-09-01              # seed index membership
bun run ingest:day 2026-09-25 [--force]        # one session
bun run ingest:backfill 2016-09-28 2026-09-25  # range, ~700ms/request
bun run indicators                             # recompute all moving averages
bun run ingest:nightly                         # cron entry point: ingest + recompute
```

Requires a local Postgres (`brew services start postgresql@14`) and databases
`tradesence` and `tradesence_test`. `DATABASE_URL` lives in `.env`.

## Architecture

**Store everything, filter at query time.** Bhavcopy contains the whole NSE cash
market and we download the whole file anyway, so `daily_prices` keeps all of it.
"NIFTY 50" is a row set in `index_members`, joined at query time. Switching to
NIFTY 500, or fixing the survivorship bias below, is therefore a query change —
never a re-download.

Pipeline: `src/ingest/bhavcopy.ts` (fetch + parse) → `src/ingest/ingest-day.ts`
(upsert + log) → `src/indicators/compute.ts` (moving averages) →
`src/query/breadth.ts` (the two questions the page asks) → `src/app/page.tsx`.

`ingest_log` is load-bearing: it drives both idempotency (a logged day
short-circuits) and backfill resume (an interrupted run just restarts).

## NSE facts that cost time to rediscover

- **Two file formats.** UDiFF (`BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip`)
  serves 2024-01-02→now; legacy (`.../EQUITIES/YYYY/MON/cmDDMONYYYYbhav.csv.zip`)
  serves up to ~2024-06. They overlap; the cutover constant sits inside the gap and
  the fetcher falls back to the other format before declaring a holiday.
- **Holidays return HTTP 404 with a ~3.4 KB body.** A non-empty response proves
  nothing. Check the status code, then validate the header row — that is what
  `requireHeader` is for.
- **Bhavcopy dates are honest** (`TradDt` matches the URL date), but NSE's
  *52-week high/low* file is **off by one**: the file labelled day D holds data
  through D−1. Not used here; remember it if you ever add that source.
- Prices are **unadjusted** for splits and bonuses, so a split shows up as a price
  gap that briefly distorts that symbol's average.

## Testing

`bunfig.toml` preloads `tests/setup.ts`, which **overrides** `DATABASE_URL` to
`tradesence_test` and refuses any database not ending in `_test`. This exists
because `bun test <file>` bypasses package.json scripts and Bun auto-loads `.env`
— without the preload, tests wrote to the dev database. Do not weaken it to `??=`.

Network tests hit the live NSE archive deliberately: it is public and it is the
thing most likely to break, so mocking it would only prove the mock works.

## Known limitation

Historical breadth is **survivorship-biased**. `index_members` is seeded with
*today's* 50 names over one open interval, so the ten-year chart is computed on
today's winners and reads optimistically. The table shape already supports real
point-in-time membership (`added_on` / `removed_on`); populating it needs a
constituent-history source — NSE's own `IndexInclExcl.xls` is stale with
effectively nothing after ~2015, so use niftyindices.com monthly archives or
niftyhistory.in. Fixing it requires no re-ingest.
