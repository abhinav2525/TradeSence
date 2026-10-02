# Stock Report Card + Risk Calculator — design

**Date:** 2026-10-02 · **Status:** awaiting owner review · **Path:** architectural

## Intent (agreed)

- **Who:** a beginner looking at one stock before investing or trading.
- **Question:** "What could go wrong?" — trend, strength vs the market, how bumpy it is,
  its worst fall and how long recovery took, liquidity, and corporate events — plus a
  calculator: "if I put in ₹X, a typical bad stretch costs about ₹Y; the worst was ₹Z".
- **Tone:** plain language and traffic lights, evidence and ranges. **No buy/sell
  verdict, no single score** (SEBI; the app teaches, it doesn't tip).
- **Success:** a beginner opens any supported stock and in under a minute understands how
  risky it is and what a bad stretch would cost them in rupees.

**Owner's choices:** v1 covers **NIFTY 50 members** (the 50 current plus the 16 past members
since 2020), built so a wider universe is a data step later. The calculator's **holding
period is picked by the reader**: 1 week / 1 month / 3 months / 1 year, default 1 month.
**Approach A:** compute at request time from data already stored.

## Approach

Every risk number needs a **split-adjusted** price history. `daily_indicators.change_pct`
already holds each member's daily move on the adjusted, rename-joined series (decisions
0002–0004, 0008). Chaining those moves rebuilds a continuous adjusted price line; every
metric is derived from it. Cost: ~2,500 rows per stock, milliseconds. It also works "as
of" any past date (no look-ahead: only rows on or before the date are used), and it can't
disagree with the rest of the app.

**One new stored column:** `daily_indicators.turnover` (₹, that day), written by
`computeIndicators` from the rename-joined series, for the liquidity check. (Reading
`daily_prices` directly would miss a renamed stock's history, CLAUDE.md lineage rule.)

**History window:** everything available, from late Sep 2016 (both stock moves and
NIFTY 50 index closes start there), or from listing for newer stocks. Labelled on the
page ("since Sep 2016" / "since listing, Jul 2021").

## Page: `/stock/[symbol]`

`symbol` must be a stock in `index_members` (any period); anything else → 404. Params,
strictly validated as on every page: `date` (YYYY-MM-DD, snaps to the latest session on or
before it), `h` = `1w` | `1m` | `3m` | `1y` (default `1m`). The amount (₹) lives in the
browser only: the calculator is a client component and multiplies server-sent
percentages, so typing never reloads the page.

**Layout** (design system: one `display` figure, cards, tokens; mockup-free, follows the
existing pages):

1. **PageHeader**: eyebrow "NIFTY 50 · Stock", title = symbol, member status ("In the
   NIFTY 50 since 28 Mar 2025" / "Left the NIFTY 50 on 30 Sep 2026"), DateNav.
2. **Summary strip**: the five lights in a row (Trend, Strength, Bumpiness, Worst fall,
   Liquidity), e.g. "3 green · 1 amber · 1 red". Counts only, never a score.
3. **Check cards**, one per light, each with the figure, the light, and one plain
   sentence saying what it means and what it's compared with.
4. **Risk calculator card**: amount input (default ₹10,000), horizon toggle, then:
   - "1 in 10 [months] lost more than **−₹1,820**"
   - "The worst [month] since Sep 2016: **−₹3,410** (Mar 2020)"
   - "[Months] that ended lower: **38%**"
   - A histogram of every past [month]'s outcome in ₹, with the NIFTY 50's typical bad
     outcome marked for comparison.
   - Caveat line: "Past ranges, not a forecast. Losses can be larger than anything in
     this history."
5. **Price chart**: adjusted close with its 200-day average (selected session marked).
6. **"How far below its high" chart** (drawdown / underwater): % below the previous
   peak over time, worst fall annotated with peak, trough and recovery dates.
7. **Events**: recent splits, bonuses, demergers and renames, plus the number of dividends
   in the last 12 months (from `corporate_actions` and `symbol_changes`).

**Entry points:** every symbol in the Breadth tables, Screener and Crossings links to its
card; `/stock` lists all supported stocks (current members first, then past members)
with a filter box; the sidebar's Stocks group gains "Report card" (key `r`).

## Calculations (`src/indicators/risk.ts`, pure, tested)

All use the adjusted line built from `change_pct`. A null move starts a new segment, and
nothing spans a segment break (CLAUDE.md gap rule).

| Check | Measure | Light |
|---|---|---|
| **Trend** | Close vs its 50- and 200-day SMA; sessions above/below the 200-day | 🟢 above both · 🟡 above one · 🔴 below both |
| **Strength** | 6-month return minus NIFTY 50's, ranked against today's 50 members (percentile). Also shows 3- and 12-month returns | 🟢 ≥ 67th · 🟡 34th–66th · 🔴 ≤ 33rd |
| **Bumpiness** | Std. dev. of daily moves over the last 250 sessions ÷ the NIFTY 50's over the same sessions; also "a typical day moves ±x%" | 🟢 ≤ 1.2× · 🟡 ≤ 1.8× · 🔴 > 1.8× |
| **Worst fall** | Max drawdown over the history: % fall, peak, trough, recovery date (or "not recovered yet") and duration; ÷ NIFTY 50's max drawdown over the same period | 🟢 ≤ 1.2× · 🟡 ≤ 1.8× · 🔴 > 1.8× |
| **Liquidity** | Median daily turnover, last 20 sessions, in ₹ crore | 🟢 ≥ ₹100 cr · 🟡 ≥ ₹10 cr · 🔴 < ₹10 cr |

Lights are **relative to the NIFTY 50 index** where possible, so the market's own
crashes (COVID) don't paint every stock red. Thresholds live in one constants block and
are recorded in the decision file.

**Calculator:** every rolling window of h sessions (1w = 5, 1m = 21, 3m = 63, 1y = 250)
in the history, as % returns. Shown: 10th percentile ("1 in 10 was worse"), minimum
(with its date), share negative, median. Same for the NIFTY 50 for comparison. Windows
overlap, which is stated as "every [month]-long stretch". Needs ≥ 3× h sessions of
history, or the card says "not enough history yet for [1 year] stretches".

**Strength percentile** needs the other 49 members' 6-month returns: one query over
`change_pct` for members on the date (≈ 50 × 126 rows).

## Data flow

`page.tsx` → `stockReport(symbol, date)` in `src/query/stock-report.ts`:
1. Resolve the session (membership-aware `resolveSession`), 404 if the symbol is unknown.
2. Load the stock's `daily_indicators` rows ≤ date (close, sma50, sma200, change_pct,
   turnover), the NIFTY 50 closes from `index_prices` ≤ date, the members' 6-month moves,
   and corporate actions + symbol changes for the lineage.
3. Pure functions in `risk.ts` turn them into a `StockReport` object (all percentages and
   dates, no rupees).
4. The page renders checks and charts; `RiskCalculator` (client) applies the amount.

## Errors and edge cases

- **Unknown symbol** → `notFound()`. Never echoes the raw param into SQL (parameterised
  query; no `sql.raw`).
- **Short history** (new listing): each check and horizon says "not enough history yet"
  rather than computing from too little.
- **Date before the stock's history** → the "nothing loaded" card, as on other pages.
- **Past members** (e.g. YESBANK): fully supported; the header says when they left, and
  Strength is ranked against the members on the chosen date.
- **Not recovered yet** → "Still 23% below its Jan 2024 high" instead of a recovery date.

## Testing

- `risk.ts`: adjusted line rebuild across a null (segment break); max drawdown with peak,
  trough and recovery, including "not recovered"; rolling-window percentiles and the
  ≥ 3×h guard; volatility ratio; each light's boundaries; no look-ahead (rows after the
  date ignored).
- `stock-report.ts` (test DB): unknown symbol; renamed stock uses the joined history; a
  split day doesn't create a drawdown.
- `computeIndicators`: `turnover` stored and joined across a rename.
- Browser check (headless Chrome, as before): a current member, a past member (YESBANK),
  a renamed one (ETERNAL), horizon toggle, amount typing.
- Verification against TradingView for one stock's max drawdown (CLAUDE memory: verify
  before claiming).

## Out of scope (v1)

Delivery %, valuation (P/E), company names and sector tags, whole-market universe, a
"score", alerts. Each is a later step; the design doesn't block any of them.

## Documentation

`docs/decisions/0011-stock-report-card.md` (thresholds and why), README function
reference, `docs/pipelines.md` (turnover column), CLAUDE.md pages list, TODO.
