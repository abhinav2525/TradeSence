# Loudest stock (Money flow) and "Unusually busy" (Top volume) — design

**Date:** 2026-10-07 · **Status:** reviewed by both advisors (approve with changes, all taken); awaiting owner approval · **Path:** feature (two
existing pages; one new column on an existing nightly table)
**Source:** quant advisor's proposal `docs/proposals/2026-10-07-money-flow-and-top-volume-next.md`,
ideas 1 and 2 plus "misleading today" item 2. The owner chose all three ("yes write it, include idea 2 too")
and asked for a toggle that removes the noise from one loud stock.

## Intent

- **Problem:** this week Money flow ranks Media first at **1.78×**, but SUNTV alone traded more extra rupees
  than the whole sector did. The other seven stocks were *quieter* than usual. The bar makes a one-company
  story look like money going into a sector. Top volume ranks by size only, so giants such as HDFCBANK are
  always on top, and a stock trading 20× its own normal sits at #24 or lower.
- **What the owner gets:**
  1. On Money flow, every sector shows **"2 of 8 busier"**: how many of its stocks traded above their own
     normal.
  2. On Money flow, a toggle **"Hide the loudest stock"** re-measures each sector without its biggest mover,
     re-sorts the bars and names the stock that was left out ("without SUNTV"). Off by default.
  3. On Top volume, a **"× normal"** column and a third rank option, **"Unusually busy"**, which sorts by
     it.
  4. On Top volume, one line under the rank switch: "Shares favour low-priced stocks; ₹ compares fairly."
- **Tracking, not prediction.** Research 0004/0005 found heavy volume doesn't predict price. The copy says
  "busy", never "buy", and both pages keep their existing "not a forecast" wording.
- **Out of scope:** idea 3 (delivery by sector), idea 4 (52-week share chart), idea 5 (whole-market line),
  the toggle on the 52-week history chart, bulk/block deals, any UI redesign.

## Part 1: Money flow

### Numbers (fixed here)

These use the existing per-stock rows (`money_flow`: turnover, normal_daily, period) and the existing ratio
rule (`sectorFlows`): only stocks **with a normal that traded in the window** count ("counted stocks").

- **Extra ₹** per stock = turnover − normalDaily × P (this is already `sectorStocks`' `extra`).
- **Busier count** = counted stocks with turnover > normalDaily × P, shown as "*b* of *n* busier", where *n* =
  counted stocks. The comparison is strict: exactly at normal is not "busier". Shown whether the toggle is on
  or off.
- **Loudest stock** = the counted stock with the **largest positive extra ₹**. Ties break on symbol, A first.
  If no counted stock is above its normal, there is no loudest stock and the toggle changes nothing for that
  sector. The row then says "no stock above its normal".
- **Ratio without the loudest** = Σ turnover ÷ Σ (normalDaily × P) over the counted stocks minus the loudest.
  It is null when nothing is left.
- **Toggle on:** each sector's bar shows its ratio without the loudest stock. Sectors re-sort by that number
  (the same comparator as today, ties by name). The bar is labelled "without SUNTV". The original ratio stays
  visible in smaller text ("1.78× with it"), so nothing is hidden. Share of trading, direction and the stock
  list don't change.
- **Small sectors:** `MIN_SECTOR_STOCKS` (5) still decides which sectors are shown, before any removal. A
  sector of exactly 5 counted stocks shows its without-ratio but marks it "few stocks". The busier count is
  the steadier of the two numbers.
- **Worked example** (period 5, to 6 Oct 2026, quant advisor's query; re-check when building): Media 1.78× →
  0.74× without SUNTV, 2 of 8 busier. Construction Materials 1.23× → 1.01× without SHREECEM. Construction
  1.38× → 1.24×, 8 of 23 busier.

### Code

- `src/indicators/money-flow.ts`: `SectorFlow` gains `busier`, `counted`, `loudest: string | null`,
  `ratioWithoutLoudest: number | null`, all computed inside `sectorFlows` (pure; no new query). The toggle
  only changes the sort and which ratio the page draws, through a `sectorFlows(rows, period, { hideLoudest })`
  option or a separate pure `sortSectors(sectors, hideLoudest)`. The builder picks one; it must keep
  `weeklySectorFlows` unchanged.
- `src/app/money-flow/page.tsx`: new search param `loud`, validated by strict comparison
  (`v === "hide"`, anything else is off), carried through `href()` like `period` and `sector`. The toggle is a
  `Link` in the controls row, styled like the existing segment control. No client state, so it works without
  JavaScript.
- `FlowBars`: draws the chosen ratio, the "without X" label, the "*b* of *n* busier" text, and "x× with it"
  when the toggle is on.
- No schema change, no nightly change.

## Part 2: Top volume

### Numbers (fixed here)

- **Normal** per stock and period = mean ₹ traded per session over the **63 market sessions before the
  window**, counting only sessions it traded, with **≥ 40** needed (`NORMAL_SESSIONS`, `MIN_NORMAL`: the same
  rule and constants as Money flow, so a stock's 1-week "× normal" is identical on both pages).
- **× normal** = turnover ÷ (normalDaily × P), the same as Money flow's ratio. P is the window's market
  sessions, not the sessions the stock traded, so a stock suspended for part of the week reads lower, not
  higher. Null without a normal. The column shows "–".
- **Floor for the "Unusually busy" sort:** normalDaily ≥ **₹5 crore** (`BUSY_FLOOR_RS = 5e7`). Without a
  floor a ₹10-lakh-a-day stock at 40× tops the list. Stocks below the floor or without a normal are **left
  out of that sort**, and the page says how many ("312 stocks that usually trade under ₹5 crore a day, or
  that are too new, aren't ranked here"). The column still shows their × normal under the ₹ and Shares
  rankings.
- **Sort:** × normal descending, ties by symbol. Every existing filter (size, sector, index) applies first.
- **Worked example** (period 5, to 6 Oct 2026, quant advisor's query; re-check when building): SUNTV 22.9×
  (#24 by ₹), IRCON 13.7×, KSB 9.2×, ABLBL 9.2×. BSE (#1 by ₹) 2.74×, HDFCBANK 1.36×.

### Data: one new column

The 1/5/21 normals already exist in `money_flow`, but Top volume also has 3- and 6-month windows. Proposal:
add **`normal_daily double precision null`** to `volume_leaders`, computed in `computeVolumeLeaders` by the
**same function** Money flow uses (export the normal part of `windowStat`, or a `normalDaily(h, from, to)`
helper; one rule, no copy). For a 126-session window the normal is the 63 sessions before that window,
about 6 to 9 months ago. That is honest but old. The column header says "× its normal" and the glossary says
"the 3 months before the period".

*Alternative for the lead engineer to weigh:* join `money_flow` at query time for 1/5/21 and show "–" for
3 and 6 months. That needs no migration, but it gives two sources for one number and an empty column on two
tabs. I recommend the column.

### Code

- `src/db/schema.ts` + migration (`bun run db:generate && bun run db:migrate`).
- `src/indicators/volume-leaders.ts` / `compute-volume-leaders.ts`: compute and write `normal_daily` per
  period. The windows already come from market sessions. The normal window is the 63 market sessions before
  each window's first session.
- `src/query/volume.ts`: `RankBy` = `"value" | "shares" | "busy"`, `LeaderRow.normalDaily`, `busyRatio`;
  for `busy`, filter by the floor, sort, and return the left-out count.
- `src/app/volume/page.tsx`: `cleanRank` accepts exactly `"shares"` or `"busy"`, else `"value"`. A third
  segment "Unusually busy". Under the switch, the Shares line (always shown) and, for `busy`, the left-out
  line. `VolumeTable` gets the × normal column on every rank.
- Short sessions (Muhurat) in a 1-day window make every stock look quiet. Reuse `short_sessions` and show the
  existing short-session note when the window contains one, as Money flow does.

## Glossary (both parts; `tests/glossary.test.ts`)

- `busier-count`: "2 of 8 busier": how many of a sector's stocks traded more rupees than their own normal.
- `loudest-stock`: the stock with the most rupees above its own normal; "hide" shows the sector without it,
  to tell a one-company story from a sector-wide move. Example: Media without SUNTV.
- `times-normal`: a stock's ₹ traded in the period ÷ what it usually trades (the 3 months before), × the
  period's sessions. 3× means three times its usual. Busy, not a forecast (research 0004/0005).
- Each new header or tile gets its `<Term>`, outside any `<Link>`.

## Tests (written first)

- `sectorFlows`: busier count with a stock exactly at normal (not busier); loudest = largest positive extra;
  tie by symbol; no stock above normal → `loudest` null and ratio unchanged; the 5-stock sector still shown;
  a suspended stock (no trading) not counted in *n*; the sort with the toggle uses the without-ratio.
- Media-like fixture: one stock's extra exceeds the sector's → without-ratio < 1 while the ratio is > 1.
- `normal_daily` for Top volume equals Money flow's `normal_daily` for the same stock and period 1/5/21 on
  real data (one query in the build's real-data check, not a unit test).
- Floor boundary: normalDaily exactly ₹5 crore is ranked; one rupee under is not.
- `cleanRank("busy")`, `cleanRank("BUSY")` → value; `loud=hide` only.
- `tests/density.test.ts` and the motion test still pass (new UI uses tokens, `useChartAnimation` if bars
  animate).

## Docs

- Decision file (next free number) covering both parts, the floor, and why the normal is the same one as on
  Money flow. Row in `docs/decisions/README.md`.
- `docs/pipelines.md`: `volume_leaders` gains `normal_daily`.
- `TODO-research.md`: MF-1 and MF-2 and the Shares line → "picked/built". `TODO.md` updated.

## Review

- **quant-advisor:** Approve with changes. Definitions are right. Required: (1) show the whole market's "x of y busier" beside the sector counts: with a normal that is an average, most stocks sit below their own normal (5-session window: market 1.06× yet 269 of 747 busier), so "2 of 8" alone misleads; (2) with the toggle on, say once that removing the biggest mover always lowers a sector's figure; compare sectors, not with vs without; (3) `times-normal` glossary: "÷ (its usual ₹ a day × the period's sessions)"; (4) test that a renamed stock's Top volume normal covers its old ticker. Optional: "₹ compares companies on the same footing"; a note that rebalance days and ex-dates top 1-day "Unusually busy"; say "3 months before this period" in the column header.
- **lead-engineer:** Approve with changes. Add the column, not a query-time join (one nullable column on a nightly-rebuilt table; ~3,700 values; one source per page). Required: (1) widen the session lookup in `computeVolumeLeaders` from 126 to 126+63 = 189 sessions, or the 3- and 6-month normals are always null; (2) export one `normalDaily(h, from, to)` from `money-flow.ts`, have `windowStat` call it, and call it from `compute-volume-leaders.ts` (not `volume-leaders.ts`, which `money-flow.ts` imports); (3) build each window's normal dates the way `flowWindows` does (`days[p]` … `days[p+62]`); (4) × normal = turnover ÷ (normal_daily × period), never the stored `sessions`; (5) "Top volume normal = Money flow normal for 1/5/21" as a unit test on a shared fixture. Extra tests: 39 traded sessions → no normal; 126-session normal filled with 189+ sessions; with rank=busy, filters apply before the floor and the left-out count matches; `loud=HIDE`, `loud=1` → off. Optional: offer "Unusually busy" only on 1/5/21; return the left-out count from the same query.

**Main session's changes after both reviews (all required items taken):**
1. Money flow shows the whole market's count above the sectors ("Whole market: 269 of 747 busier"); the `busier-count` glossary says most stocks sit below their own normal in an ordinary week, because a few very busy days pull an average up.
2. With the toggle on, one line under the bars: "Taking out a sector's biggest mover always lowers its number. Compare sectors with each other."
3. `times-normal` glossary: "₹ traded ÷ (its usual ₹ a day × the period's sessions)".
4. Top volume's normal goes through `loadAdjustedHistory` (it already does for turnover); test that a renamed stock's normal covers its old ticker.
5. Lead engineer's (1)–(5) and extra tests as listed above.
6. Optional items taken: "Unusually busy" is offered on 1 day / 1 week / 1 month only (a 6–9-month-old normal is a weak yardstick); the 3- and 6-month tabs still show the × normal column, headed "× normal (3 months before)". The left-out count comes from the same query. The Shares line reads "Shares favour low-priced stocks; ₹ compares companies on the same footing." A note on the 1-day busy view: "Index rebalance days and ex-dates often top this list."
