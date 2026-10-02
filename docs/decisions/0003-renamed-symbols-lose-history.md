# 0003 — Renamed stocks lose their history before the rename

**Date:** 2026-10-02 · **Status:** open — found, not fixed yet

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

(Other members that start late — SBILIFE, HDFCLIFE, MAXHEALTH, JIOFIN, TMPV — are
genuine new listings or demergers, not renames.)

**A second effect, outside NIFTY 50.** NSE's corporate-actions feed files past events
under the company's *current* symbol. For example, Minda Industries' 2022 bonus is
filed under UNOMINDA, while its old prices are under MINDAIND. This does not affect
the dashboard today, because only NIFTY 50 averages are computed, but it will matter
for whole-market breadth (TODO item 7).

## Options (not yet chosen)

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

None yet. Recorded so it isn't forgotten. The symbol-change list looks like the right
fix, and it would naturally go together with the survivorship fix (TODO item 1),
which also needs historical membership by symbol.
