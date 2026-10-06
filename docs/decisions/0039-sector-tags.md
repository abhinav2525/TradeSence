# 0039 — Sector tags for NIFTY 50 stocks

**Date:** 2026-10-06 · **Status:** done

## Problem

The owner was reading the stock tables (the Screener's crossings and heavy-volume moves,
and the Breadth page's Above/Below lists) and couldn't tell which sector each stock was
from without looking it up elsewhere. With no sector, three banks crossing together look
like three separate stories rather than one sector moving.

The app had no sector data at all. `TODO.md` listed "Sector tag for every stock" under
data to add.

## Options

1. **A new table, filled nightly from NSE's index list files.** `ind_nifty50list.csv`
   (already fetched for the membership check) has an `Industry` column. It only lists
   *today's* members, though, so ex-members (HDFC, YESBANK, ZEEL…) would have no sector,
   and it would need a schema change, a migration and a new nightly step for a value that
   changes almost never.
2. **Sector-index constituent files** (NIFTY Bank, NIFTY IT…). These cover the whole market
   but overlap (a bank is in Bank, Financial Services and PSU Bank) and leave many stocks
   in none of them. More work to resolve, and needed only once the app covers more than
   the NIFTY 50.
3. **A hand-kept map in code, for every NIFTY 50 member since 2020** (67 symbols), using
   NSE's own `Industry` names, with tests that keep it honest.

## Decision

Option 3: `src/lib/sectors.ts`. It is keyed by today's symbol, like
`nifty50-history.csv`, so renamed members need no lookup. Tables show a short name (FMCG,
IT, Auto, Oil & Gas, Media) with NSE's full name on hover.

- **Where it shows:** a Sector column in the Screener's main table and its two "Near the
  line" cards, and in Breadth's Above/Below tables. Hidden on phones, where the tables
  are already tight. The Screener's filter box now matches a sector too ("bank" doesn't,
  "financial" does; "IT" or "FMCG" do).
- **Learn page:** a `sector` glossary entry, with a live sentence naming the largest
  sector on the latest session.
- **Guards:** `tests/sectors.test.ts` fails if any symbol in the membership file has no
  sector, or if the map holds a symbol that was never a member. A live check compares
  today's 50 members with NSE's `Industry` column (`fetchNifty50Industries`), so a
  reclassification or a new member shows up as a failing test, like the membership test.

## Why

Sectors almost never change, and the NIFTY 50 gains two or three members a year, so a
nightly pipeline and a table would cost more to run than the map costs to maintain. Option 1
also couldn't tag ex-members, which the date navigation still shows. Using NSE's own names
(not our own buckets) means the live test can compare the map with NSE's list directly.

The sector values were written from NSE's published classification without the live check,
because NSE was unreachable from the environment where this was built. **Run
`bun test tests/sectors.test.ts` on a machine with network access; fix any row it names.**

## Revisit when

- The app covers more than the NIFTY 50 (the Broader universes item in `TODO.md`): switch
  to a fetched source (option 1 or 2) and a table, since hand-keeping hundreds of stocks
  won't work.
- A rebalance adds a member: add its row here in the same change as the membership CSV
  (`docs/pipelines.md`, pipeline 5).

## Note on numbering and a second sector source (7 Oct 2026)

This was written as 0021 in a cloud session on 6 Oct, on top of an old copy of `main`;
the local `main` had meanwhile used 0021 for the database check-up. It was renumbered 0039
when the two were merged. Since then the Screener and Breadth also show Nifty Bank and
Nifty Financial Services, whose members outside the NIFTY 50 have no entry here and show
a dash. The Unusual activity page takes its sectors from NSE's Nifty Total Market list
instead ([0038](0038-sector-on-unusual-activity.md)); the two give the same name for a
NIFTY 50 stock. Using that one list for every page would remove the hand-kept map.
