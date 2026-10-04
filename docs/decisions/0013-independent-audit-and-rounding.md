# 0013 — An independent audit of the Report Card, and the rounding bugs it found

**Date:** 2026-10-02 · **Status:** done

## Problem

The owner asked: *how do we know what the Report Card shows is right?* It had unit tests
(small made-up series) and a few spot checks against TradingView, but nothing checked
**every number, for every stock, on real data**.

So we built a second, independent calculation (`bun run audit:report-card`) and compared
it with the app. It found two real bugs, both the same kind: **comparing decimal numbers
for exact equality**.

### Bug 1: Strength percentile 2 points too low for half the stocks

- To rank a stock, the app worked out its 6-month return twice: once from its full
  history, once from a shorter recent window when ranking all members.
- The two copies differ in the 14th decimal (−21.879501141753**02** vs …752**94**), because
  the same daily moves were multiplied starting from different points.
- When the window copy came out a hair higher, the stock failed "at or below itself" and
  wasn't counted, so its percentile lost 1 of 50 (2 points). ONGC read **0%**, which is
  impossible if a stock counts itself.
- It hit **26 of 50 stocks** on 1 Oct 2026, by chance. No light changed colour that day, but
  a stock at 66 instead of 68 would have shown amber instead of green.

### Bug 2: "Share of months that ended lower" slightly off for low-priced stocks

- Low-priced stocks (GAIL, IOC, ITC, NTPC) often close at **exactly the same price** a
  month apart. The true return is 0, but each calculation lands on ±0.00000000000001,
  and a hair below zero counted as "ended lower". Off by 1 or 2 of ~840 stretches.

## Options

| Option | Good | Bad |
|---|---|---|
| **Remove the stock from its peer list by symbol, and compare returns with a tiny tolerance** ✅ | Fixes the cause; never compares a number with itself; reads honestly as "of the other 49" | The meaning shifts slightly: from "at or below, including itself" to "beat the others" |
| Round returns to, say, 6 decimals before comparing | One line | Rounding moves the problem to the rounding boundary; still compares a stock with itself |
| Compute the stock's own return the same way as its peers' | Same numbers, same noise | Fragile: the next refactor reintroduces it silently |

## Decision

- **`rankAmongPeers`** (`src/indicators/risk.ts`): the stock is taken out of the peer list
  **by symbol**. It is "stronger than X% of the other N members": the share of the others
  whose return is lower by more than noise. The weakest reads 0%, the strongest 100%,
  and the card says "of the other 49 members". This also settles the old TODO item
  "Strength can read 100%", which is now true and correctly worded.
- **`NOISE_PCT = 1e-9`** (percentage points): a gap smaller than that is the same number
  computed two ways, never a real difference. Floating-point noise here is about 1e-13,
  and real returns differ by far more than 1e-9. It is used for the ranking and for
  "ended lower".
- **The audit is a command**: `bun run audit:report-card [date]`. It shares no code with
  the app:
  - It reads raw bhavcopy rows, follows renames itself and applies splits, bonuses and
    demergers itself.
  - It recomputes the 15 Report Card numbers for every member and compares them
    (0.1% tolerance).
  - It exits with an error on any mismatch, so it can join the nightly run later.
  - New Report Card sections must add their numbers to it.

## Why

- **Removing the stock by symbol** fixes the cause, not the symptom: nothing compares a
  stock's return with itself any more, so no refactor can bring the noise back.
- **A tolerance, not rounding**: rounding just moves the knife-edge somewhere else.
- **An independent second calculation** catches what unit tests can't. The tests use tiny
  series where both paths happen to round the same way; only real data over a different
  route exposed it.

## Checks

- Tests that failed first: `rankAmongPeers` (self removed even with rounding noise; the
  weakest is 0%, the strongest 100%; noise between two stocks never counts), a Report Card
  test with three members (0% / 50% / 100%), and a flat stretch that isn't "lower".
- Audit, all 50 members × 15 numbers, **0 mismatches** on 1 Oct 2026, 23 Mar 2020 (COVID
  low), 17 Jun 2022 (2022 low) and 4 Jun 2024 (election-result crash): 3,000 numbers.
  Before the fixes: 26 mismatches on 1 Oct 2026 and 4 on 23 Mar 2020.

## What the audit does not prove

It takes the definitions (126 sessions = 6 months, how the 10th percentile is taken…) from
decision 0011. So it proves the **data and the arithmetic**, not that the definitions are
the best ones. Published formulas and TradingView spot checks cover that.

## Revisit when

- **A Report Card number is added** (expected range, market sensitivity, when the market
  breaks are next): add it to the audit in the same change.
- ~~Nightly~~: done 4 Oct 2026. `ingest:nightly` runs the audit after recomputing the
  averages, as its own process (it must stay independent of the app's code), and turns
  each `✗` line into a `WARNING` (`src/audit/nightly.ts`; first 10 listed, the rest
  counted). An audit that crashes or prints no summary is a warning too, so a broken check
  can't pass for a clean one. First scheduled run: 1,592 numbers, 0 mismatches. Still to
  do: send the warnings somewhere you'll see them (TODO, Notifications).
