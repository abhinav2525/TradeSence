# 0004 — Does volume tell us anything across the whole market?

**Date:** 2026-10-04 · Re-run any time: `bun run research:volume-market` (about 75 seconds; `-- --json file` writes the chart data) · Spec:
[`docs/superpowers/specs/2026-10-04-volume-whole-market-design.md`](../superpowers/specs/2026-10-04-volume-whole-market-design.md) · Charts: [`0004-charts.html`](0004-charts.html) (also published as a private page, "Does Volume Predict?")

## The question

Research 0002 tested volume signals on the NIFTY 50 and found nothing. Big companies trade
heavily every day, so the real test is the whole market, where a sudden rush of trading is
rarer. We tested six popular volume signals on every NSE company trading ₹1 crore a day or
more since 2016 (ETFs left out) and asked: **after the signal, did that stock do better or
worse than other stocks on the same days?**

## The short answer

**Two signals were real, and both point the opposite way from the popular reading.**

| Signal | Next month, vs other stocks on the same days | Real? | Big enough? | Verdict |
|---|---|---|---|---|
| Huge volume (5× usual) on a **rising** day | **Behind by 0.9 points**, mostly in the first week; the gap closes by 6 months | Yes, both periods (2023–: −0.7) | Yes | **Build** |
| **Breakout** above the 200-day average on heavy volume (2×) | **Behind by 1.2 points**, and the gap kept growing to 1.9 points at 6 months | Yes, both periods (2023–: −1.0) | Yes | **Build** |
| Breakdown below the 200-day average on heavy volume | Behind by 0.4 | Not proven on 2016–22 (beat 19.8% "worse"); clear on 2023– | No | Maybe |
| Huge volume on a falling day | Behind by 0.2 | No | No | Maybe |
| Buyers in control (Chaikin Money Flow, top fifth) | Behind by 0.3 at a month, ahead later | No; nothing on 2023– | No | Don't build |
| Quiet buying (price down, On-Balance Volume up) | Nothing (−0.04) | No | No | Maybe |

**In one line:** across the whole market since 2016, a stock that surged on huge volume, or
broke above its 200-day average on heavy volume, typically did **worse** than other stocks
afterwards. "Volume confirms the move" didn't hold; if anything, heavy volume on good news
marked a short-term top.

"Build" here means "the effect is real and big enough to show". For a tracking page that
says what happens, not a buy signal: these are reasons for caution, not trades.

## How to read the numbers

- **Volume vs normal:** today's shares traded ÷ the average of the previous 20 sessions,
  adjusted for splits and bonuses, the same measure as the Unusual activity page's "Huge
  volume". A spot check matched the page's figures to four decimals on three stocks.
- **Same days, other stocks:** each signal is compared with random other eligible stocks on
  the same dates, 1,000 times (decision 0022). A rising or falling market can't flatter it.
- **Returns start the next day:** volume figures are known after the close, so every return
  runs from the next session's close.
- **Decide, then confirm:** verdicts were decided on episodes starting 2016–2022 and had to
  show again in episodes starting 2023 or later.
- **Effect, in "pts" (percentage points):** the signal's median one-month return minus the
  typical same-day stock's. Example: signal stocks −0.7%, other stocks +0.2%, gap −0.9 pts.
  The bar was ±0.5 pts, roughly a round trip's costs.

## Results

| Signal | Episodes | Months | Median | Typical same-day stock | Beats random | Same way | Effect | 2023– episodes | 2023– beats | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Huge volume (≥ 5×), price up | 12617 | 75 | -0.7% | +0.2% | 0.0% (worse) | 4 of 4 | -0.87 pts | 14456 | 0.0% (worse) | Build |
| Huge volume (≥ 5×), price down | 3819 | 75 | -0.3% | -0.1% | 12.6% (worse) | 3 of 4 | -0.16 pts | 4286 | 2.7% (worse) | Maybe |
| Breakout above the 200-day average on heavy volume (≥ 2×) | 3612 | 66 | -1.3% | -0.1% | 0.0% (worse) | 4 of 4 | -1.17 pts | 4518 | 0.0% (worse) | Build |
| Breakdown below the 200-day average on heavy volume (≥ 2×) | 1280 | 66 | -1.0% | -0.6% | 19.8% (worse) | 3 of 4 | -0.38 pts | 1701 | 1.1% (worse) | Maybe |
| Buyers in control (Chaikin Money Flow, top fifth) | 16929 | 75 | -0.1% | +0.2% | 0.0% (worse) | 2 of 4 | -0.28 pts | 16399 | 42.5% (worse) | Don't build |
| Quiet buying (price down, On-Balance Volume up, 20 sessions) | 24641 | 75 | -0.1% | 0.0% | 17.4% (worse) | 4 of 4 | -0.04 pts | 23091 | 0.1% (worse) | Maybe |


**What stands out:**

- **Huge volume on an up day gave back ground quickly.** Against the typical same-day stock
  it was 0.25 points behind after one session and 0.65 after a week, stayed 0.6 to 0.9
  behind for two months, then mostly caught up by six (−0.2). It held in 2023– too (−0.72 at
  a month).
- **Heavy-volume breakouts kept lagging.** −0.7 points after a week, −1.2 at a month, −1.4
  at two months, −1.7 at three and −1.9 at six. A breakout on heavy volume is the textbook
  "buy" signal; across 3,612 cases in 2016–22 and 4,518 since, it was followed by
  underperformance. A plausible reading: many such breakouts are the end of a run-up, not
  the start.
- **Heavy-volume breakdowns** lagged as well (−0.4 at a month), clearly in 2023– but not
  reliably in 2016–22, so not proven.
- **The rest were noise.** Buyers in control was slightly behind at a month and slightly
  ahead later; quiet buying and huge volume on a falling day were within a few tenths of a
  point of ordinary stocks.

## Caveats (please read)

- **6 tests at once.** One could pass the 2016–22 rules by luck; both winners also passed
  the 2023– check, with strength 100% in both periods.
- **Liquid companies only** (₹1 crore a day). The tiniest stocks are left out on purpose.
- **Stocks moved into the restricted BE segment** after a spike leave our EQ history for a
  while; checked: only 1.8% of huge-up days were followed by such a move within 45 days,
  far too few to explain the effect.
- **Sector and size aren't held constant.** If heavy-volume surges cluster in small,
  speculative names, the effect may partly be about those names.
- **Medians, not guarantees.** Plenty of individual stocks did the opposite.

## Method

As specified, with nothing changed after the first run. Signals: huge volume = ≥ 5× the
previous-20-session mean (with a valid day's move: none across a stretch outside EQ);
heavy = ≥ 2×; SMA 200 computed per stock on adjusted closes; CMF(20) top fifth cut from
2016–22 stock-days (cut: 0.083); quiet buying = 20-session price down with OBV up. Episodes
merge firing days within 10 sessions per stock. Code: `src/research/volume-market.ts`
(tested in `tests/volume-market.test.ts`) and `cli-volume-market.ts`, reusing research
0002's indicators and research 0003's comparison and verdict.

## What this means for the app

- **Unusual activity page:** a "Huge volume" day on a rising stock can carry a plain,
  sourced line, e.g. *"After days like this, stocks typically lagged other stocks by about
  1% over the next month (study 0004)."* Never a sell instruction. Owner's call.
- **Top volume leaderboard (TODO):** the same caution applies to stocks topping the
  volume table on a big up day.
- **Screener:** heavy-volume crossings above the 200-day average shouldn't be presented as
  stronger signals; if anything, the opposite.

## Appendix: full results (generated)

### Results (main span: 1 month; discovery 2016–2022, hold-out 2023–)

| Signal | Episodes | Months | Median | Typical same-day stock | Beats random | Same way | Effect | 2023– episodes | 2023– beats | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Huge volume (≥ 5×), price up | 12617 | 75 | -0.7% | +0.2% | 0.0% (worse) | 4 of 4 | -0.87 pts | 14456 | 0.0% (worse) | Build |
| Huge volume (≥ 5×), price down | 3819 | 75 | -0.3% | -0.1% | 12.6% (worse) | 3 of 4 | -0.16 pts | 4286 | 2.7% (worse) | Maybe |
| Breakout above the 200-day average on heavy volume (≥ 2×) | 3612 | 66 | -1.3% | -0.1% | 0.0% (worse) | 4 of 4 | -1.17 pts | 4518 | 0.0% (worse) | Build |
| Breakdown below the 200-day average on heavy volume (≥ 2×) | 1280 | 66 | -1.0% | -0.6% | 19.8% (worse) | 3 of 4 | -0.38 pts | 1701 | 1.1% (worse) | Maybe |
| Buyers in control (Chaikin Money Flow, top fifth) | 16929 | 75 | -0.1% | +0.2% | 0.0% (worse) | 2 of 4 | -0.28 pts | 16399 | 42.5% (worse) | Don't build |
| Quiet buying (price down, On-Balance Volume up, 20 sessions) | 24641 | 75 | -0.1% | 0.0% | 17.4% (worse) | 4 of 4 | -0.04 pts | 23091 | 0.1% (worse) | Maybe |

### Day by day after the signal (discovery medians vs the typical same-day stock)

| Signal | 1d | 3d | 5d | 10d | 21d | 42d | 63d | 126d |
|---|---|---|---|---|---|---|---|---|
| Huge volume (≥ 5×), price up | -0.3 vs -0.1 | -0.6 vs -0.1 | -0.8 vs -0.2 | -0.7 vs 0.0 | -0.7 vs +0.2 | -0.6 vs +0.3 | 0.0 vs +0.5 | +1.4 vs +1.6 |
| Huge volume (≥ 5×), price down | -0.1 vs -0.1 | -0.3 vs -0.2 | -0.3 vs -0.3 | -0.4 vs -0.3 | -0.3 vs -0.1 | -0.1 vs 0.0 | 0.0 vs 0.0 | -0.3 vs -0.1 |
| Breakout above the 200-day average on heavy volume (≥ 2×) | -0.3 vs -0.1 | -0.6 vs -0.1 | -0.8 vs -0.1 | -1.2 vs -0.1 | -1.3 vs -0.1 | -2.2 vs -0.8 | -2.7 vs -1.1 | -3.4 vs -1.6 |
| Breakdown below the 200-day average on heavy volume (≥ 2×) | -0.1 vs -0.1 | -0.2 vs -0.3 | -0.5 vs -0.5 | -0.8 vs -0.6 | -1.0 vs -0.6 | -1.3 vs -1.0 | -2.3 vs -1.5 | -3.2 vs -3.3 |
| Buyers in control (Chaikin Money Flow, top fifth) | -0.2 vs -0.1 | -0.3 vs -0.1 | -0.4 vs -0.2 | -0.3 vs -0.1 | -0.1 vs +0.2 | +0.1 vs +0.3 | +0.5 vs +0.4 | +1.7 vs +1.5 |
| Quiet buying (price down, On-Balance Volume up, 20 sessions) | -0.1 vs -0.1 | -0.2 vs -0.1 | -0.2 vs -0.1 | -0.3 vs -0.2 | -0.1 vs 0.0 | +0.2 vs +0.5 | +0.1 vs +0.4 | +0.8 vs +1.3 |

CMF top-fifth cut (discovery): 0.083.
