# 0025 — Top volume: which stocks, which filters, where the data comes from

**Date:** 2026-10-04 · **Status:** done · Spec: `docs/superpowers/specs/2026-10-04-top-volume-design.md` · Plan: `docs/superpowers/plans/2026-10-04-top-volume.md`

## Problem

The owner wanted a leaderboard of the most-traded stocks for today, a week, a month, a
quarter and 6 months, narrowed by company size and by sector. Two pieces of data were
missing: each stock's **size group** and its **sector**.

## Options looked at

| Data | Option | Outcome |
|---|---|---|
| Size | AMFI's half-yearly market-cap list (top 100 large, 101–250 mid, rest small) | Available (a 5,000-company file), but a second source to keep in step |
| Size | NSE's own index lists: Nifty 100, Midcap 150, Smallcap 250, Microcap 250 | **Chosen**: same exchange, same files as the sectors |
| Sector | BSE's full company list | Blocked to scripts (HTTP 403) |
| Sector | NSE's per-stock page | Blocked to scripts (HTTP 403) |
| Sector | NSE's Nifty Total Market list, `Industry` column | **Chosen**: free, public, 22 sectors |

Sector data exists only for index members (740 of ~1,700 active stocks, but 78.5% of all
trading value). The owner chose to limit the page to index stocks: **Nifty Total Market,
~750 companies**, which gives every listed stock a size and a sector with no "Not
classified" bucket.

## Decisions

1. **Universe:** today's Nifty Total Market members (755 rows; 747 real stocks with prices:
   the other 8 are 3 REITs, which trade in a series we don't store, and 5 "DUMMY…"
   placeholders NSE lists for pending demerger spin-offs).
2. **Size** from the four NSE size lists; every universe stock must be in exactly one.
   Checked live: 100 + 150 + 251 + 254 = 755, no warnings.
3. **Sector** = NSE's `Industry` value, as published.
4. **Index filter:** 43 index member files that NSE publishes at a fixed address (15 broad,
   17 sector, 11 theme), all verified live on 4 Oct 2026. Newer indices (Capital Markets,
   Chemicals, Power, Hospitals, Tata Group, Railways PSU and others) don't publish a member
   file at any address found, so they're left out; strategy indices (momentum, quality,
   equal-weight, ESG) and non-stock indices are left out on purpose.
5. **Refreshed nightly** into `index_constituents`, replaced per index in its own
   transaction. A failed or empty download keeps yesterday's members and logs a WARNING, so
   an index never goes empty because of one bad night.
6. **Numbers computed nightly** into `volume_leaders` (one transaction, ~5 seconds):
   per stock and window of the last 1/5/21/63/126 market sessions, ₹ traded (NSE turnover),
   shares (split/bonus-adjusted to today's terms), the price move and the count of
   Unusual activity days. Checked: HDFCBANK's 21-session total equals a direct sum over raw
   prices to the paisa.
7. **Rank by ₹ value or shares** (owner: both, with a switch), **rolling** periods (owner).
8. **No research findings on the page.** It says heavy trading shows where money moved,
   not where prices go next; whether to quote research 0004 waits for its follow-up study.

## Found by the independent review (fixed)

- **Stocks in the trade-for-trade segment (BE) were cut short.** Only normal (EQ) days were
  counted, so the 7 universe stocks currently in BE (HFCL, STLTECH, MTARTECH, E2E, DIACABS,
  LOTUSDEV, SIGMAADV) vanished from the 1-day and 1-week tabs and showed tiny totals (HFCL's
  month: ₹394 crore from one EQ day). The page now counts EQ and BE days
  (`loadAdjustedHistory(…, { series: ["EQ", "BE"] })`; a date with both sums volume and
  turnover and keeps the EQ price; averages and returns elsewhere stay EQ-only). After:
  all 747 stocks in every tab; HFCL's month ₹3,616 crore over 21 sessions.
- **HEGAM's made-up −68% came back here.** The price move now follows decision 0024's rule
  (no move across a step of more than 5 calendar days) and is shown only when the stock
  traded on the latest session, since the heading says "to <date>". With BE days included,
  HEGAM's 7 Sep demerger can be priced: its month reads −8.2%. TradingView shows −9.8%; the
  1.6-point gap is the demerger ratio (decision 0004's last close ÷ ex-date open gives 2.80,
  TradingView uses 2.75; NSE's file has no adjusted base price). A known limit of 0004, not
  of this page (TODO).
- **A cut-short NSE file can't shrink a list overnight:** a new list under 90% of the stored
  one is refused and yesterday's kept, with a WARNING. The index-list step is wrapped so a
  database error there can't skip the rest of the nightly job. Glossary copy no longer
  hard-codes counts.

## Limits

NSE publishes only **today's** member lists, so the page shows today's members ranked over
the recent windows: a stock that joined an index last month is ranked on its full window,
one removed is absent. Lists change twice a year, a few dozen stocks at a time. The page
says "as of today".

## Revisit when

- NSE publishes member files for the missing indices: add rows to `INDEX_LISTS`.
- Report Cards exist for every stock: link every row.
- The owner wants history: keep a dated copy of each night's lists from now on.
