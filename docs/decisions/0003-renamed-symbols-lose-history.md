# 0003 — Renamed stocks lose their history before the rename

**Date:** 2026-10-02 · **Status:** done

## Problem

Found while checking that every split was handled ([0002](0002-split-adjusted-averages.md)).

When a company changes its NSE symbol, bhavcopy files before the change use the **old**
symbol and files after use the **new** one. We look up each NIFTY 50 member by today's
symbol, so everything before the rename is invisible to us.

Three current members are affected:

| Member today | Was | Renamed on | History we use starts |
|---|---|---|---|
| TATACONSUM | TATAGLOBAL | 2020-02-27 | 2020-02-27 |
| SHRIRAMFIN | SRTRANSFIN | 2022-12-20 | 2022-12-20 |
| ETERNAL | ZOMATO | 2025-04-09 | 2025-04-09 |

**Effect.** Today's readings are fine: all three have more than 200 days since the
rename. But on the ten-year chart each one is missing before its rename. For roughly
200 days after it, its 200-day averages are empty, so it is left out of breadth
entirely (correctly left out, not counted as "below", but still missing).

(Other members that start late — SBILIFE, HDFCLIFE, MAXHEALTH, JIOFIN — are genuine
new listings. TMPV looked like one too, but it is TATAMOTORS renamed on 2025-10-24.)

**A second effect, outside NIFTY 50.** NSE's corporate-actions feed files past events
under the company's *current* symbol. For example, Minda Industries' 2022 bonus is
filed under UNOMINDA, while its old prices are under MINDAIND. This does not affect
the dashboard today, because only NIFTY 50 averages are computed, but it will matter
for whole-market breadth (TODO item 7).

## Options

- **Use NSE's symbol-change list.** `nsearchives.nseindia.com/content/equities/symbolchange.csv`
  lists **1,065** renames (company, old symbol, new symbol, date) and confirms all three
  above. We would load it into a table, then join the old symbol's prices onto the new
  one when computing averages. Raw prices stay untouched, matching the "store
  everything, compute at query time" rule.
- **Match on ISIN.** The ISIN is a permanent company ID that survives renames. But
  bhavcopy only carries it in the newer UDiFF format (from 2024), so it can't fix
  history before then.
- **Leave it.** It only affects the history of three stocks.

## Decision

**NSE's symbol-change list**, stored in a new `symbol_changes` table (1,065 renames).
`bun run ingest:symbol-changes` loads it, and the nightly job refreshes the whole list
(one small file).

When computing averages, `computeIndicators` follows each member back through every
symbol it has traded under (`symbolLineage` in `src/ingest/symbol-changes.ts`) and
joins those prices on in date order, all written under today's symbol:

- **Chains are followed**: TATACONSUM ← TATAGLOBAL ← TATATEA.
- **Reused tickers are respected.** An old symbol is only used for the dates it
  belonged to *this* company. If the ticker belonged to another company before that,
  its window starts at the hand-over, so another company's prices are never mixed in.
- **Corporate actions follow the company too.** NSE files past events under the
  current symbol (UNOMINDA's 2022 bonus, while it traded as MINDAIND), so actions
  under today's symbol apply to the whole history. Actions under older symbols only
  count inside that symbol's window, and an action listed under both counts once.
- **Raw prices are untouched**, as with splits ([0002](0002-split-adjusted-averages.md)).

## Why

- **Same source as everything else**: NSE, free, no login, works from any machine
  that can download bhavcopy.
- **Exact dates.** For all three members, the change date in the file is exactly the
  first day the new symbol appears in bhavcopy.
- **Matching on ISIN** would only work from 2024, when bhavcopy started carrying it.
- **It prepares the survivorship fix** (TODO item 1). Past members have to be
  matched by the symbol they had back then, which this lineage already does.

## Result (2026-10-02)

| Member | History started (before) | History starts (now) |
|---|---|---|
| TATACONSUM | 2020-02-27 | 2016-09-28 (full ten years) |
| SHRIRAMFIN | 2022-12-20 | 2016-09-28 (full ten years) |
| ETERNAL | 2025-04-09 | 2021-07-23 (Zomato's listing day, the true start) |

TMPV (formerly TATAMOTORS, renamed 2025-10-24) also gained its history. Today's breadth
counts are unchanged (4 / 8 / 7 above the 50 SMA / 200 SMA / 200 EMA).

**What it uncovered.** TMPV's newly joined history contains the 2025-10-14 demerger
of the commercial-vehicles business: a 40% overnight drop that no split explains. The
jump check flagged it at once. Handled separately:
[0004](0004-demerger-adjustment.md).

## Revisit when

- **A new member was renamed after the last nightly run.** The list is refreshed every
  night, so this only lasts a day.
- **The survivorship fix** (TODO item 1) loads past members. Look them up through
  `symbolLineage` too.
