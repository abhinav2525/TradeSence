# Research 0003: does delivery % tell us anything? — design

**Date:** 2026-10-04 · **Status:** design agreed in conversation (owner: "do 3"); spec for owner review · **Path:** architectural (study)

## Intent (agreed)

- **Question:** when a stock's delivery % is unusual, does that stock then do better or
  worse than other stocks over the following weeks?
- **Why:** if yes, delivery % can become a Report Card light or a Screener filter; if no,
  we don't build it and avoid showing a misleading number. Project rule: study first.
- **Success:** `docs/research/0003-does-delivery-predict.md` in the plain style of
  research 0001/0002, ending in Build / Maybe / Don't build per signal, decided by the rules
  below, fixed before any result is seen. A re-runnable `bun run research:delivery`.
- **Scope:** judging individual stocks (not the market as a whole). No page, light, table
  or nightly change. Nothing is stored.

## Data

- `daily_delivery` (decision 0021): traded and delivered shares, EQ, 28 Sep 2016 → today.
  **Delivery %** = delivered ÷ traded × 100, both from the delivery file.
- Prices, splits/bonuses/demergers and renames from the shared loader
  (`loadAdjustedHistory`), which gains two arrays, `traded` and `delivered` (null where a
  day has no delivery row), joined across the same rename lineage. Delivered shares are
  multiplied by `shareFactors` like volume (splits/bonuses only); delivery % needs no
  adjustment (both quantities change together).
- **Five days are treated as having no delivery figure**, because on them the delivery
  file covers different trades than bhavcopy (0021): 2019-06-17, 2019-06-18,
  2023-09-04, 2025-10-21, 2026-09-11.
- Every company is loaded once, under its latest symbol (so its history spans renames);
  delisted companies are included, so the study isn't flattered by survivors.

## Who counts (eligible stock-days)

A stock-day is eligible when all hold:

1. **Liquid:** the median of its last 20 sessions' turnover (₹, bhavcopy) is ≥ ₹1 crore.
2. **Enough history:** at least 15 of the previous 20 sessions (same gap-free segment,
   `segmentByGaps`) have a delivery figure, and so does the day itself.
3. **Not one of the five excluded days.**
4. **Its forward return exists** at that horizon (see Returns).

## Signals (textbook settings, never tuned)

Definitions, per stock, per day D, within a segment:

- `dp(D)` = delivery % on D.
- `usual(D)` = mean of `dp` over the previous 20 sessions (values present; ≥ 15 needed).
- `rel(D)` = `dp(D) − usual(D)`, in percentage points ("how far above its own normal").
- `spike(D)` = adjusted delivered shares on D ÷ mean adjusted delivered shares over the
  previous 20 sessions (≥ 15 values).
- `level(D)` = mean of `dp` over D and the previous 19 sessions (≥ 15 values).
- Price up / down on D: adjusted close above / below the previous session's.

| # | Signal | Fires on day D when |
|---|---|---|
| 1 | Delivery well above its own normal | `rel` in its top fifth |
| 2 | Delivery well below its own normal | `rel` in its bottom fifth |
| 3 | Accumulation | signal 1 and price up |
| 4 | Distribution | signal 1 and price down |
| 5 | Delivery spike, price up | `spike` ≥ 2 and price up |
| 6 | Delivery spike, price down | `spike` ≥ 2 and price down |
| 7 | Long-term holders' stock | `level` in the top fifth of all eligible stocks **that day** |
| 8 | Traders' stock | `level` in the bottom fifth of all eligible stocks that day |

Fifth cut points for signals 1–4 come from **discovery-period eligible stock-days only**;
signals 7–8 cut each day across stocks. The spike threshold reuses `HEAVY = 2` from
research 0002.

**Episodes:** per stock, firing days within 10 sessions of each other are one episode,
dated by its first day (`episodeStarts`, `MERGE_GAP`), as in research 0002.

## Returns (no peeking)

NSE publishes the delivery file in the evening, so a signal on D can only be acted on
the next session. **Return = adjusted close on D+1 → adjusted close h sessions later**,
h ∈ {5, 10, 21, 63, 126} (1 week … 6 months); **main span: 21 sessions (1 month).**
Left out when it would cross a gap or run past the last session (`forwardReturnSafe`).

## The comparison: same days, other stocks (new; decision 0022)

On the date an episode starts, compare the stock with **the other eligible stocks on that
same date**. This replaces research 0002's random stock-days, which that study flagged as
too generous when signals bunch up (TODO, research 0002 caveats): matched dates keep the
bunching identical, and whether the market rose or fell cancels out.

- **Baseline at horizon h:** for each episode, the median return of all eligible stocks on
  its date; the baseline is the median of those per-date medians.
- **Luck check:** 1,000 draws (seeded, reproducible). In each draw, every episode is
  replaced by one random *other* eligible stock on the same date; record the draw's
  median. `beat` = % of draws whose median is below the signal's (ties within
  `NOISE_PCT` count half); direction "better" if beat ≥ 50; strength = max(beat, 100 − beat).

## Discovery and hold-out

- **Discovery:** episodes starting 28 Sep 2016 → 31 Dec 2022. Verdicts are decided here.
- **Hold-out:** episodes starting 1 Jan 2023 → latest. Used only to confirm.
- All fifth cut points come from discovery.

## Verdict rules (fixed before results)

- **Build** only if all of:
  1. discovery has ≥ 30 episodes;
  2. discovery strength ≥ **97.5** at 1 month (two-sided: only 1 random pick in 20 is as
     unusual);
  3. at ≥ 3 of the other 4 spans the median sits on the same side of the baseline;
  4. at 1 month the median differs from the baseline by **≥ 0.5 percentage points**
     (roughly a round trip's costs: taxes, charges, slippage; a smaller edge isn't tradable);
  5. **hold-out confirms:** ≥ 30 episodes, and its luck check points the same way as
     discovery's at ≥ **95**: beat ≥ 95 if discovery was "better", beat ≤ 5 if "worse"
     (one-sided, because discovery already fixed the direction).
- **Maybe:** rule 3 holds in discovery, but not Build.
- **Don't build:** anything else.
- The write-up states that 8 signals were tested (so one could pass rules 1–3 by luck,
  which is what the hold-out guards against) and shows the distinct calendar months
  episodes start in.

## Also shown (no verdicts)

- Median next-month return by fifth of `rel` (discovery), against the baseline.
- The same eight signals restricted to NIFTY 50 member-days (from 2020), for context.

## Code

- `src/indicators/history.ts`: `traded` and `delivered` arrays in `History` (left join on
  the lineage windows). `computeIndicators` ignores them; its tests stay green.
- `src/research/delivery.ts`: pure, tested functions (delivery %, `rel`, `spike`, `level`,
  eligibility, signal flags, matched luck check, verdict incl. hold-out). Reuses
  `episodeStarts`, `forwardReturnSafe`, `median`, `fifthCuts`, `sameWay`, `mulberry32`,
  `NOISE_PCT`, `STUDY_HORIZONS`, `HEAVY`.
- `src/research/cli-delivery.ts`: loads every company, prints the Markdown results.
  `bun run research:delivery`.

## Checks

- Unit tests on hand-worked inputs for every formula; a split inside a window doesn't move
  `spike`; the five excluded days carry no figure; entry is D+1, never D; no return across
  a gap.
- **Calibration:** a "signal" made of random eligible stock-days passes the 97.5 bar about
  5% of the time over many seeds (proves the matched luck check isn't biased).
- A renamed company's delivery history spans its old symbol (history test).
- Spot check: three stock-days' delivery % against NSE's own printed % column.

## Documentation

`docs/research/0003-does-delivery-predict.md`; decision 0022 (the matched comparison);
"Research 0003" and 0022 rows in `docs/decisions/README.md`; TODO; README function
reference; CLAUDE.md (command, and the research note that said to switch to random dates).
