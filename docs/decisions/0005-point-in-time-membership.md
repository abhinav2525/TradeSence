# 0005 — Use the real NIFTY 50 membership, from 2020

**Date:** 2026-10-02 · **Status:** done

## Problem

The history chart was computed as if **today's** 50 stocks had always been the NIFTY 50.
Every member had the same membership row, "member since 2016-09-01, never removed".

The real index changes about twice a year. Stocks that collapse get removed (YES Bank,
Zee, Vedanta…) and stocks that rallied get added. So the old chart left out the losers
and counted the winners for years before they joined. This is called **survivorship
bias**, and it made the history look **too bullish**. Any study of "what happens after
breadth is very low" would have been tested on a cleaned-up past.

Two smaller problems came out of the same issue:
- **The member list was out of date.** NSE replaced WIPRO with BSE on 2026-09-30, and
  our list still had WIPRO.
- **Some days had only 47–49 members**, because stocks that listed recently (SBI Life,
  HDFC Life…) were counted for years when they didn't exist yet.

## Options

| Option | Good | Bad |
|---|---|---|
| **A small hand-checked file**, built once from NSE's press releases ✅ | Simple, readable, every row traced to a source; nothing new runs at night | Someone adds a row when NSE changes the index (about twice a year) |
| A scraper that reads NSE's press releases automatically | No manual step | PDFs in changing layouts; a new place for silent errors, for a dozen changes in six years |
| Keep ten years (from 2016) | Longer history | More research for 2016–2019 changes; the owner chose to keep it simple |
| Leave it | Nothing to do | The history stays biased |

**The owner chose: start in 2020 and keep it simple.**

## Decision

1. **`src/ingest/nifty50-history.csv`** holds every membership period since
   **2020-01-01**: 66 rows, covering the 50 starting members plus **12 change events**.
   Each row names the NSE Indices press release it came from.
2. `bun run ingest:nifty50` loads the file into `index_members` and replaces what was
   there. It **refuses to load** a file that doesn't have exactly 50 members on every
   day.
3. **Breadth and the chart start in 2020.** Date navigation no longer offers earlier
   days, which would have had no members. Averages still use price history from 2016,
   so the 200-day averages are already correct in January 2020.
4. **The nightly job compares the file with NSE's live list.** If NSE has changed the
   index, the log shows a `WARNING` naming the stocks added and removed.
5. The page now says "since 2020" instead of "ten years".

**How the list was built (research, 2026-10-02):** all 118 index-replacement press
releases from niftyindices.com since mid-2019 were downloaded and their NIFTY 50
sections read. The 12 events:

| Effective | Out | In |
|---|---|---|
| 2020-03-27 | YESBANK | SHREECEM |
| 2020-07-31 | VEDL | HDFCLIFE |
| 2020-09-25 | INFRATEL (now INDUSTOWER), ZEEL | DIVISLAB, SBILIFE |
| 2021-03-31 | GAIL | TATACONSUM |
| 2022-03-31 | IOC | APOLLOHOSP |
| 2022-09-30 | SHREECEM | ADANIENT |
| 2023-07-13 | HDFC (merged into HDFCBANK) | LTIM (now LTM) |
| 2024-03-28 | UPL | SHRIRAMFIN |
| 2024-09-30 | DIVISLAB, LTIM | BEL, TRENT |
| 2025-03-28 | BPCL, BRITANNIA | JIOFIN, ZOMATO (now ETERNAL) |
| 2025-09-30 | HEROMOTOCO, INDUSINDBK | INDIGO, MAXHEALTH |
| 2026-09-30 | WIPRO | BSE |

**How it was checked:**
- Starting from NSE's live list and undoing each change back to 2020 gives **exactly
  50 members at every step**, with every removal and addition consistent. A test
  checks this on every run, and another live test checks that today's members equal
  NSE's published list.
- Every member, past or present, has price data. Renamed ones (INFRATEL, LTIM, ZOMATO)
  are stored under today's symbol and joined through the rename fix
  ([0003](0003-renamed-symbols-lose-history.md)).

**Left out on purpose:** when a member demerges, NSE sometimes adds the spun-off company
for a few days (Jio Financial 2023, ITC Hotels 2025, Tata Motors CV 2025, Kwality Wall's
2025). Those were in the index briefly, mostly before the new shares traded, so they have
no 200-day average and are excluded from breadth anyway. Including them would not change
a single number.

## Why

- **Small and checkable beats clever.** Twelve changes in six years don't justify a
  scraper. The file is short enough to read, and every row says where it came from.
- **2020 is enough and keeps the work small** (see "How many years" below).
- **It can't silently drift.** The 50-member check stops a broken file from loading,
  and the nightly comparison with NSE's live list catches the next change.
- **No schema change.** `index_members` already stored dates, and the breadth query
  already checked membership date by date. Only the data was wrong.

**How many years:** a 200-day reading needs about 1 year of prices. Comparing "today
vs history" needs as many market cycles as possible. 2020 onward still contains the
COVID crash, the 2022 sell-off and the 2025 weakness, the main bearish episodes of
the decade.

## Result (2026-10-02)

The chart got more honest. The old version overstated breadth by about 2–5 points a
year, and had hidden several weak periods:

| Year | Avg % above 200 SMA, before → after | Days below 20%, before → after |
|---|---|---|
| 2020 | 53.4 → 48.2 | 52 → 51 |
| 2021 | 92.2 → 88.7 | 0 → 0 |
| 2022 | 59.7 → 54.4 | 2 → **10** |
| 2023 | 77.8 → 76.1 | 0 → 0 |
| 2024 | 82.1 → 79.0 | 0 → 0 |
| 2025 | 56.8 → 54.4 | 0 → **5** |
| 2026 | 46.9 → 46.9 | 1 → 1 |

There are now exactly 50 members on every day (previously as low as 47). Today's
reading is unchanged (4 / 8 / 7 above the 50 SMA / 200 SMA / 200 EMA), now with BSE
in place of WIPRO.

**The jump check now also sees former members**, and it flagged 5 moves. All five are
real events, not missing splits: YES Bank's collapse and rescue (March 2020), IndusInd
Bank's 45% rebound (2020-03-26) and Zee's crash after the Sony merger was called off
(2024-01-23). The nightly job only warns about the last 31 days, so old events never
show up as warnings.

## How to update it (twice a year, ~2 minutes)

NSE announces changes in late February and late August, effective the end of March and
the end of September. When the nightly log says `WARNING NIFTY 50 changed`:

1. Open the press release on niftyindices.com → Media → Press Releases ("Replacements
   in indices").
2. In `src/ingest/nifty50-history.csv`, fill in `removed_on` with the effective date
   for each stock going out, and add a new row (`added_on` = the same date) for each
   stock coming in. Put the press release name in `source`.
3. Run `bun test tests/nifty50-history.test.ts`, which checks there are still 50
   members every day and that the file matches NSE's live list. Then run
   `bun run ingest:nifty50 && bun run indicators`.

## Revisit when

- **More history is wanted (2016–2019).** The same method works: read the 2016–2019
  press releases, add the rows, and move `HISTORY_START` back.
- **NIFTY 500 or whole-market breadth** (TODO item 7). The NIFTY 500 changes too often
  for a hand-kept file, so that would need the scraper option.
