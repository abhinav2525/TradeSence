# 0009 — The Screener: crossings, volume and "near the line"

**Date:** 2026-10-02 · **Status:** done

## Problem

TODO item 5 and the design handoff (`docs/design/HANDOFF.md` §2) ask: which NIFTY 50
stocks crossed their average on a session, did volume back the move, and which are
about to cross? That needs three things we didn't have:

1. **A volume ratio**: today's volume against the stock's own normal.
2. **A crossing rule** that a hole in the data or the first day of an average can't fake.
3. **Volume that splits can't fake.** After KOTAKBANK's 1:5 split there are 5× as many
   shares, so raw volume reads ~5× with nothing happening.

## Decisions

**Volume ratio** = the session's volume ÷ the mean of the **20 sessions before it**.
Today is never part of its own baseline. It's computed in `computeIndicators` and stored
as `daily_indicators.vol_ratio` (`src/indicators/volume.ts`), so it uses the same
rename-joined series as everything else.
- Volume is scaled by **split, bonus and consolidation** factors only, **never by a
  demerger**: a demerger changes the price, not the number of shares (flagged in
  [0008](0008-measuring-a-days-move.md); the handoff said otherwise, and was wrong).
  Checked: KOTAKBANK on its split day reads 0.97×, not ~5×.
- No ratio until there are 20 sessions, after a hole in the data (the baseline restarts),
  or when the baseline is zero.

**Crossing** (`readSymbol`, `src/query/screener.ts`): yesterday's close at or below its
average and today's above it (or the reverse). Both days must have an average, with no
hole over 21 days between them. This is the same rule as the Crossings page.

**"Below for"** = sessions spent on the other side before this crossing.

**Near the line** = within **1%** of the average, either side, with exactly 1% included.
It also shows the gap 5 sessions earlier, so you can see whether the stock is closing in.

**Past crossings badge** compares a stock with **today's** 50 members: at or under the
25th percentile is "Calm crosser", at or over the 75th is "Busy", otherwise "Typical".
Percentiles keep it relative, so it never needs re-tuning.

**Volume filter** (Any / ≥1.5× / ≥2× / ≥3×, default ≥2× as in the TODO) is judged on
the **value as displayed, to one decimal**. The first version compared the raw number,
so BAJFINANCE at 1.96× showed "2.0×" yet was hidden by "≥2×". What you see and what's
filtered must agree. A line under the table names what the filter hides, with a link to
show all volumes. The filter doesn't apply to the "Near the line" view.

**No new `sql.raw`.** The screener selects all three averages and picks one in
TypeScript, so CLAUDE.md's "sql.raw appears exactly twice" stays true. Every URL
parameter (`ma`, `date`, `view`, `vol`) is checked against a fixed list and falls back
to its default.

## Why

- **Stored ratio, computed once:** the adjustment logic (splits, renames, gaps) lives in
  one place, as for the daily move.
- **Relative badges and a displayed-value filter** keep the page honest without
  constants to tune.

## Checks

- 3 Feb 2026, 200-day SMA: 6 stocks crossed above (ADANIPORTS on 5.3× volume).
- 1 Oct 2026: 4 crossed below (BAJAJ-AUTO, GRASIM, JSWSTEEL, SUNPHARMA), matching an
  independent query. BAJAJ-AUTO's "7.0×" checks out against raw volume (1,491,300 vs a
  20-day average of ~211,650).

## Revisit when

- **Volume history is needed for stocks outside the NIFTY 50**: `vol_ratio`, like the
  averages, is only computed for index members, past and present.
