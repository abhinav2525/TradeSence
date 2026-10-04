# Money flow history — design

**Date:** 2026-10-05 · **Status:** design agreed in conversation (owner: "yes you can. make sure the db is sorted") · **Path:** architectural (new nightly tables, page change)

## Intent (agreed)

- **Question:** is a sector's busy (or quiet) week a one-off, or has trading been building for
  months?
- **Success:** picking a sector on `/money-flow` shows a line of its weekly trading vs normal
  over the past 12 months, with 1× marked, hover details, and weeks containing a short special
  session marked. The last point equals today's 1-week bar. Rebuilt nightly.
- **Owner's extra ask:** "make sure the db is sorted": the new data is stored in properly keyed
  tables, nothing heavy runs per page view, and the database's planner statistics are current.
- **Out of scope:** daily or monthly views; history for single stocks.

## The numbers (same rule as the bars)

- **Weeks:** 52, counted back from the latest session in blocks of 5 sessions: week k covers
  sessions 5k … 5k+4 (newest first), its normal the 63 sessions after that (older), exactly as
  `flowWindows` defines the 1-week window. So week 0 = today's 1-week bar.
- Per week, per stock: ₹ in the week, normal ₹ per session (≥ 40 of 63 traded), move over the
  week (`windowMove`). Per sector: `sectorFlows(rows, 5)` unchanged: ratio over stocks with a
  normal that traded, median move, stock count. Sectors under 5 stocks are not stored.
- **Short sessions:** market-wide ₹ per session over the universe (from the same histories,
  EQ + BE, renames followed); `shortSessions` judges each. A week is marked if it contains one.
- **Limit (stated under the chart):** today's ~750 stocks and sectors are used for the whole
  year; each sector is compared with its own past on the same stocks.

## Storage ("the db is sorted")

- **`sector_flow_weeks`** — `week_end` date, `sector` text, `ratio` double null,
  `median_move` double null, `stocks` int, `short_session` bool; **PK (sector, week_end)**, the
  page's exact read ("one sector, ordered by week"). ~19 sectors × 52 = ~1,000 rows.
- **`short_sessions`** — `trade_date` date PK, `market_turnover` double, `usual_turnover` double.
  Written nightly for the judged range; the page reads it instead of aggregating `daily_prices`
  on every view (was ~80 ms per view).
- **`money_flow` primary key becomes (period, symbol)**: the page always reads one period; the
  old (symbol, period) order didn't match.
- All three rebuilt by `computeMoneyFlow` in its existing single transaction, from the
  histories it already loads (no second pass, no new download).
- **Planner statistics:** run `ANALYZE` once (`pg_stat_user_tables` showed `daily_prices` at 0
  live rows: stale after a restart); add `ANALYZE` of the rebuilt tables at the end of the
  nightly job so they stay current. Record the before/after query plans in the decision.

## The page

- When a sector is picked: a card "How trading in <sector> has moved" above the stock list:
  Recharts line (`useChartAnimation`, density-token height) of weekly ratio, `ReferenceLine` at
  1×, dots on short-session weeks, tooltip with week end, ratio, median move and the short-session
  note; footer with the limit. One series: no legend.
- The short-session notice above the bars reads `short_sessions` (dates inside the window).
- Glossary: the existing `trading-vs-normal` entry covers the chart; no new term.

## Checks

- Unit tests first: week windows (week 0 equals `flowWindows` period 5; weeks don't overlap;
  normal follows each week); weekly sector rows on hand-built histories; a short session marks
  its week; fewer than 52 weeks of history → only the weeks with a full normal.
- Compute test (test DB): writes all three tables, replaces on re-run.
- Live check: week 0 of a sector equals its 1-week bar; EXPLAIN of the page reads uses the keys.
- Headless screenshots wide and phone.

## Documentation

Decision 0029 (history + database tidy-up, with the plans before/after); pipelines.md; README;
CLAUDE.md; folder guides.
