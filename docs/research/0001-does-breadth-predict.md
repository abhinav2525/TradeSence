# 0001 — Does breadth predict the NIFTY 50?

**Date:** 2026-10-02 · **TODO item 2** · Re-run any time: `bun run research:forward-returns`

**Refreshed 2026-10-03:** 8 weekend sessions ([decision 0007](../decisions/0007-weekend-trading-sessions.md)) were loaded after this was first written, which moved the early-2025 episode from 28 Feb to 24 Feb 2025 and trimmed its returns. The conclusion is unchanged. See [decision 0017](../decisions/0017-signals-washout.md). The Signals page (`/signals`) shows these numbers live; it reports medians, this note averages.

## The question

When few NIFTY 50 stocks are above their moving average (weak breadth), or almost all
of them are (strong breadth), what did the **NIFTY 50 index** do over the next
**1, 3 and 6 months**? The answer decides which signals are worth building (TODO item 4).

## The short answer

| Signal | What happened afterwards | Worth building? |
|---|---|---|
| **200-SMA breadth below 20%** (very weak) | The index was higher 6 months later **every time** (5 of 5 episodes), by about **+13.6%** on average, against a normal +7.7%. But the first month could still be painful: −14% after the first COVID warning in March 2020 | **Yes**: the strongest result, but based on only 3 real sell-offs (see caveats) |
| 200-SMA breadth 20–40% (weak) | Also better than normal: +14% over 6 months (by days) | Maybe, as a softer "weak zone" |
| **Breadth above 80%** (very strong) | **No edge**: after 8 episodes the index was up 4 times and down 4 times over 6 months (average −0.4%). The three most recent were followed by falls | **No**, not as a buy or a sell signal |
| 50-SMA breadth extremes | Close to normal returns, and mixed | **No**: too noisy |
| 200-EMA breadth | Very similar to the 200 SMA, with fewer episodes | Use the 200 SMA |

**In one line:** very weak 200-day breadth has been a good *patience* signal: things
were better 3–6 months later. It has **not** been a timing signal for the exact bottom,
and very strong breadth told us nothing.

## How to read the numbers (and why the episode tables matter)

Two ways of counting, and the difference matters:

- **By day.** Every day in a bucket counts. That gives big numbers, but neighbouring
  days are almost the same observation: March 2020 alone supplies dozens of "very weak"
  days. The 200-SMA "below 20%" bucket shows **+28% over 6 months, 100% up**. That is
  real, but it is mostly *one* event (COVID) counted many times.
- **By episode.** Days within 10 sessions of each other count as one event. This is the
  honest number. For the 200-SMA "below 20%" bucket:

| Episode started | Breadth | 1 month later | 3 months | 6 months |
|---|---|---|---|---|
| 2020-03-09 (COVID) | 18% | −13.9% | −6.1% | +9.5% |
| 2022-05-12 | 18% | +2.5% | +10.9% | +15.9% |
| 2022-06-16 | 18% | +4.5% | +14.1% | +19.9% |
| 2025-02-24 | 18% | +4.6% | +9.6% | +9.2% |
| 2025-04-07 | 18% | +12.5% | +15.0% | +13.6% |
| **Average of the 5** | | **+2.0%** | **+8.7%** | **+13.6%** |
| *Normal (all days)* | | *+1.0%* | *+3.4%* | *+7.7%* |
| **2026-10-01 (today)** | **16%** | not yet | not yet | not yet |

**Today (2026-10-01) is the start of a new episode.** Only 8 of 50 stocks are above
their 200-day average. In the past, every such episode was followed by a higher index
6 months later. With only 5 past cases (really 3 sell-offs: COVID 2020, mid-2022,
early 2025), that's encouraging history, **not a guarantee**.

## Caveats (please read)

- **Small sample.** 2020 to today has 5 completed "very weak" episodes, and they come
  from just 3 distinct sell-offs. One differently behaved crash would change the
  averages a lot.
- **One kind of market.** The NIFTY 50 rose about 84% over the period, so "it went up
  later" partly reflects a rising market. That's why every result is compared with
  the normal (all-days) return.
- **The first month can hurt.** In March 2020 the signal came early, and the index fell
  another 14% first. Weak breadth says "it's washed out", not "this is the low".
- **Price index only.** No dividends, costs or taxes.
- **Not investment advice.** This is a study of six years of history, to decide what to
  build.

## Method

- Breadth: % of NIFTY 50 members (real membership on each day, [0005](../decisions/0005-point-in-time-membership.md))
  above each average, from the same query the dashboard uses. Averages are adjusted for
  splits, bonuses and demergers, and joined across renames
  ([0002](../decisions/0002-split-adjusted-averages.md)–[0004](../decisions/0004-demerger-adjustment.md)).
- Index: NIFTY 50 daily close from NSE's `ind_close_all` files (month-end closes checked
  against TradingView: 7 of 7 exact).
- Forward return: index close 21 / 63 / 126 sessions later ÷ close on the day.
- Episodes: start on the first qualifying day; qualifying days within 10 sessions of the
  last one are the same episode.
- Code: `src/research/forward-returns.ts` (tested) and `cli-forward-returns.ts`.

## What this means for TODO item 4 (signal detectors)

1. **Build: "breadth washout" (200-SMA breadth below 20%).** Show it clearly on the
   dashboard, with this history next to it. That's the honest framing: "the last 5 times,
   the index was higher 6 months later; the first month was mixed."
2. **Don't build an "overbought" signal from breadth above 80%.** The history shows no edge.
3. **Test the Zweig breadth thrust before building it** (from under 40% to above 61.5%
   within 10 days). It's a different question ("is a recovery starting?") and needs its
   own study, which this code can do cheaply.
4. **The divergence signal** (index at a new high while breadth falls) still needs
   testing. The index data it needs now exists.

## Appendix: full results (generated)

## 200-day SMA

1678 sessions, 2020-01-01 to 2026-10-01. Each cell: average NIFTY 50 return · share of times it was up.

| Breadth | Days | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| <20% | 69 | +5.8% · 83.8% up | +18.5% · 97.1% up | +27.6% · 100.0% up |
| 20–40% | 211 | +2.3% · 67.7% up | +6.6% · 88.1% up | +13.9% · 95.8% up |
| 40–60% | 367 | -0.9% · 55.7% up | -0.9% · 50.8% up | +5.7% · 73.5% up |
| 60–80% | 451 | +0.4% · 55.0% up | +1.9% · 58.8% up | +3.1% · 58.3% up |
| ≥80% | 580 | +1.5% · 66.4% up | +4.1% · 71.7% up | +7.7% · 73.6% up |
| **All days (baseline)** | 1678 | +1.0% · 61.9% up | +3.4% · 67.1% up | +7.7% · 73.0% up |

**Episodes below 20%** (days within 10 sessions of each other count as one): 6

| Started | Breadth | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| 2020-03-09 | 18% | -13.9% | -6.1% | +9.5% |
| 2022-05-12 | 18% | +2.5% | +10.9% | +15.9% |
| 2022-06-16 | 18% | +4.5% | +14.1% | +19.9% |
| 2025-02-24 | 18% | +4.6% | +9.6% | +9.2% |
| 2025-04-07 | 18% | +12.5% | +15.0% | +13.6% |
| 2026-10-01 | 16% | not yet | not yet | not yet |

**Episodes above 80%** (days within 10 sessions of each other count as one): 8

| Started | Breadth | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| 2020-11-10 | 80% | +6.7% | +19.6% | +19.6% |
| 2022-01-13 | 82% | -7.8% | -7.1% | -10.8% |
| 2022-11-24 | 82% | -3.7% | -5.0% | +0.8% |
| 2023-05-26 | 80% | +1.0% | +4.1% | +7.5% |
| 2024-05-23 | 80% | +2.5% | +8.1% | +5.5% |
| 2025-10-16 | 80% | +1.3% | +0.0% | -5.5% |
| 2025-11-28 | 80% | -1.0% | -3.9% | -10.8% |
| 2026-01-06 | 80% | -2.0% | -8.1% | -8.1% |

## 50-day SMA

1678 sessions, 2020-01-01 to 2026-10-01. Each cell: average NIFTY 50 return · share of times it was up.

| Breadth | Days | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| <20% | 119 | +2.4% · 78.3% up | +7.6% · 69.8% up | +13.2% · 80.4% up |
| 20–40% | 288 | +0.1% · 52.9% up | +3.2% · 64.5% up | +8.0% · 80.9% up |
| 40–60% | 453 | +0.8% · 59.4% up | +2.2% · 60.5% up | +6.0% · 65.1% up |
| 60–80% | 438 | +0.6% · 55.5% up | +2.4% · 63.7% up | +5.7% · 67.7% up |
| ≥80% | 380 | +1.9% · 74.2% up | +4.9% · 79.5% up | +9.9% · 79.2% up |
| **All days (baseline)** | 1678 | +1.0% · 61.9% up | +3.4% · 67.1% up | +7.7% · 73.0% up |

**Episodes below 20%** (days within 10 sessions of each other count as one): 12

| Started | Breadth | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| 2020-02-28 | 10% | -23.2% | -9.5% | +3.0% |
| 2021-11-26 | 10% | +0.4% | -4.6% | -2.6% |
| 2022-02-24 | 6% | +6.6% | +2.1% | +9.3% |
| 2022-05-09 | 18% | +0.7% | +6.6% | +11.4% |
| 2022-06-15 | 18% | +1.6% | +13.9% | +16.4% |
| 2023-02-27 | 18% | -1.8% | +6.6% | +11.7% |
| 2024-10-23 | 18% | -0.9% | -5.0% | -0.4% |
| 2024-12-20 | 18% | -2.4% | -1.0% | +7.0% |
| 2025-01-27 | 18% | -1.2% | +6.6% | +8.9% |
| 2025-02-28 | 16% | +5.5% | +11.9% | +11.8% |
| 2026-03-13 | 16% | +5.2% | +4.4% | +0.5% |
| 2026-09-11 | 16% | not yet | not yet | not yet |

**Episodes above 80%** (days within 10 sessions of each other count as one): 18

| Started | Breadth | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| 2020-06-01 | 90% | +4.8% | +17.6% | +30.9% |
| 2020-11-09 | 80% | +8.6% | +21.3% | +19.8% |
| 2021-05-26 | 82% | +3.2% | +8.7% | +11.3% |
| 2021-09-06 | 80% | +1.5% | +0.5% | -5.9% |
| 2022-01-13 | 86% | -7.8% | -7.1% | -10.8% |
| 2022-04-04 | 82% | -9.1% | -12.4% | -4.0% |
| 2022-07-21 | 80% | +5.9% | +6.8% | +9.1% |
| 2022-11-29 | 82% | -2.7% | -6.6% | -0.5% |
| 2023-04-28 | 84% | +3.1% | +8.8% | +5.6% |
| 2023-09-11 | 80% | -1.0% | +4.7% | +10.0% |
| 2023-11-28 | 82% | +9.5% | +11.6% | +13.3% |
| 2024-06-07 | 80% | +4.9% | +7.1% | +5.7% |
| 2024-09-24 | 82% | -5.9% | -8.4% | -9.5% |
| 2025-04-23 | 84% | +2.2% | +3.0% | +6.4% |
| 2025-06-27 | 80% | -3.7% | -3.8% | +1.2% |
| 2025-09-18 | 80% | +1.7% | +2.1% | -11.4% |
| 2025-10-17 | 80% | +1.3% | -1.9% | -7.0% |
| 2026-05-25 | 80% | -0.0% | +0.8% | not yet |

## 200-day EMA

1678 sessions, 2020-01-01 to 2026-10-01. Each cell: average NIFTY 50 return · share of times it was up.

| Breadth | Days | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| <20% | 59 | +6.0% · 84.5% up | +19.6% · 96.6% up | +29.7% · 100.0% up |
| 20–40% | 173 | +1.8% · 66.7% up | +6.9% · 90.6% up | +12.6% · 89.9% up |
| 40–60% | 358 | -0.1% · 57.7% up | +1.4% · 64.4% up | +8.6% · 84.6% up |
| 60–80% | 480 | +0.3% · 55.4% up | +0.8% · 51.4% up | +3.1% · 57.2% up |
| ≥80% | 608 | +1.5% · 66.0% up | +4.1% · 71.9% up | +7.5% · 73.5% up |
| **All days (baseline)** | 1678 | +1.0% · 61.9% up | +3.4% · 67.1% up | +7.7% · 73.0% up |

**Episodes below 20%** (days within 10 sessions of each other count as one): 5

| Started | Breadth | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| 2020-03-09 | 16% | -13.9% | -6.1% | +9.5% |
| 2022-05-12 | 16% | +2.5% | +10.9% | +15.9% |
| 2022-06-16 | 18% | +4.5% | +14.1% | +19.9% |
| 2025-02-28 | 18% | +5.5% | +11.9% | +11.8% |
| 2026-10-01 | 14% | not yet | not yet | not yet |

**Episodes above 80%** (days within 10 sessions of each other count as one): 9

| Started | Breadth | 1 month | 3 months | 6 months |
|---|---|---|---|---|
| 2020-11-10 | 82% | +6.7% | +19.6% | +19.6% |
| 2022-01-04 | 80% | -1.4% | +0.0% | -9.4% |
| 2022-08-12 | 80% | +1.7% | +4.0% | +1.3% |
| 2022-09-13 | 80% | -5.8% | +3.3% | -6.1% |
| 2022-11-11 | 80% | +0.8% | -2.5% | -0.9% |
| 2023-05-23 | 82% | +2.8% | +5.7% | +8.0% |
| 2023-11-15 | 84% | +9.1% | +11.4% | +14.5% |
| 2024-05-23 | 80% | +2.5% | +8.1% | +5.5% |
| 2025-10-17 | 80% | +1.3% | -1.9% | -7.0% |
