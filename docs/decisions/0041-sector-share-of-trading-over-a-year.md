# 0041 — Sector share of trading over a year (Money flow)

**Date:** 2026-10-07 · **Status:** built (branch `feat/sector-share-year`, awaiting review) ·
**Spec:** `docs/superpowers/specs/2026-10-07-sector-share-of-trading-design.md` (owner approved, 3-month blocks)

## Problem

Money flow's "× normal" compares each sector with its own last 3 months. A slow, steady shift
over a year never shows: if Auto's slice of trading shrinks a little every month, every week
still reads about 1.0× its (also shrinking) normal. The owner asked: over the last year, which
sectors are taking a bigger slice of all the money traded, and which a smaller one?

## Options

1. **Last 4 weeks against weeks 48–51 of the stored history** (the first draft). The quant
   advisor found two faults: 52 × 5 sessions is ~55 calendar weeks back (NSE has ~248 sessions
   a year, not 260), and a shift of just 9 sessions turned Financial Services' +2.7 pts into
   0.0. A 4-week block is too easily moved by one busy fortnight.
2. **The same calendar dates a year apart, 4 weeks.** Fixes the drift, still jumpy.
3. **The same calendar dates a year apart, 3 months** (63 sessions). Steadier; the owner's
   choice on 7 Oct.
4. A full 52-week trend line instead of two snapshots. Shown as a small line beside every row,
   but the headline number stays a two-snapshot comparison, because that is what it is.

## Decision

- **Now** = the last 63 sessions to the latest session. **A year ago** = the sessions whose
  dates fall in the same calendar span one year earlier (e.g. 8 Jul–6 Oct 2026 against
  8 Jul–6 Oct 2025; 29 February becomes 28 February).
- **Share** = the sector's ₹ ÷ every universe stock's ₹ in that block, both **added up over the
  whole block first** (one huge week counts by its size; never an average of weekly shares).
  The universe and sectors are Money flow's: today's Nifty Total Market list, NSE's `industry`,
  EQ + BE through `loadAdjustedHistory`, so renamed stocks keep their old-symbol trading.
- **Change** in percentage points ("+1.1 pts"), never a percent of a percent. Rows sorted by
  change, largest gain first.
- **Rows** are the sectors with 5 or more stocks on today's list, chosen once. Their year-ago
  ₹ is summed over the same stocks, however many traded then. Sectors under 5 stocks are one
  footnote share, so rows plus footnote add to 100%.
- **New listings:** a stock with no traded session in the year-ago block is a new listing. When
  new listings are **10% or more** of a sector's recent ₹, its row is marked ("Partly new
  listings: 20% of its recent trading…"). `NEW_LISTING_MARK = 0.1` sits beside
  `MIN_SECTOR_STOCKS` as a **fixed display rule, chosen before looking and never tuned**.
- **Storage:** `sector_flow_weeks` gains `turnover`, `total_turnover` (same on each of a week's
  rows) and `new_listing_turnover`, for the small weekly lines and the picked sector's second
  panel. The two blocks don't line up with the stored weeks, so a small new table,
  `sector_share_year` (one row per sector: now and year-ago ₹, both totals, new-listing ₹, the
  four dates), is written by the nightly Money flow rebuild in the same transaction. Small
  sectors' share is worked out at page time from the totals.
- **Weekly rows for every shown sector:** `sector_flow_weeks` now has a row for every sector on
  today's list in every week. A week where the sector had under 5 trading stocks keeps its ₹
  (so its share line has no hole) but has no ratio, so its "vs normal" chart shows a gap there
  instead of skipping the week.
- **On the page:** a card "Share of trading over a year" under the sector bars, on every period
  tab. Phones keep sector, change and the small line, with "9.2% → 7.2%" under the name. When
  a sector is picked, its history card gains a second small panel with its weekly share (a
  second panel, not a second axis).

- **Demergers** (data-integrity review): Auto's −2.06 pts is partly the Tata Motors demerger. The
  whole of Tata Motors' year-ago trading sits in TMPV's history (Auto); after the 14 Oct 2025
  demerger, TMCV (Capital Goods) traded ₹21,077 crore in the now block, 0.35% of all trading,
  and counts there as a new listing. Moved back, Auto would read about −1.7 pts and Capital
  Goods about −0.07 instead of +0.28. Sectors are **not** reassigned (that would be guessing);
  instead `loadAdjustedHistory` returns each company's demerger ex-dates through the rename
  lineage, and a row is noted when one of its stocks demerged after the year-ago block began
  (ex-date in (year-ago start, latest session]) and that stock was **1% or more** of the
  sector's year-ago ₹ (`DEMERGER_MARK`, beside `NEW_LISTING_MARK`: a fixed display rule, never
  tuned). Stored as `sector_share_year.demerged` (`[{symbol, exDate}]`). Flagged on 6 Oct 2026:
  Auto (TMPV, 9.6% of its year-ago ₹), Fast Moving Consumer Goods (HINDUNILVR, 10.0%),
  Metals & Mining (VEDL, 11.2%), Realty (DBREALTY, 2.1%). Not flagged, under 1%: HEGAM
  (0.82%, found through its old symbol HEG), INDIAGLYCO (0.52%), GENUSPOWER (0.27%).

## Why

- Calendar anchoring compares like with like (same season, same results calendar).
- Pooled sums are exact and can't be dragged by one quiet week with a big share.
- Picking rows once from today's list stops a sector that had 4 trading stocks a year ago from
  losing its year-ago ₹ and looking like it grew from nothing.
- The new-listing mark and the survivorship line say plainly what today's list does to the
  comparison, instead of hiding it.

## Checks

- Tests first: pinned dates (6 Oct 2026 → 7 Jul–6 Oct 2026 vs 7 Jul–6 Oct 2025 with three
  holidays), short history → no blocks, pooled vs mean, points not percent, sort and ties,
  rows + small = 100% (± `NOISE_PCT`), a sector with 3 trading stocks a year ago keeps its
  ₹, new listing with zero vs one traded session, the 10% boundary in floating point (0.3 ÷ 3),
  week 0 share = the page's 1-week share, rename lineage in the year-ago block, the card's
  "Needs a year of history" state.
- Real data, 6 Oct 2026 (blocks 8 Jul–6 Oct 2026, 63 sessions; 8 Jul–6 Oct 2025, 62 sessions).
  A second route, hand-written recursive SQL over `symbol_changes` and `daily_prices`, gives the
  same shares to 2 decimals for all 19 sectors:

  | Sector | A year ago | Now | Change |
  |---|---|---|---|
  | Consumer Durables | 3.55% | 5.18% | +1.62 pts |
  | Financial Services | 22.85% | 23.91% | +1.05 pts |
  | Healthcare | 6.32% | 6.72% | +0.40 pts |
  | Capital Goods | 13.24% | 13.51% | +0.28 pts |
  | Information Technology | 7.46% | 7.24% | −0.22 pts |
  | Automobile and Auto Components | 9.24% | 7.18% | −2.06 pts |

  The main session's earlier rough check (no rename lineage) had Auto at 8.4% a year ago. The
  difference is TATAMOTORS, renamed TMPV on 24 Oct 2025: ₹463 billion traded in the year-ago
  block under the old symbol. With the lineage it counts, as it should.
- Week 0: Financial Services' share in `sector_flow_weeks` (26.37%) equals the page's 1-week
  bar share exactly. Small sectors: 0.28% now, 0.33% a year ago.
- Marked rows today: Consumer Services (20%), Metals & Mining (11%), Services (11%).

## Limits

- Two snapshots, not a trend: a busy few weeks at either end can move the change. The small
  line shows every week between.
- Today's list and today's sector labels: stocks that left the list are missing a year ago,
  and a stock NSE moved to another sector counts in its new one for both years. A company that
  demerged during the year counts whole a year ago and only its remaining part now; the row
  says so but the number is not corrected.
- The total is today's Nifty Total Market stocks (~750), not the whole exchange.
- Tracking only: a bigger slice can be heavy selling. It says where trading went, not where
  prices go.

## Revisit when

- Point-in-time Nifty Total Market membership exists (would remove the survivorship caveat).
- The owner wants a different block length (the 63 is one constant, `SHARE_BLOCK_SESSIONS`).
- Delivery by sector (TODO-research MF-3) lands: it could sit beside the share.
