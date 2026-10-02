# 0008 — How Advance/Decline measures a stock's daily move

**Date:** 2026-10-02 · **Status:** done

## Problem

Advance/Decline counts, for each session, how many NIFTY 50 members rose and how many
fell. That needs each stock's move from the previous session. The design handoff
(`docs/design/HANDOFF.md`) left one choice open: use NSE's `prev_close` from the
bhavcopy, or our own previous adjusted close.

`prev_close` looks like the obvious answer, but it's wrong on exactly the days that
matter:

- **Split and bonus days:** NSE does **not** adjust `prev_close` on the ex-date (found in
  [0002](0002-split-adjusted-averages.md)). KOTAKBANK's 1:5 split would count as an
  80% fall, a fake decline.
- **Demergers:** same problem, the price drops because value was handed out
  ([0004](0004-demerger-adjustment.md)).
- **Renames:** under the new symbol, the first day has no previous row unless the old
  symbol's history is joined on ([0003](0003-renamed-symbols-lose-history.md)).

## Options

| Option | Good | Bad |
|---|---|---|
| NSE's `prev_close` | Simplest | Wrong on split, bonus and demerger days; no help with renames |
| Compute the move in the query, from raw closes | Matches the handoff's "compute at query time" | Would have to repeat the split, demerger and rename logic in SQL: two copies that can disagree |
| **Compute the move inside `computeIndicators` and store it** ✅ | Uses the one series that is already adjusted, joined across renames, and split at data gaps | One more stored column |

## Decision

`computeIndicators` now writes `daily_indicators.change_pct`: the % change from the
previous session **on the adjusted series**. It is empty on the first day of each
contiguous stretch, so no move is ever claimed across a hole in the data.
`src/query/advance-decline.ts` counts members on each date (real membership,
[0005](0005-point-in-time-membership.md)) with `change_pct > 0` / `< 0` / `= 0`, and works
out the instruments in TypeScript:

- **Net** = advancing − declining.
- **RANA** = (A − D) ÷ (A + D) × 1,000, the ratio-adjusted version. A day when nothing
  moved is 0, not a division by zero.
- **McClellan oscillator** = 19-day EMA − 39-day EMA of RANA.
- **Summation index** = running sum of the oscillator.
- **A/D line** = running sum of net. Only its slope means anything.
- **10-day advancing share** = 10-day EMA of A ÷ (A + D), in %. This is the input for
  the breadth-thrust signal.

Every average and running sum restarts after a gap in the data. The 21-day gap rule
now lives in **one** module, `src/indicators/gaps.ts`, used by averages, crossings and
Advance/Decline. It used to be copied in two places.

## Why

- **One source of truth for "what did this stock do today".** Splits, demergers and
  renames are handled in exactly one place, so Advance/Decline can't disagree with the
  averages.
- **Checked against NSE:** our up/down direction agrees with NSE's close vs `prev_close`
  on **103,049 of 103,059** member-days since 2020. The 10 that differ are the split and
  demerger days, where NSE's raw comparison is the wrong one.
- The instruments stay in TypeScript, as the handoff suggested: a few thousand sessions,
  computed per page view.

## The page (`/advance-decline`)

Built from the design handoff (`docs/design/`). Choices made along the way:

- **The sidebar only lists pages that exist.** The handoff shows Screener and Signals
  too, but they're added when they're built, so there's never a dead link.
- **The A/D line starts from zero at the left edge of whatever range is shown**
  (3M / 6M / 1Y / All). Its level means nothing; only its slope does, so each window
  starts level.
- **"Flat" summation index** = moved less than 10 points over 20 sessions.
- **The oscillator's scale always includes zero**, in round steps. Without that, a
  stretch where every bar is negative (March 2020) looked like bars hanging from the top.
- **Every axis labels each month or year once** (`dateTicks` in `src/lib/ticks.ts`). The first draft
  read "2020 2020" and "Feb ’20 Feb ’20".
- **Large signed numbers use Indian grouping** ("−1,560"), as the design system asks.
  This changed the shared `signed()` helper, so every page benefits.

Checked in the browser: today's view, 23 Mar 2020 (0 rose, 50 fell: the COVID low),
and a date before history starts (shows the "nothing loaded" message). On 1 Oct 2026
the page shows 13 rose, 37 fell, matching NSE's raw data exactly.

## A note for the Screener (next screen)

The handoff says volume "must be scaled by the same factors" as prices. That's right for
**splits and bonuses** (more shares, so pre-split volume must be multiplied by the factor
to compare). It's **wrong for demergers**: the share count doesn't change, only the price.
Scaling volume by a demerger factor would inflate every pre-demerger day (×1.65 for TMPV).
The Screener must scale volume by split and bonus factors only.

## Revisit when

- A page needs moves for stocks outside the NIFTY 50. `change_pct` is only computed for
  index members (past and present), like the averages.
