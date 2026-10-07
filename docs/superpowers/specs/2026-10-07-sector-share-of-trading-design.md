# Sector share of trading over a year (Money flow) — design

**Date:** 2026-10-07 · **Status:** approved by the owner 7 Oct 2026 (3-month blocks) · **Path:** feature (one existing
page; one new column on an existing nightly table)
**Source:** quant advisor's proposal `docs/proposals/2026-10-07-money-flow-and-top-volume-next.md`, idea 4
(TODO-research MF-4). The owner picked it ("yes write the spec for MF-4").

## Intent

- **Question it answers:** over the last year, which sectors are taking a bigger slice of all the money traded,
  and which a smaller one? Money flow's "× normal" can't show this. Its normal is the sector's own last 3
  months, so a slow, steady shift reads 1.0× every week.
- **What the owner sees:** a new card on `/money-flow`, **"Share of trading over a year"**. Each sector gets a
  row with its share now, its share a year ago, the change in points, and a small 52-week line. When a sector
  is picked, its existing history chart gains the share line too.
- **Example** (quant advisor's query, four weeks to 6 Oct, 2025 vs 2026; re-check when building): Financial
  Services 23.4% → 26.1% (+2.7 pts), Capital Goods 13.1% → 14.5%, Healthcare 5.8% → 7.0%, IT 8.1% → 6.3%
  (−1.8 pts), Auto 8.0% → 6.7%.
- **Tracking, not prediction.** It shows where trading went, not where prices go. The wording never says
  "money is flowing into X, so buy X". A growing share can be heavy *selling*, and the card says so, as the
  page already does.
- **Out of scope:** delivery by sector (MF-3), the whole-market line (TODO-research 1), share for a past date
  (no date navigation, as today), sectors under 5 stocks as their own rows, any UI redesign.

## The numbers (fixed here)

- **Universe and sectors:** as Money flow today. The ~750 Nifty Total Market stocks on today's list,
  NSE's sector (`industry`), EQ + BE through `loadAdjustedHistory` (renames followed).
- **Weekly share** for week k (the existing `weekWindows`: sessions 5k … 5k+4, k = 0 … 51) = the sector's ₹
  traded that week ÷ **all** ₹ traded that week by every stock in the universe, including sectors under 5
  stocks. This is `SectorFlow.share`, which `sectorFlows` already computes. Week 0 is identical to the
  page's 1-week share.
- **Share now** = Σ sector ₹ over weeks 0–3 ÷ Σ all ₹ over weeks 0–3. **Share a year ago** = the same over
  weeks 48–51. Both are rupee-weighted pooled sums, not averages of weekly shares, so one huge week counts by
  its size. 4-week blocks smooth single-week news (a SUNTV week).
- **Change** = share now − share a year ago, in percentage points ("+2.7 pts"). Never a percent of a percent.
- **Sort:** change, largest gain first, ties by sector name.
- **Sectors under 5 stocks** stay out of the rows, as on the bars. A footnote gives their combined share, so
  the rows plus the footnote add to 100%.
- **Weeks with a short session** (Muhurat): shares are relative, so a short session affects every sector
  alike. They are kept, unflagged in the share line (the ratio line keeps its existing flag).

### Survivorship and new listings (the main trap)

Today's list leaves out stocks that left the universe during the year (understates their sector's past
share) and includes this year's new listings (they had no trading a year ago, so they inflate the sector's
gain).

- Per sector, compute **new-listing share** = ₹ traded in weeks 0–3 by stocks with **no trading in weeks
  48–51** ÷ the sector's ₹ in weeks 0–3.
- If it is **≥ 10%**, the row is marked "partly new listings: 14% of this sector's recent trading is from
  stocks that weren't trading a year ago". The glossary explains it.
- Under the card, one fixed line: "Uses today's Nifty Total Market list and today's sectors. Stocks that left
  the list aren't counted, and new listings had no trading a year ago."

## Data: one new column

- `sector_flow_weeks` gains **`share double precision not null default 0`**, written by
  `weeklySectorFlows` from `SectorFlow.share`. The table is rebuilt nightly in one transaction, so no backfill
  is needed beyond one `bun run money-flow`.
- The universe-wide "small sectors" share per week and the per-sector new-listing share are computed at
  query time from `sector_flow_weeks` and `money_flow` *if* that is enough. Otherwise the builder may add a
  `new_listing_share` column or a tiny `market_flow_weeks` row per week. **The lead engineer decides which.**
- `weekWindows` already needs 52 weeks plus a normal. The share needs no normal, so `SESSIONS` is unchanged.

## Code

- `src/indicators/money-flow.ts`: `SectorWeek` gains `share`; `weeklySectorFlows` copies it. New pure
  `shareChange(weeks: SectorWeek[] …)` returns per-sector now / year-ago / change, using pooled ₹. That needs
  the weekly ₹ per sector and in total, so the builder may store `turnover` and `total_turnover` per week
  instead of `share` if that makes pooling exact. **The lead engineer picks one.**
- `src/query/money-flow.ts`: `shareHistory()` reads it for all sectors in one query.
- `src/app/money-flow/page.tsx`: a new card under the bars, *above* the picked sector's stock list. The card
  shows on every period tab, because it doesn't depend on the period. No new search params.
- **Rows:** sector · share now · a year ago · change (`text-up`/`text-down` only for the sign, no
  "good/bad" colouring beyond that) · a 52-point sparkline (reuse the pattern of `WashoutSpark`; tokens only,
  `useChartAnimation`).
- `FlowHistoryChart`: when a sector is picked, add its weekly share as a second panel or a second axis, chosen
  by the design system rules (`docs/design/system/README.md`; dataviz: prefer a second small panel to a
  dual axis).
- Phone: the row keeps sector, change and sparkline, and hides the two share columns below `sm`.

## Glossary (`tests/glossary.test.ts`)

- `share-of-trading-trend`: "A sector's slice of all the rupees traded in the market, now (last 4 weeks)
  against a year ago (the same 4 weeks then). +2.7 pts means its slice grew from 23.4% to 26.1%. Shows where
  trading went, not where prices go; heavy trading can be selling."
- `new-listing-share`: why a sector with fresh listings looks like it grew.
- Every new header or tile gets a `<Term>`, outside any `<Link>`.

## Tests (written first)

- `weeklySectorFlows` writes `share` = the sector's ₹ ÷ all ₹, including small sectors in the denominator.
- Pooling: a fixture where one huge week dominates gives the pooled share, not the mean of weekly shares.
- Change in points: 23.4 → 26.1 gives +2.7, not +11.5%.
- New-listing share: a stock with no trading in weeks 48–51 counts; one with a single traded session in that
  block doesn't. The boundary at exactly 10% is marked.
- Rows plus the small-sectors footnote sum to 100% (± `NOISE_PCT`).
- Fewer than 52 weeks of history (a fresh database): the card shows "needs a year of history" and no
  year-ago column, never a 0%.
- Density/motion tests still pass.

## Docs

- Decision file (next free number), with a row in `docs/decisions/README.md`. `docs/pipelines.md`:
  `sector_flow_weeks.share`.
- `TODO-research.md`: MF-4 → picked/built. `TODO.md` updated.

## Review

- **quant-advisor:** Approve with changes. Required: (1) weeks 48–51 are sessions 240–259 = 17 Sep–15 Oct 2025, ~55 weeks back (NSE has ~248 sessions a year, not 260): anchor "a year ago" to the same calendar dates a year earlier; (2) with the calendar window the example checks out (FS 23.4→26.1); with weeks 48–51 FS reads 26.1→26.1 (0.0) and Capital Goods 11.1→14.5: fix the example to the shipped rule and pin the year-ago dates in a test; (3) a 9-session shift erased a +2.7-pt headline: say the change compares two snapshots, sparkline in every row; (4) the denominator is today's Nifty Total Market stocks, not "the market": fix glossary and card title/subtitle; (5) survivorship line also says sectors are today's labels. Optional: (6) a 13-week block is steadier than 4; (7) the 10% new-listing mark is a fixed display rule, say so in the decision file; (8) store weekly ₹ per sector and total, not share.

**Main session's changes after both reviews (binding; override the body where they differ):**
1. **Year-ago window is calendar-anchored.** Now block = the sessions from the block's first session to the latest session D. Year-ago block = the sessions whose dates fall in the same calendar span shifted back exactly one year (e.g. 8 Sep–6 Oct 2026 → 8 Sep–6 Oct 2025). Test pins these dates. Block length: see owner question below.
2. **Storage:** `sector_flow_weeks` gains `turnover`, `total_turnover`, `new_listing_turnover` (lead engineer 1, 3) for the sparkline and the picked-sector chart. The two blocks are computed nightly from the histories already in memory and written to a small new table `sector_share_year` (sector, now_turnover, now_total, ago_turnover, ago_total, new_listing_turnover, now_from, now_to, ago_from, ago_to). This is needed because the calendar year-ago block doesn't line up with the 52 stored weeks. Small sectors' share is worked out at query time from the totals (lead engineer 2).
3. **Rows from today's list:** the sectors with ≥ 5 stocks on today's list get rows, and their year-ago block is summed over the same stocks whatever their count then (lead engineer 4).
4. "Needs a year of history" unless both blocks have sessions (lead engineer 5).
5. **Wording:** title "Share of trading over a year"; subtitle "Each sector's slice of all ₹ traded by today's Nifty Total Market stocks: the last N weeks against the same weeks a year ago. Two snapshots, not a trend line; the small line shows every week between." The glossary says the same. The survivorship line adds "and today's sector labels: a stock NSE moved to another sector counts in its new one for both years."
6. The 10% new-listing mark is one named constant (`NEW_LISTING_MARK`) beside `MIN_SECTOR_STOCKS`, a fixed display rule, never tuned (decision file says so).
7. Tests: the lead engineer's (6) list plus the pinned year-ago dates.
8. **Owner's choice (7 Oct): 3-month blocks.** "Now" = the last 63 sessions to D; "a year ago" = the same calendar span one year earlier (e.g. 7 Jul–6 Oct 2026 vs 7 Jul–6 Oct 2025). Main session's check (approximate: no rename lineage), 3 months vs 4 weeks: Financial Services 23.2→24.0 (+0.8) vs +2.8; IT 7.4→7.3 (−0.1) vs −1.8; Capital Goods +0.1 vs +1.3; Healthcare +0.3 vs +1.2; Auto 8.4→7.2 (−1.3) on both. The worked example in the body (4-week numbers) is superseded; re-check these in the build. Subtitle reads "the last 3 months against the same 3 months a year ago". The nightly lookup must reach one year + 63 sessions back (check `SESSIONS` in compute-money-flow.ts covers it, else widen).
- **lead-engineer:** Approve with changes. Required: (1) store `turnover` and `total_turnover` (all universe ₹ that week, small sectors included, same value on each of the week's rows) in `sector_flow_weeks`, not `share`; pooled shares are exact sums; test week 0 = the page's 1-week share. (2) Small sectors' share at query time: pooled total − pooled shown-sector ₹, ÷ pooled total; no extra table. (3) New-listing share can't come from `money_flow` (1/5/21 windows only): add `new_listing_turnover`, filled nightly from the histories already in memory (that week's ₹ from stocks with no trade in weeks 48–51). (4) Pick the sectors that get rows once, from today's list; today `weeklySectorFlows` applies the under-5 rule week by week, so a sector with 4 stocks a year ago would lose its year-ago rows and its gain would look inflated. (5) "Needs a year of history" unless weeks 0–3 and 48–51 all exist (`weekWindows` stops early on short history). (6) Tests: exact pooled share; rows + small sectors = 100%; a sector under 5 stocks in old weeks keeps its year-ago rows; week 0 share = page's 1-week share; the 10% boundary. Optional: (7) ~1,000 rows, ~330 kB, negligible nightly cost; read in one query `order by sector, week_end`; (8) the 10% cut-off as one named constant beside `MIN_SECTOR_STOCKS`.
