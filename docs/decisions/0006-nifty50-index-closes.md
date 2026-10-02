# 0006 — Get the NIFTY 50 index level, and NSE's month-first dates

**Date:** 2026-10-02 · **Status:** done

## Problem 1: there was no index data

The forward-return study ([research 0001](../research/0001-does-breadth-predict.md)) asks
"after weak breadth, what did the **NIFTY 50 index** do next?". We had prices for every
*stock*, but not for the *index itself*: NSE's bhavcopy only contains shares, not indices.

## Options

| Option | Good | Bad |
|---|---|---|
| **NSE's daily index file** `ind_close_all_DDMMYYYY.csv` ✅ | Free, no login, **same archive as our price files**, every NSE index (NIFTY 50, Next 50, 500, sectors) with open/high/low/close | One file per day (~1,670 downloads to fill 2020 → today, about 12 minutes once) |
| NSE's historical index API (`/api/historical/indicesHistory`) | One request per range | Returned **503 (service unavailable)** when tried, and lives on the main NSE site, which blocks scripts more often |
| TradingView | Already there, accurate | Only reachable inside a Claude session, so the app and server can't use it ([0002](0002-split-adjusted-averages.md)) |
| Use the NIFTYBEES ETF from bhavcopy as a stand-in | Already in our data | An ETF isn't the index (tracking error, fees), and ETF unit splits aren't in our corporate-actions data ([0002](0002-split-adjusted-averages.md#known-gaps-checked-2026-10-02)) |

## Decision

A new pipeline, `index_prices`, filled from NSE's daily index file
(`src/ingest/index-prices.ts`):

- It stores **every index, every day**, following the project's "store everything" rule.
  TODO item 4's divergence signal and item 7's NIFTY 500 will need them.
- It only fetches days that the price pipeline already recorded as trading days. So it
  needs no second copy of the holiday rules ([0001](0001-nightly-schedule-launchd.md),
  and CLAUDE.md "holiday is provisional").
- It runs nightly for the last 7 days. A failed day stores nothing and is retried.
- It is strict, like the price parsers: a missing column or a file for the wrong day is
  an error, never silently stored.
- Command: `bun run ingest:indices <start> <end>`. Loaded 2020-01-01 → 2026-10-01:
  1,670 trading days, about 185,000 rows.

## Why

- **Same source as everything else**: NSE's public archive, no login, no new
  dependency. It works from any machine that can already download bhavcopy.
- **It is the real index**, not a stand-in.
- **Checked:** 7 of 7 NIFTY 50 month-end closes match TradingView exactly (e.g. March
  2020: 8,597.75; September 2024: 25,810.85).

## Problem 2: three files wrote the date the American way

The first full load stored **1,667 of 1,670** days. The three missing days (6, 10 and
11 April 2023) failed every retry. NSE wrote the date in those three files
**month-first** (`04-06-2023` for 6 April), while every other file is day-first. The
parser's rule "the file's date must match the day we asked for" rejected them.

The prices inside were correct (the 6 April 2023 NIFTY close was 17,599.15).

**Options:**
- Turn the date check off. ❌ That would let a wrong day's file through silently, which
  is exactly what the check is for.
- Fix the three days by hand. ❌ The same quirk could appear again on another day.
- **Accept the requested day written either way round, and still reject any other
  date** ✅. This is safe: we know which day we asked for, so `04-06-2023` in the file for
  6 April can only mean 6 April. A file for any other day is still rejected.

**Result:** all 1,670 days loaded. The quirk is covered by a test using NSE's real line,
and noted in CLAUDE.md's list of NSE quirks.

## Revisit when

- The nightly log shows `WARNING … day(s) of index closes not loaded` for several days
  in a row. That would mean NSE changed the file name or layout.
- History before 2020 is needed: the same command works back to at least 2016.
