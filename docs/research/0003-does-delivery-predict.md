# 0003 — Does delivery % tell us anything?

**Date:** 2026-10-04 · Re-run any time: `bun run research:delivery` (about 2 minutes) · Spec:
[`docs/superpowers/specs/2026-10-04-delivery-study-design.md`](../superpowers/specs/2026-10-04-delivery-study-design.md)

## The question

When 100 shares of a stock trade in a day, some buyers **keep** their shares ("take
delivery") and the rest are bought and sold again the same day. Delivery % is the share
kept: 60 kept out of 100 traded is 60%. A popular idea among Indian traders is that
**high delivery means real buyers**, especially on a day the price rises
("accumulation"). Before showing delivery % anywhere in the app, we tested eight
delivery signals on our own data and asked: **after the signal, did that stock do better
or worse than other stocks on the same days?**

## The short answer

**Nothing passed.** No delivery signal gave an edge big enough to be worth trading
(the bar was 0.5 percentage points a month, roughly what buying and selling costs).

Four signals showed a **real but small** effect: they beat the luck bar on 2016–2022, and
episodes starting from 2023 onward showed the same thing again. All four were too small
to trade at one month:

| Signal | Next month, vs other stocks on the same days | Real? | Big enough? | Verdict |
|---|---|---|---|---|
| Long-term holders' stock (delivery in the top fifth of all stocks that day) | Ahead by 0.3 points; by 1.1 at 3 months | Yes, both periods | No | Maybe |
| Traders' stock (bottom fifth) | Behind by 0.4 points; by 1.5 at 3 months | Yes, both periods | No (0.37 < 0.5) | Maybe |
| Delivery spike (2× usual) **with the price up** | **Behind** by 0.3 points: the opposite of the popular reading | Yes, both periods | No | Maybe |
| Delivery well below its own normal | Behind by 0.3 points | Yes, both periods | No | Maybe |
| Accumulation (high delivery, price up) | Ahead by 0.1 points; short of the luck bar on 2016–22 (94.3%) | Not proven | No | Maybe |
| Delivery well above its own normal | Behind by 0.1 points | No | No | Maybe |
| Distribution (high delivery, price down) | Nothing | No | No | Maybe |
| Delivery spike, price down | Nothing | No | No | Don't build |

**"Maybe" here is weak.** It only means the result pointed the same way at most time
spans and wasn't ruled out; a difference of a hundredth of a point counts as "pointing".
Read the "Real?" and "Big enough?" columns, not the verdict, to see what was found.

**In one line:** delivery % carries a faint, real signal, mostly about *what kind of
stock* it is (held vs traded), not about *what happens next week*. The famous
"high delivery + price up = smart money buying" didn't show an edge worth trading, and a
delivery spike on an up day was, if anything, slightly bad news.

## How to read the numbers

- **Delivery %** = shares delivered ÷ shares traded, from NSE's daily delivery file
  (decision 0021). Checked against NSE's own printed %: INFY 51.96% and RELIANCE 61.24% on
  1 Oct 2026, 20MICRONS 86.13% on 28 Sep 2016, all equal.
- **"Its own normal":** some stocks always run at 70% delivery, others at 20%. So signals
  1–6 compare a stock's delivery today with *its own* average over the previous 20
  sessions. "Well above" is the top fifth of that difference, about **+9 points or more**;
  "well below" about **−9 points or less**.
- **Signals 7–8** instead compare stocks with each other: each day, which stocks had the
  highest (or lowest) delivery over the last 20 sessions.
- **Which stocks:** every NSE company trading at least ₹1 crore a day (median of the last
  20 sessions), including companies later delisted: 2,949 companies loaded, of which only
  the days trading ₹1 crore+ count (about 2.3 million stock-days). **ETFs are left out** (554 fund symbols: gold, silver, liquid and index
  funds). They trade like shares, but their prices follow gold or interest rates, and
  their buyers nearly always hold.
- **No peeking:** NSE publishes delivery figures in the evening, so every return starts
  from the **next** day's close.
- **Same days, other stocks:** each signal is compared with random other companies *on the
  same dates*, drawn 1,000 times. So a rising market can't flatter a signal, and a
  sell-off week where hundreds of stocks fire at once can't either (decision 0022).
- **Beats random:** the share of those 1,000 draws the signal beat. 97.5% or more (or 2.5%
  or less, for "worse") means only about 1 random pick in 20 is as unusual.
- **Decide, then confirm:** verdicts were judged on episodes starting 2016–2022. Anything
  real also had to show again in episodes starting 2023 or later (beat ≥ 95%, or ≤ 5% for
  "worse"). Late-2022 episodes' returns run into 2023, so the split is by start date.
- **Effect** is the signal's median minus the typical same-day company's, in percentage
  points over a month.

## Results

Main span: 1 month. Rules fixed before any result was seen, except corrections explained
under Method (each made the results less flattering or simply more correct, never chosen
for a nicer answer).

| Signal | Episodes | Median | Typical same-day company | Beats random | Same way | Effect | 2023– beats | Verdict |
|---|---|---|---|---|---|---|---|---|
| Delivery well above its own normal | 30553 | -0.1% | 0.0% | 19.2% (worse) | 3 of 4 | -0.07 pts | 3.9% (worse) | Maybe |
| Delivery well below its own normal | 30523 | -0.3% | 0.0% | 0.0% (worse) | 4 of 4 | -0.28 pts | 3.0% (worse) | Maybe |
| Accumulation (high delivery, price up) | 33202 | +0.2% | +0.1% | 94.3% (better) | 4 of 4 | +0.10 pts | 99.0% (better) | Maybe |
| Distribution (high delivery, price down) | 35544 | +0.1% | +0.1% | 83.5% (better) | 4 of 4 | +0.05 pts | 48.8% (worse) | Maybe |
| Delivery spike (≥ 2×), price up | 32353 | 0.0% | +0.3% | 0.0% (worse) | 3 of 4 | -0.30 pts | 0.0% (worse) | Maybe |
| Delivery spike (≥ 2×), price down | 23982 | +0.2% | +0.2% | 57.1% (better) | 2 of 4 | +0.02 pts | 83.8% (better) | Don't build |
| Long-term holders' stock (top fifth of delivery that day) | 7762 | +0.3% | 0.0% | 98.4% (better) | 4 of 4 | +0.27 pts | 98.6% (better) | Maybe |
| Traders' stock (bottom fifth of delivery that day) | 3856 | -0.6% | -0.2% | 1.5% (worse) | 4 of 4 | -0.37 pts | 0.0% (worse) | Maybe |

**What stands out:**

- **The popular reading of a delivery spike is backwards, slightly.** A company whose
  delivered shares doubled on a day the price rose lagged other companies by 0.3 points
  over the next month, and the same showed in 2023–. The first two weeks are the weakest
  (−0.4 vs −0.1, −0.4 vs 0.0). One plausible reading: the spike comes after the move, and
  part of it gives back. Small either way: not a reason to sell.
- **What kind of company it is matters more than today's reading.** Companies whose
  buyers mostly hold (top fifth for delivery) beat the typical company by 0.3 points at one
  month, 1.1 at three months and 2.2 at six. Companies mostly traded in and out (bottom
  fifth) lagged by 0.4, 1.5 and 1.3. Only the one-month span was declared before the study,
  so the three- and six-month gaps are leads for a future study, not findings.
- **"Accumulation" is the closest thing to the popular idea, and it's tiny.** High
  delivery on an up day did 0.1 points better at a month: beat 94.3% of random draws on
  2016–22 (short of 97.5%) and 99.0% from 2023. Possibly real, certainly too small to trade.
- **Two tables look like they disagree, but measure different things.** In the appendix's
  "by fifth" table, the top fifth of "delivery against its own normal" is +0.26 points,
  while signal 1 (the same top fifth) is −0.07. The table counts **every** such day,
  measured against that day's median company. Signal 1 counts only the **first day of
  each episode**, against random same-day companies.
- **Big stocks look different, but the sample is small.** Among NIFTY 50 members (from
  2020, no verdicts) most signals did a little better than the typical same-day company,
  e.g. long-term holders' stocks +1.4% vs −0.1%. With a few hundred to two thousand
  episodes over six years and no separate confirmation, treat it as colour only.

## Caveats (please read)

- **8 tests at once.** By chance, about one could pass the luck bar on 2016–22. The 2023–
  check is what guards against that, and the four real effects passed it too.
- **Liquid companies only** (≥ ₹1 crore a day). Very small stocks, where one buyer moves
  the price, are left out on purpose.
- **Costs.** The 0.5-point bar is a rough round trip (taxes, charges, slippage on
  mid-sized stocks). For a big stock at a discount broker it is lower, for a small one
  higher; no effect here would survive either way at one month.
- **Five days are left out**, when NSE's delivery file covered different trades from the
  price file (decision 0021).
- **The 2023– period is 3¾ years** of a mostly rising market. An effect that held there
  could still fade in a long bear market.
- **Sector and size aren't held constant.** If delivery is mostly a stand-in for "large,
  steady company", that is what these effects measure.
- **The ETF list** comes from NSE's ISIN codes (fund units start "INF") in one price file
  per month since 2016, plus NSE's current ETF list. A fund listed and delisted within one
  month could be missed; that's negligible.

## Method

As specified in the spec, with three corrections made after the first run, each found by
a check, not by looking for a better answer:

1. **The "typical same-day stock" was first measured wrongly.** The spec defined it as
   "the median of each signal day's median stock". On the first run that contradicted the
   luck check, the measure the verdicts rest on: Accumulation beat 95.4% of random
   same-day draws yet came out 0.20 points *below* that baseline, and all eight signals,
   even opposites like "delivery high" and "delivery low", came out below it. The reason:
   when some days swing far more than others, the median of the day medians isn't what a
   random stock from those days typically does. Example with two signal days: day A's
   stocks returned −10, −9, 100, 101, 102 (median 100); day B's returned 0, 1, 2, 3, 4
   (median 2). The median of the two medians is 51, but a random stock from those days is
   typically around 2. The baseline now uses the luck check's own random same-day draws.
   The verdict rules were not changed. This **removed two "Build" verdicts** the first run
   had given (delivery well below normal at −0.60 points, spike with price up at −0.55);
   the first run's table is at the end of this file.
2. **ETFs were counted as companies** (found by the independent review). Gold, silver and
   liquid funds sit permanently in the "long-term holders" group for reasons unrelated to
   delivery. They are now left out (`src/research/fund-symbols.txt`, written by
   `bun run research:fund-symbols`). This changed which effects pass the luck bar (with
   ETFs in, traders' stock fell just short at 97.2%; without, 98.5%), not any verdict.
3. **Five renamed companies were dropped** (also found by the review): companies whose new
   symbol trades only in the stricter trade-for-trade segment (BE). Such companies are
   often in trouble, so dropping them flattered the results slightly. They're back.

Everything else is as specified: eligible company-days as above; episodes merge firing
days within 10 sessions per company (dated by their first day); returns from the next
close at 1 week, 2 weeks, 1, 3 and 6 months, never across a gap in the data; 1,000 seeded
random draws; the "fifths" for signals 1–4 cut from 2016–22 only. The run also checks
that its two passes over the data stayed in step, and refuses to report if not (for
example, if the nightly job changed the data mid-run).

Code: `src/research/delivery.ts` (tested in `tests/delivery-research.test.ts`, including a
check that random "signals" pass the bar about 5% of the time), `delivery-data.ts`,
`funds.ts`, `cli-delivery.ts`, `cli-fund-symbols.ts`. Company histories load through
`loadAdjustedHistory`, so renamed companies keep their full history.

## What this means for the app

- **Don't build** a delivery buy/sell signal: no accumulation alert, no "delivery spike"
  screener filter. None would beat costs, and the spike one points the wrong way.
- **Maybe later, as information only:** a company's typical delivery level ("mostly
  held" vs "mostly traded") on the Report Card, explained in the glossary and shown like
  the Screener's volume column: context, never a light that says good or bad. That's the
  owner's call, ideally after a 3-month study (the gaps grew with time).
- **Follow-ups this enables:** research 0002 (volume) can be re-run on the whole market
  with the same-day comparison (decision 0022) and the ETF list.

## Appendix: full results (generated)

### Results (main span: 1 month; discovery 2016–2022, hold-out 2023–)

| Signal | Episodes | Months | Median | Same days, all stocks | Beats random | Same way | Effect | Hold-out episodes | Hold-out median | Hold-out baseline | Hold-out beats | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Delivery well above its own normal | 30553 | 75 | -0.1% | 0.0% | 19.2% (worse) | 3 of 4 | -0.07 pts | 30752 | -0.2% | -0.1% | 3.9% (worse) | Maybe |
| Delivery well below its own normal | 30523 | 75 | -0.3% | 0.0% | 0.0% (worse) | 4 of 4 | -0.28 pts | 31505 | +0.1% | +0.2% | 3.0% (worse) | Maybe |
| Accumulation (high delivery, price up) | 33202 | 75 | +0.2% | +0.1% | 94.3% (better) | 4 of 4 | +0.10 pts | 31841 | +0.3% | +0.2% | 99.0% (better) | Maybe |
| Distribution (high delivery, price down) | 35544 | 75 | +0.1% | +0.1% | 83.5% (better) | 4 of 4 | +0.05 pts | 34711 | -0.1% | -0.1% | 48.8% (worse) | Maybe |
| Delivery spike (≥ 2×), price up | 32353 | 75 | 0.0% | +0.3% | 0.0% (worse) | 3 of 4 | -0.30 pts | 31648 | 0.0% | +0.2% | 0.0% (worse) | Maybe |
| Delivery spike (≥ 2×), price down | 23982 | 75 | +0.2% | +0.2% | 57.1% (better) | 2 of 4 | +0.02 pts | 23851 | +0.7% | +0.6% | 83.8% (better) | Don't build |
| Long-term holders' stock (top fifth of delivery that day) | 7762 | 75 | +0.3% | 0.0% | 98.4% (better) | 4 of 4 | +0.27 pts | 7370 | +0.4% | +0.1% | 98.6% (better) | Maybe |
| Traders' stock (bottom fifth of delivery that day) | 3856 | 75 | -0.6% | -0.2% | 1.5% (worse) | 4 of 4 | -0.37 pts | 5234 | -0.5% | +0.1% | 0.0% (worse) | Maybe |

### Every span (discovery medians vs same-days baseline)

| Signal | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Delivery well above its own normal | -0.2 vs -0.2 | -0.3 vs -0.2 | -0.1 vs 0.0 | +0.3 vs +0.4 | +0.8 vs +1.3 |
| Delivery well below its own normal | -0.3 vs -0.1 | -0.3 vs 0.0 | -0.3 vs 0.0 | 0.0 vs +0.4 | +1.0 vs +1.5 |
| Accumulation (high delivery, price up) | -0.1 vs -0.1 | 0.0 vs -0.1 | +0.2 vs +0.1 | +0.8 vs +0.6 | +1.6 vs +1.2 |
| Distribution (high delivery, price down) | -0.1 vs -0.2 | -0.1 vs -0.2 | +0.1 vs +0.1 | +0.5 vs +0.4 | +1.3 vs +1.3 |
| Delivery spike (≥ 2×), price up | -0.4 vs -0.1 | -0.4 vs 0.0 | 0.0 vs +0.3 | +0.3 vs +0.4 | +1.3 vs +1.3 |
| Delivery spike (≥ 2×), price down | -0.3 vs -0.2 | -0.2 vs -0.1 | +0.2 vs +0.2 | +0.5 vs +0.2 | +1.0 vs +0.8 |
| Long-term holders' stock (top fifth of delivery that day) | -0.1 vs -0.2 | 0.0 vs -0.2 | +0.3 vs 0.0 | +1.5 vs +0.4 | +4.0 vs +1.8 |
| Traders' stock (bottom fifth of delivery that day) | -0.4 vs -0.2 | -0.6 vs -0.2 | -0.6 vs -0.2 | -1.5 vs 0.0 | -0.4 vs +0.9 |

### Delivery against its own normal, by fifth (discovery, 1 month, return minus that day's median stock)

| Fifth of rel | Stock-days | Median vs the day's typical stock |
|---|---|---|
| Bottom | 2,28,006 | -0.12 pts |
| Second | 2,28,605 | -0.09 pts |
| Middle | 2,28,777 | -0.07 pts |
| Fourth | 2,28,810 | +0.03 pts |
| Top | 2,28,191 | +0.26 pts |

### NIFTY 50 members only (from 2020, all years, for context; no verdicts)

| Signal | Episodes | Median, 1 month | Same days, all stocks |
|---|---|---|---|
| Delivery well above its own normal | 2289 | +0.8% | +0.3% |
| Delivery well below its own normal | 2260 | +1.1% | +0.6% |
| Accumulation (high delivery, price up) | 2347 | +0.8% | +0.4% |
| Distribution (high delivery, price down) | 2495 | +1.0% | +0.3% |
| Delivery spike (≥ 2×), price up | 1835 | +1.3% | +0.8% |
| Delivery spike (≥ 2×), price down | 1731 | +0.9% | +0.6% |
| Long-term holders' stock (top fifth of delivery that day) | 355 | +1.4% | -0.1% |
| Traders' stock (bottom fifth of delivery that day) | 227 | +2.1% | +1.8% |

Cut points for "well above / below its own normal" (discovery): -9.1, -2.8, 2.5, 9.0 points.

### First run, with the wrong baseline and ETFs included (superseded; for the record)

| Signal | Episodes | Months | Median | Same days, all stocks | Beats random | Same way | Effect | Hold-out episodes | Hold-out median | Hold-out baseline | Hold-out beats | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Delivery well above its own normal | 31173 | 75 | 0.0% | +0.3% | 15.4% (worse) | 3 of 4 | -0.33 pts | 32439 | 0.0% | 0.0% | 1.1% (worse) | Maybe |
| Delivery well below its own normal | 31126 | 75 | -0.2% | +0.4% | 0.0% (worse) | 3 of 4 | -0.60 pts | 33228 | +0.3% | +0.3% | 1.8% (worse) | Build |
| Accumulation (high delivery, price up) | 33895 | 75 | +0.2% | +0.4% | 95.4% (better) | 2 of 4 | -0.20 pts | 33889 | +0.4% | +0.3% | 98.2% (better) | Don't build |
| Distribution (high delivery, price down) | 36278 | 75 | +0.1% | +0.5% | 86.1% (better) | 3 of 4 | -0.33 pts | 36702 | 0.0% | +0.1% | 34.6% (worse) | Maybe |
| Delivery spike (≥ 2×), price up | 32963 | 75 | 0.0% | +0.5% | 0.0% (worse) | 3 of 4 | -0.55 pts | 33416 | +0.1% | +0.3% | 0.0% (worse) | Build |
| Delivery spike (≥ 2×), price down | 24584 | 75 | +0.2% | +0.6% | 78.3% (better) | 2 of 4 | -0.35 pts | 25559 | +0.7% | +0.6% | 98.5% (better) | Don't build |
| Long-term holders' stock (top fifth of delivery that day) | 7717 | 75 | +0.2% | +0.4% | 97.6% (better) | 1 of 4 | -0.18 pts | 7158 | +0.6% | +0.4% | 100.0% (better) | Don't build |
| Traders' stock (bottom fifth of delivery that day) | 3936 | 75 | -0.5% | +0.2% | 2.8% (worse) | 4 of 4 | -0.72 pts | 5467 | -0.5% | +0.3% | 0.0% (worse) | Maybe |

