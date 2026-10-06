# 0038. Sector on the Unusual activity page

**Date:** 2026-10-07

## The problem

The owner asked to see which sector each stock belongs to on the Unusual activity page.
The page covers every liquid NSE stock (about 2,000), but the only sector information we
hold comes from NSE's index list files, which name an industry for each member. The biggest
of those lists, Nifty Total Market, has about 750 stocks.

Over the 30 days before this change, 340 of 938 unusual stock-days had a sector on file
(about 36% of the rows, but about 68% of the rupees traded). The rest are smaller companies
outside every NSE index, for example MOBIKWIK and DMCC on 6 October 2026.

## Options

1. **Use Nifty Total Market's industry and show a dash for the rest.** Same source as Top
   volume and Money flow, so a stock carries the same sector on every page.
2. **Take the industry from any NSE list the stock is in.** Every stock with an industry in
   any list is already in Nifty Total Market, so this adds nothing and spreads the source.
3. **Find a new source that covers every listed company.** Bhavcopy and NSE's equity master
   list carry no sector; NSE's per-stock quote pages do, but they are a live API, not the
   public archive, and would mean thousands of calls. Not worth it for one label.

## Decision

Option 1. The query joins today's Nifty Total Market list; a stock outside it shows "—",
and the page's footer says so. The sector sits as a small line under the stock name (no new
column, so the table still fits a phone). The header links to the existing "NSE sector"
glossary term.

## Why

One source of truth for "which sector" across Top volume, Money flow and Unusual activity.
It is today's sector, not the sector on the shown date; NSE rarely re-classifies a company,
and the label is only a description, never used in a calculation.
