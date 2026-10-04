# 0023 — The crash table read like a one-day fall

**Date:** 2026-10-04 · **Status:** done

## Problem

The owner saw TATASTEEL's Report Card say "9 Mar 2020 · −49.5%" under *In past market
crashes*, and Google said Tata Steel fell 3.90% that day. The table looked wrong.

Checked against NSE's file and TradingView (prices ÷ 10 for the 2022 split):

| | NSE (ours) | TradingView |
|---|---|---|
| 15 Jan 2020, highest close in the 3 months before | ₹502.10 | ₹50.21 |
| 6 Mar 2020 | ₹351.50 | ₹35.15 |
| 9 Mar 2020 | ₹322.30 | ₹32.23 |
| 3 Apr 2020, lowest close in the 3 months after | ₹253.75 | ₹25.375 |

- The **−49.5% is right**: ₹502.10 → ₹253.75, the whole COVID fall (decision 0014's definition).
- The day itself, 9 March 2020, was **−8.3%** on both sources; Google's −3.90% is wrong (or
  from another moment or day).
- So the numbers were correct, but the table invited the wrong reading: a date in the
  first column and a % beside it reads as "fell 49.5% on that date".

## Options

1. Leave it; the subtitle already said "from the high … to the low …". It wasn't enough.
2. Show rupee prices under each fall. Rejected: a split between the high and the low
   would make raw rupees contradict the % (the % is on the adjusted line).
3. **Name the column for what it is, and show the dates the fall ran between.**

## Decision

Option 3. The column is now "Its fall during the crash", with "15 Jan → 3 Apr 2020" under
the % (both years when it crosses New Year), and the subtitle starts "How far it fell over
each whole crash, not in one day". `crashEpisodes` returns `peakDate` / `lowDate`: the first
session at the high and the low, where "at" allows one part in a trillion so two
calculations of the same close can't pick neighbouring days (decision 0013). The
independent audit (`bun run audit:report-card`) recomputes both dates its own way and
compares them: 0 mismatches across all 50 members on 1 Oct 2026.

## Revisit when

- Another page shows a multi-day change next to a single date: label the span the same way.
