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

Three signals showed a **real but small** effect: unlikely to be luck in 2016–2022, and
confirmed again on 2023–2026, data the rules never saw. A fourth came within a whisker.
All were too small to trade at one month:

| Signal | What happened over the next month, vs other stocks on the same days | Real? | Big enough? | Verdict |
|---|---|---|---|---|
| Traders' stock (delivery in the bottom fifth of all stocks that day) | Lagged by 0.4 points; by 1.4 points at 3 months | Almost: just short in 2016–22 (97.2% vs the 97.5% bar), strong in 2023– | No (0.43 < 0.5) | Maybe |
| Long-term holders' stock (top fifth) | Ahead by 0.2 points; by 1.0 point at 3 months | Yes, confirmed | No | Maybe |
| Delivery spike (2× usual) **with the price up** | **Lagged** by 0.25 points: the opposite of the popular reading | Yes, confirmed | No | Maybe |
| Delivery well below its own normal | Lagged by 0.2 points | Yes, confirmed | No | Maybe |
| Accumulation (high delivery, price up) | Ahead by 0.1 points; just short of the luck bar | Not proven | No | Maybe |
| Distribution (high delivery, price down) | Nothing | No | No | Maybe |
| Delivery well above its own normal | Nothing (0.0) | No | No | Maybe |
| Delivery spike, price down | Nothing | No | No | Don't build |

**In one line:** delivery % carries a faint, real signal, mostly about *what kind of
stock* it is (held vs traded), not about *what happens next week*. The famous
"high delivery + price up = smart money buying" didn't show an edge, and a delivery spike
on an up day was, if anything, slightly bad news.

## How to read the numbers

- **Delivery %** = shares delivered ÷ shares traded, from NSE's daily delivery file
  (decision 0021). It was checked against NSE's own printed % (INFY 51.96%, RELIANCE
  61.24% on 1 Oct 2026; 20MICRONS 86.13% on 28 Sep 2016: all equal).
- **"Its own normal"**: some stocks always run at 70% delivery, others at 20%. So signals
  1–6 compare a stock's delivery today with *its own* average over the previous 20
  sessions. "Well above" is the top fifth of that difference, about **+9 points or more**;
  "well below" about **−9 points or less**.
- **Signals 7–8** instead compare stocks with each other: each day, which stocks had the
  highest (or lowest) delivery over the last 20 sessions.
- **Which stocks:** every NSE stock trading at least ₹1 crore a day (median of the last
  20 sessions), including stocks later delisted: about 2.4 million stock-days, 3,328
  companies.
- **No peeking:** NSE publishes delivery figures in the evening, so every return starts
  from the **next** day's close.
- **Same days, other stocks:** each signal is compared with random other stocks *on the
  same dates*, drawn 1,000 times. So a rising market can't flatter a signal, and a
  sell-off week where hundreds of stocks fire at once can't either (decision 0022).
- **Beats random:** the share of those 1,000 random draws the signal beat. 97.5% or more
  (or 2.5% or less, for "worse") means only about 1 random pick in 20 is as unusual.
- **Decide, then confirm:** verdicts were judged on 2016–2022. Anything real also had to
  hold on 2023–2026 (beat ≥ 95%, or ≤ 5% for "worse"). Several did, which is why we can
  call those effects real.
- **Effect** is the signal's median minus the typical same-day stock's, in percentage
  points over a month.

## Results

Main span: 1 month. Rules fixed before any result was seen, except one correction to how
the "typical same-day stock" is measured, explained under Method.

| Signal | Episodes | Median | Typical same-day stock | Beats random | Same way | Effect | Hold-out (2023–) beats | Verdict |
|---|---|---|---|---|---|---|---|---|
| Delivery well above its own normal | 31173 | 0.0% | 0.0% | 15.4% (worse) | 3 of 4 | -0.01 pts | 1.1% (worse) | Maybe |
| Delivery well below its own normal | 31126 | -0.2% | 0.0% | 0.0% (worse) | 4 of 4 | -0.20 pts | 1.8% (worse) | Maybe |
| Accumulation (high delivery, price up) | 33895 | +0.2% | +0.1% | 95.4% (better) | 3 of 4 | +0.11 pts | 98.2% (better) | Maybe |
| Distribution (high delivery, price down) | 36278 | +0.1% | +0.1% | 86.1% (better) | 4 of 4 | +0.07 pts | 34.6% (worse) | Maybe |
| Delivery spike (≥ 2×), price up | 32963 | 0.0% | +0.2% | 0.0% (worse) | 3 of 4 | -0.25 pts | 0.0% (worse) | Maybe |
| Delivery spike (≥ 2×), price down | 24584 | +0.2% | +0.2% | 78.3% (better) | 2 of 4 | +0.07 pts | 98.5% (better) | Don't build |
| Long-term holders' stock (top fifth of delivery that day) | 7717 | +0.2% | 0.0% | 97.6% (better) | 4 of 4 | +0.24 pts | 100.0% (better) | Maybe |
| Traders' stock (bottom fifth of delivery that day) | 3936 | -0.5% | -0.1% | 2.8% (worse) | 4 of 4 | -0.43 pts | 0.0% (worse) | Maybe |

**What stands out:**

- **The popular reading of a delivery spike is backwards, slightly.** A stock whose
  delivered shares doubled on a day the price rose lagged other stocks by 0.25 points
  over the next month, and the same thing happened in 2023–2026. The first week is the
  weakest (−0.4 vs −0.1). One plausible reading: the spike comes after the move, and part
  of it gives back. Small either way: not a reason to sell.
- **What kind of stock it is matters more than today's reading.** Stocks whose buyers
  mostly hold (the top fifth for delivery) beat the typical stock by 0.2 points at one
  month, 1.0 at three months and 2.1 at six. Stocks that are mostly traded in and out
  (the bottom fifth) lagged by 0.4, 1.4 and 1.4. Only the
  one-month span was declared before the study, so the three- and six-month gaps are
  leads for a future study, not findings.
- **"Accumulation" is the closest thing to the popular idea, and it's tiny.** High
  delivery on an up day did 0.1 points better at a month: beat 95.4% of random draws in
  2016–22 (short of 97.5%) and 98.2% in 2023–. Possibly real, certainly too small to trade.
- **Big stocks look different, but the sample is small.** Among NIFTY 50 members (from
  2020, no verdicts) most signals did a little better than the same-day typical stock,
  e.g. long-term holders' stocks +1.0% vs −0.1%. With a few hundred to two thousand
  episodes over six years and no hold-out, treat it as colour only.

## Caveats (please read)

- **8 tests at once.** By chance, about one could pass the luck bar in 2016–22. The
  2023– hold-out is what guards against that: the three "real" effects held there too.
- **Liquid stocks only** (≥ ₹1 crore a day). Very small stocks, where one buyer moves
  the price, are excluded on purpose.
- **Costs.** The 0.5-point bar is a rough round trip (taxes, charges, slippage on
  mid-sized stocks). For a big stock at a discount broker it is lower, for a small one
  higher; no effect here would survive either way at one month.
- **Five days are left out**, when NSE's delivery file covered different trades from the
  price file (decision 0021).
- **The hold-out is 3¾ years** (2023 to Sep 2026), one mostly rising market. An effect
  that held there could still fade in a long bear market.
- **The luck check compares stocks on the same day** but doesn't hold sector or size
  constant: if delivery is mostly a proxy for "large, steady company", that is what these
  effects would be measuring.

## Method

As specified in the spec, with one correction made after the first run:

- **The "typical same-day stock" was first measured wrongly.** The spec defined it as
  "the median of each signal day's median stock". On the first run that disagreed with
  the luck check, which is the measure the verdicts rest on. For example, Accumulation
  beat 95.4% of random same-day draws, yet came out 0.20 points *below* that baseline,
  and all eight signals, including opposites like "delivery high" and "delivery low",
  came out below it. The reason: when some days swing far more than others, "the median
  of the day medians" isn't what a random stock from those days typically does (a day
  with returns −10, −9, 100, 101, 102 has median 100; a random pick from it is
  −10 or −9 two times in five). It was replaced with exactly the luck check's yardstick:
  the median of random other stocks drawn from the same days. The verdict rules were not
  changed.
- **The correction made the results less favourable, not more.** The first run gave two
  "Build" verdicts (delivery well below normal: −0.60 points; delivery spike with price
  up: −0.55). Both were inflated by the wrong baseline; corrected, they are −0.20 and
  −0.25, below the 0.5 bar. The first run's results table is kept at the end of this
  file so the change is visible.
- Everything else as specified: eligible stock-days as above; episodes merge firing days
  within 10 sessions per stock (dated by their first day); returns from the next close at
  1 week, 2 weeks, 1, 3 and 6 months, never across a gap in the data; 1,000 seeded random
  draws; the "fifths" for signals 1–4 cut from 2016–22 only.
- Code: `src/research/delivery.ts` (tested: `tests/delivery-research.test.ts`, including a
  check that random "signals" pass the bar about 5% of the time),
  `src/research/delivery-data.ts`, `src/research/cli-delivery.ts`. Company histories load
  through `loadAdjustedHistory`, so renamed companies keep their full history.

## What this means for the app

- **Don't build** a delivery buy/sell signal: no accumulation alert, no "delivery spike"
  screener filter. None would beat costs, and the spike one points the wrong way.
- **Maybe later, as information only:** a stock's typical delivery level ("mostly held"
  vs "mostly traded") on the Report Card, explained in the glossary and shown like the
  Screener's volume column: context, never a light that says good or bad. That needs the
  owner's call, and ideally a 3-month study first (the gaps here grow with time).
- **Whole-market follow-ups this enables:** research 0002 (volume) can now be re-run on
  the whole market with the same date-matched luck check (decision 0022).

## Appendix: full results (generated)

### Results (main span: 1 month; discovery 2016–2022, hold-out 2023–)

| Signal | Episodes | Months | Median | Same days, all stocks | Beats random | Same way | Effect | Hold-out episodes | Hold-out median | Hold-out baseline | Hold-out beats | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Delivery well above its own normal | 31173 | 75 | 0.0% | 0.0% | 15.4% (worse) | 3 of 4 | -0.01 pts | 32439 | 0.0% | 0.0% | 1.1% (worse) | Maybe |
| Delivery well below its own normal | 31126 | 75 | -0.2% | 0.0% | 0.0% (worse) | 4 of 4 | -0.20 pts | 33228 | +0.3% | +0.4% | 1.8% (worse) | Maybe |
| Accumulation (high delivery, price up) | 33895 | 75 | +0.2% | +0.1% | 95.4% (better) | 3 of 4 | +0.11 pts | 33889 | +0.4% | +0.3% | 98.2% (better) | Maybe |
| Distribution (high delivery, price down) | 36278 | 75 | +0.1% | +0.1% | 86.1% (better) | 4 of 4 | +0.07 pts | 36702 | 0.0% | +0.1% | 34.6% (worse) | Maybe |
| Delivery spike (≥ 2×), price up | 32963 | 75 | 0.0% | +0.2% | 0.0% (worse) | 3 of 4 | -0.25 pts | 33416 | +0.1% | +0.3% | 0.0% (worse) | Maybe |
| Delivery spike (≥ 2×), price down | 24584 | 75 | +0.2% | +0.2% | 78.3% (better) | 2 of 4 | +0.07 pts | 25559 | +0.7% | +0.6% | 98.5% (better) | Don't build |
| Long-term holders' stock (top fifth of delivery that day) | 7717 | 75 | +0.2% | 0.0% | 97.6% (better) | 4 of 4 | +0.24 pts | 7158 | +0.6% | +0.3% | 100.0% (better) | Maybe |
| Traders' stock (bottom fifth of delivery that day) | 3936 | 75 | -0.5% | -0.1% | 2.8% (worse) | 4 of 4 | -0.43 pts | 5467 | -0.5% | +0.3% | 0.0% (worse) | Maybe |

### Every span (discovery medians vs same-days baseline)

| Signal | 1 week | 2 weeks | 1 month | 3 months | 6 months |
|---|---|---|---|---|---|
| Delivery well above its own normal | -0.2 vs -0.2 | -0.2 vs -0.2 | 0.0 vs 0.0 | +0.3 vs +0.4 | +0.9 vs +1.4 |
| Delivery well below its own normal | -0.3 vs -0.1 | -0.2 vs 0.0 | -0.2 vs 0.0 | +0.1 vs +0.3 | +1.0 vs +1.5 |
| Accumulation (high delivery, price up) | -0.1 vs -0.1 | 0.0 vs 0.0 | +0.2 vs +0.1 | +0.9 vs +0.6 | +1.6 vs +1.3 |
| Distribution (high delivery, price down) | -0.1 vs -0.2 | -0.1 vs -0.2 | +0.1 vs +0.1 | +0.5 vs +0.4 | +1.4 vs +1.3 |
| Delivery spike (≥ 2×), price up | -0.4 vs -0.1 | -0.3 vs 0.0 | 0.0 vs +0.2 | +0.4 vs +0.5 | +1.4 vs +1.3 |
| Delivery spike (≥ 2×), price down | -0.2 vs -0.2 | -0.1 vs 0.0 | +0.2 vs +0.2 | +0.6 vs +0.2 | +1.1 vs +0.8 |
| Long-term holders' stock (top fifth of delivery that day) | -0.1 vs -0.2 | +0.1 vs -0.1 | +0.2 vs 0.0 | +1.4 vs +0.4 | +3.8 vs +1.7 |
| Traders' stock (bottom fifth of delivery that day) | -0.4 vs -0.2 | -0.5 vs -0.2 | -0.5 vs -0.1 | -1.4 vs 0.0 | -0.2 vs +1.2 |

### Delivery against its own normal, by fifth (discovery, 1 month, return minus that day's median stock)

| Fifth of rel | Stock-days | Median vs the day's typical stock |
|---|---|---|
| Bottom | 2,32,632 | -0.11 pts |
| Second | 2,33,219 | -0.09 pts |
| Middle | 2,33,393 | -0.08 pts |
| Fourth | 2,33,426 | +0.03 pts |
| Top | 2,32,819 | +0.25 pts |

### NIFTY 50 members only (from 2020, all years, for context; no verdicts)

| Signal | Episodes | Median, 1 month | Same days, all stocks |
|---|---|---|---|
| Delivery well above its own normal | 2300 | +0.8% | +0.3% |
| Delivery well below its own normal | 2270 | +1.1% | +0.6% |
| Accumulation (high delivery, price up) | 2344 | +0.8% | +0.5% |
| Distribution (high delivery, price down) | 2496 | +1.0% | +0.4% |
| Delivery spike (≥ 2×), price up | 1835 | +1.3% | +0.8% |
| Delivery spike (≥ 2×), price down | 1731 | +0.9% | +0.6% |
| Long-term holders' stock (top fifth of delivery that day) | 366 | +1.0% | -0.1% |
| Traders' stock (bottom fifth of delivery that day) | 231 | +2.4% | +1.5% |

Cut points for "well above / below its own normal" (discovery): -9.2, -2.8, 2.5, 9.0 points.

### First run, with the wrong baseline (for the record; superseded)

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

