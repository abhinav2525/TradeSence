# 0002 — Does volume tell us anything on the NIFTY 50?

**Date:** 2026-10-03 · Re-run any time: `bun run research:volume` · Spec:
[`docs/superpowers/specs/2026-10-03-volume-study-design.md`](../superpowers/specs/2026-10-03-volume-study-design.md)

## The question

Volume is how many shares changed hands. The idea traders repeat is that **volume
confirms price**: a rise on heavy buying means more than a rise on a quiet day. Before
building volume features into the app (a market-wide page, a Report Card light, Screener
breakouts), we tested the popular volume indicators on our own data. For each one we asked:
**when it fired, what happened next, compared with an ordinary day?**

## The short answer

**None of the 15 tests passed.** No volume signal did reliably better (or worse) than
picking days at random, on the NIFTY 50 since 2020.

| Signal | What happened next | Verdict | Would feed |
|---|---|---|---|
| Panic day (≥ 90% of the day's ₹ traded went into falling stocks) | Index a bit higher than usual 3 months later (+4.4% vs +3.7%), but random days do that often | Maybe | A |
| Stampede day (≥ 90% into rising stocks) | +5.3% vs +3.7% at 3 months; random days match it 1 time in 7 | Maybe | A |
| Panic, then a stampede within 10 sessions | +5.6% vs +3.7%; same story, fewer cases | Maybe | A |
| 10-day up-volume share in its top fifth | Same as an ordinary day | Maybe | A |
| 10-day up-volume share in its bottom fifth | Same as an ordinary day at 3 months | Don't build | A |
| Chaikin Money Flow in its top fifth (buyers in control) | +0.1% better than the index over a month: nothing | Maybe | B |
| Chaikin Money Flow in its bottom fifth (sellers in control) | −0.4% vs the index over a month. The closest call of all 15 (beat 95.2% of random draws; the bar is 97.5%) | Maybe | B |
| Money Flow Index under 20 ("oversold") | Kept lagging for a month (−0.6%), then flipped to +1.7% by 6 months. Inconsistent | Don't build | B |
| Money Flow Index over 80 ("overbought") | Slightly worse than the index, not reliably | Maybe | B |
| Quiet buying (price down, OBV up) | Nothing | Don't build | B, C |
| Quiet selling (price up, OBV down) | Nothing | Don't build | B, C |
| Crossing above the 200-day average on heavy volume (≥ 2×) | +0.1% vs the index over a month: no better than a light-volume crossing | Maybe | C |
| Crossing above on light volume (< 1.5×) | Nothing | Don't build | C |
| Crossing below on heavy volume | −0.4%, not reliably | Don't build | C |
| Crossing below on light volume | Nothing | Don't build | C |

**In one line:** on 50 large, heavily traded Indian stocks, volume didn't add anything
that reliably predicted what came next. "Volume confirms the move" didn't show up in our
data, not even for crossings of the 200-day average.

## How to read the numbers

**The indicators, in everyday terms:**

- **Up-volume share (market-wide).** Each day, of all the rupees traded in the NIFTY 50's
  stocks, what share went into stocks that rose? 75% means three rupees in four were
  traded in rising stocks. We count rupees, not shares, because a ₹100 stock trades far
  more shares than a ₹10,000 one for the same money.
- **Panic day / stampede day.** A day when at least 90% of the money went one way. With
  only 50 stocks these are fairly common: about 3% of days are panic days and 4% stampede
  days (the textbook version, on thousands of US stocks, is much rarer).
- **Chaikin Money Flow (CMF).** Over the last 20 days, did the price tend to close near
  the day's high (buyers in control) or near its low (sellers), weighted by how much
  traded? It runs from −1 to +1. Example: a stock that closes at the top of its range on
  big volume day after day has a strongly positive CMF.
- **Money Flow Index (MFI).** Like the well-known RSI, but weighted by volume: 0 to 100.
  Under 20 is called "oversold", over 80 "overbought".
- **On-Balance Volume (OBV).** A running tally: add the day's volume on an up day,
  subtract it on a down day. "Quiet buying" is the price falling over 20 days while OBV
  rises, as if buyers are absorbing the selling.

**The columns:**

- **Market-wide tests** are judged by the NIFTY 50 index's return over the next 3 months.
- **Per-stock tests** are judged by the stock's return **minus the NIFTY 50's** over the
  next month, so a rising market can't make every signal look good. An ordinary day here
  is about 0%.
- **Beats random.** We picked the same number of random ordinary days, 1,000 times. If
  the signal's typical result beats 97.5% of those random picks (in either direction),
  only about 1 random pick in 20 is as unusual, so it's unlikely to be luck. Nothing
  reached that bar.
- **Same way.** Whether the result points the same way at the other four time spans. A
  real effect usually does; a fluke flips around.
- **"Maybe" is weak.** It only means "pointed one way at most spans and wasn't ruled out".
  With no real effect at all, about 3 tests in 10 would still point the same way at 3 of
  the 4 other spans by chance. So seven "Maybe"s are not seven near-passes; read them as
  "not proven".
- **Months.** Per-stock signals bunch up: in a sell-off, dozens of stocks fire the same
  week. "1,205 episodes in 80 months" means the episodes are spread over 80 different
  calendar months, so the large counts aren't one event repeated.

## Results

Main span: 3 months for the market-wide tests, 1 month for the per-stock tests. The
verdict rules were written down before any result was seen (Method, below).

| Test | Episodes | Months | Median, main span | Any day | Beats random | Same way | Verdict |
|---|---|---|---|---|---|---|---|
| Panic day | 34 | 33 | +4.4% | +3.7% | 68.5% (better) | 3 of 4 | Maybe |
| Stampede day | 40 | 38 | +5.3% | +3.7% | 85.7% (better) | 3 of 4 | Maybe |
| Panic then stampede | 24 | 23 | +5.6% | +3.7% | 85.7% (better) | 3 of 4 | Maybe |
| Up-volume share, top fifth | 38 | 38 | +3.6% | +3.7% | 55.3% (worse) | 3 of 4 | Maybe |
| Up-volume share, bottom fifth | 37 | 36 | +3.7% | +3.7% | 52.5% (worse) | 0 of 4 | Don't build |
| CMF top fifth | 1,205 | 80 | +0.1% | 0.0% | 74.2% (better) | 3 of 4 | Maybe |
| CMF bottom fifth | 1,222 | 81 | −0.4% | 0.0% | 95.2% (worse) | 3 of 4 | Maybe |
| MFI under 20 | 517 | 76 | −0.6% | 0.0% | 94.6% (worse) | 2 of 4 | Don't build |
| MFI over 80 | 905 | 79 | −0.2% | 0.0% | 79.8% (worse) | 3 of 4 | Maybe |
| Quiet buying | 1,469 | 81 | +0.1% | 0.0% | 71.1% (better) | 1 of 4 | Don't build |
| Quiet selling | 1,213 | 81 | +0.3% | 0.0% | 93.9% (better) | 1 of 4 | Don't build |
| Cross above 200-day, heavy volume | 207 | 67 | +0.1% | 0.0% | 60.5% (better) | 3 of 4 | Maybe |
| Cross above 200-day, light volume | 604 | 80 | +0.1% | 0.0% | 68.2% (better) | 1 of 4 | Don't build |
| Cross below 200-day, heavy volume | 157 | 62 | −0.4% | 0.0% | 74.3% (worse) | 2 of 4 | Don't build |
| Cross below 200-day, light volume | 625 | 79 | +0.1% | 0.0% | 67.8% (better) | 2 of 4 | Don't build |

**What stands out:**

- **The market-wide 90% days point the right way but are too weak to separate from
  luck.** After stampede days the index was up a median +5.3% three months later, against
  +3.7% on an ordinary day. That sounds good, but random sets of days do as well about one
  time in seven. With 24–40 episodes, that's not enough evidence.
- **Sellers in control (low CMF) came closest.** Those stocks lagged the index by 0.4%
  over the following month, and pointed the same way at most spans. It's a small effect,
  just short of the bar, and less than trading costs.
- **"Oversold" (MFI under 20) did the opposite of its name for a month:** those stocks
  kept lagging (−0.6%), then turned positive by 6 months (+1.7%). That flip is why it fails
  the "same way" rule.
- **Heavy volume didn't make a crossing more trustworthy at 1 month.** A heavy-volume
  crossing above the 200-day average looks better at 6 months (+3.5% vs +0.7%), but that
  span wasn't the one declared before the study, and picking the best-looking span
  afterwards is how studies fool themselves. Treat it as a question for later, not a
  finding.
- **The "by fifth" table** (appendix) shows the same thing more smoothly: the index did a
  little better after weeks with lots of up-volume (+5.2% vs +3.1% between top and bottom
  fifth), and stocks in the bottom CMF fifth did a little worse. Both are small, and those
  days overlap heavily, so they count for less than they look.

## Caveats (please read)

- **15 tests at once.** By chance alone, about one could have passed the bar. None did,
  which fits "no real effect" well.
- **The "beats random" percentages are, if anything, generous.** Real signals bunch up:
  dozens of stocks fire in the same sell-off week. The random comparison picks days one by
  one, which varies less than bunched-up days do, so it makes signals look a little more
  unusual than they are. That can only push results *towards* passing, so it can't explain
  why nothing passed, but it means a near-miss like 95.2% is an upper bound. It must be
  fixed (draw random *dates*, not random stock-days) before this study is re-run on the
  whole market, where hundreds of stocks can fire on the same day.
- **50 big stocks only.** These are among the most heavily traded companies in India.
  Volume signals may behave differently in smaller, thinner stocks, where one big buyer
  shows up clearly. The whole-market data is stored; testing it needs the averages computed
  for every stock first (TODO, "Broader universes").
- **Daily totals only.** We don't see when in the day the volume traded (no intraday data).
- **One kind of market.** 2020–2026, mostly rising. Per-stock results are measured against
  the index to soften that.
- **Not investment advice.** This is a study of six years of history, to decide what to build.

## TradingView check

To make sure our formulas and our volume data are right, we compared the latest readings
(1 Oct 2026) with TradingView's own indicators, fetched through its connector on 3 Oct 2026:

| Stock | Our CMF(20) | TradingView | Our MFI(14) | TradingView |
|---|---|---|---|---|
| RELIANCE | −0.4653 | −0.46527 | 34.95 | 34.949 |
| INFY | −0.0364 | −0.03638 | 40.48 | 40.478 |

They agree to 4 decimal places (CMF) and 2 (MFI), so the indicators are computed
correctly; the "no edge" result isn't a calculation mistake.

## What this means for projects A, B and C

- **A, market-wide volume page or alarm: don't build an alarm.** No market-wide volume
  signal passed. If you'd still like to *see* up-volume share as context (for example a
  small line on the Advance/Decline page), that's fine as information, but it must not be
  presented as a signal.
- **B, Report Card volume light: don't build.** None of CMF, MFI or OBV passed. Low CMF
  ("sellers in control") was the closest; watch it if the study is re-run on more data.
- **C, Screener volume-confirmed breakouts: don't build as a signal.** Heavy-volume
  crossings were no more reliable than light ones over a month. The Screener's existing
  "Volume vs 20d" column stays as plain information.
- **Worth a later look:** the same tests on the whole NSE market (thinner stocks), and
  delivery % (shares actually taken home, not traded within the day), once those are
  loaded.

## Method

- **Data:** NSE end-of-day bhavcopy, every NIFTY 50 member's open/high/low/close/volume,
  from 2020-01-01 (point-in-time membership, [decision 0005](../decisions/0005-point-in-time-membership.md))
  to 2026-10-01: 1,678 sessions. NIFTY 50 index closes from `index_prices`.
- **Adjustments:** prices divided by the split/bonus/demerger factor and volume multiplied
  by the split/bonus factor (never demergers), through the same loader the nightly averages
  use (`src/indicators/history.ts`); renamed companies keep their full history
  ([0002](../decisions/0002-split-adjusted-averages.md)–[0004](../decisions/0004-demerger-adjustment.md)).
  Each series restarts at a gap in the data.
- **Indicators (textbook settings, never tuned):** CMF 20 days; MFI 14 days; OBV change
  over 20 days; up-volume share by ₹ turnover, smoothed over 10 days; panic ≤ 10%, stampede
  ≥ 90%; heavy volume ≥ 2× the 20-day normal, light < 1.5×. Fifth cut points come from all
  days, not chosen.
- **Episodes:** qualifying days within 10 sessions of each other count as one (per stock
  for per-stock tests), the same rule as research 0001. Per-stock signals count only on days
  the stock was in the index.
- **Returns:** 5, 10, 21, 63 and 126 sessions later; per-stock returns minus the NIFTY 50's
  over the same sessions. A return past the last session or across a gap is left out.
- **Verdict rules (fixed before results):** Build = at least 8 (market) / 30 (per stock)
  episodes, beats 97.5% of 1,000 seeded random draws in its direction at the main span
  (3 months market, 1 month per stock), and on the same side of an ordinary day at 3 or more
  of the other 4 spans. Maybe = same side at 3 or more but not Build. Otherwise Don't build.
- **Code:** `src/research/volume.ts` (tested), `volume-data.ts`, `cli-volume.ts`.

## Appendix: full results (generated)

## Summary

Market-wide tests: NIFTY 50 return, main span 3 months. Per-stock tests: the stock's return minus the NIFTY 50's, main span 1 month. 1678 sessions, 2020-01-01 to 2026-10-01.

| Test | Feeds | Episodes | Months | Median, main span | Any day | Beats random | Same way | Verdict |
|---|---|---|---|---|---|---|---|---|
| Panic day (≥ 90% of value into falling stocks) | A | 34 | 33 | +4.4% | +3.7% | 68.5% (better) | 3 of 4 | **Maybe** |
| Stampede day (≥ 90% into rising stocks) | A | 40 | 38 | +5.3% | +3.7% | 85.7% (better) | 3 of 4 | **Maybe** |
| Panic then stampede within 10 sessions | A | 24 | 23 | +5.6% | +3.7% | 85.7% (better) | 3 of 4 | **Maybe** |
| 10-day up-volume share in its top fifth | A | 38 | 38 | +3.6% | +3.7% | 55.3% (worse) | 3 of 4 | **Maybe** |
| 10-day up-volume share in its bottom fifth | A | 37 | 36 | +3.7% | +3.7% | 52.5% (worse) | 0 of 4 | **Don't build** |
| CMF(20) in its top fifth | B | 1205 | 80 | +0.1% | 0.0% | 74.2% (better) | 3 of 4 | **Maybe** |
| CMF(20) in its bottom fifth | B | 1222 | 81 | -0.4% | 0.0% | 95.2% (worse) | 3 of 4 | **Maybe** |
| MFI under 20 (oversold) | B | 517 | 76 | -0.6% | 0.0% | 94.6% (worse) | 2 of 4 | **Don't build** |
| MFI over 80 (overbought) | B | 905 | 79 | -0.2% | 0.0% | 79.8% (worse) | 3 of 4 | **Maybe** |
| Quiet buying (price down, OBV up over 20 sessions) | B, C | 1469 | 81 | +0.1% | 0.0% | 71.1% (better) | 1 of 4 | **Don't build** |
| Quiet selling (price up, OBV down over 20 sessions) | B, C | 1213 | 81 | +0.3% | 0.0% | 93.9% (better) | 1 of 4 | **Don't build** |
| Cross above the 200-day SMA on heavy volume (≥ 2×) | C | 207 | 67 | +0.1% | 0.0% | 60.5% (better) | 3 of 4 | **Maybe** |
| Cross above the 200-day SMA on light volume (< 1.5×) | C | 604 | 80 | +0.1% | 0.0% | 68.2% (better) | 1 of 4 | **Don't build** |
| Cross below the 200-day SMA on heavy volume | C | 157 | 62 | -0.4% | 0.0% | 74.3% (worse) | 2 of 4 | **Don't build** |
| Cross below the 200-day SMA on light volume | C | 625 | 79 | +0.1% | 0.0% | 67.8% (better) | 2 of 4 | **Don't build** |

Rules (fixed before results): Build = at least 8 (market) / 30 (per stock) episodes, beats 97.5% of 1,000 random draws in its direction at the main span, and on the same side of an ordinary day at 3 or more of the other 4 spans. Maybe = same side at 3 or more but not Build.

## Every span

**Panic day (≥ 90% of value into falling stocks)**: 34 episodes in 33 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | +0.7% | +0.6% | +2.2% | +4.4% | +6.6% |
| Any day | +0.3% | +0.5% | +1.1% | +3.7% | +7.6% |

**Stampede day (≥ 90% into rising stocks)**: 40 episodes in 38 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | +0.8% | +1.2% | +1.4% | +5.3% | +6.9% |
| Any day | +0.3% | +0.5% | +1.1% | +3.7% | +7.6% |

**Panic then stampede within 10 sessions**: 24 episodes in 23 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | +0.9% | +1.7% | +1.8% | +5.6% | +6.9% |
| Any day | +0.3% | +0.5% | +1.1% | +3.7% | +7.6% |

**10-day up-volume share in its top fifth**: 38 episodes in 38 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | +0.4% | -0.1% | +0.6% | +3.6% | +5.3% |
| Any day | +0.3% | +0.5% | +1.1% | +3.7% | +7.6% |

**10-day up-volume share in its bottom fifth**: 37 episodes in 36 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | +0.4% | +0.8% | -0.8% | +3.7% | +2.7% |
| Any day | +0.3% | +0.5% | +1.1% | +3.7% | +7.6% |

**CMF(20) in its top fifth**: 1205 episodes in 80 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | +0.2% | +0.1% | +0.1% | 0.0% | +1.0% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**CMF(20) in its bottom fifth**: 1222 episodes in 81 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | 0.0% | -0.2% | -0.4% | -0.2% | 0.0% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**MFI under 20 (oversold)**: 517 episodes in 76 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | 0.0% | -0.4% | -0.6% | -0.2% | +1.7% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**MFI over 80 (overbought)**: 905 episodes in 79 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | -0.1% | +0.1% | -0.2% | -1.2% | +0.6% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**Quiet buying (price down, OBV up over 20 sessions)**: 1469 episodes in 81 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | -0.1% | -0.1% | +0.1% | -0.1% | +0.2% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**Quiet selling (price up, OBV down over 20 sessions)**: 1213 episodes in 81 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | -0.2% | 0.0% | +0.3% | -0.4% | +0.3% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**Cross above the 200-day SMA on heavy volume (≥ 2×)**: 207 episodes in 67 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | -0.3% | 0.0% | +0.1% | +0.5% | +3.5% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**Cross above the 200-day SMA on light volume (< 1.5×)**: 604 episodes in 80 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | -0.2% | -0.2% | +0.1% | +0.6% | +0.6% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**Cross below the 200-day SMA on heavy volume**: 157 episodes in 62 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | -0.3% | 0.0% | -0.4% | -0.4% | +1.2% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

**Cross below the 200-day SMA on light volume**: 625 episodes in 79 distinct months.

| | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Median after the signal | -0.1% | -0.1% | +0.1% | +0.5% | +1.3% |
| Any day | -0.1% | -0.1% | 0.0% | +0.1% | +0.7% |

## By fifth (every day counted, so neighbouring days overlap)

| Fifth | 10-day up-volume share → NIFTY 50, 3 months | CMF(20) → excess return, 1 month |
|---|---|---|
| Bottom | +3.1% (311 days) | -0.2% (16402 days) |
| 2nd | +2.4% (321 days) | +0.1% (16563 days) |
| Middle | +3.7% (313 days) | +0.2% (16604 days) |
| 4th | +3.7% (327 days) | 0.0% (16627 days) |
| Top | +5.2% (334 days) | 0.0% (16633 days) |

Fifth cut points: 10-day up-volume share 46.3 / 51.3 / 55.6 / 60.4%; CMF -0.141 / -0.051 / 0.028 / 0.117.
