# 0022 — Judge a stock signal against other stocks on the same days

**Date:** 2026-10-04 · **Status:** done · Spec: `docs/superpowers/specs/2026-10-04-delivery-study-design.md` · Plan: `docs/superpowers/plans/2026-10-04-delivery-study.md`

## Problem

The studies ask "is this signal better than luck?" by comparing it with random picks.
Research 0002 picked random *stock-days* one by one. Its own caveats said that's too
generous: real signals bunch up (in a sell-off week dozens of stocks fire together), and
random days picked one by one vary less than bunched ones, so signals look more unusual
than they are. CLAUDE.md said to fix this before any whole-market study. The delivery
study (research 0003) was the first one, with up to 2,600 stocks a day.

## Options

| Option | What it does | Problem |
|---|---|---|
| Random stock-days (research 0002) | Any eligible stock on any day | Flatters bunched signals; mixes good and bad market periods differently from the signal |
| Random dates, one random stock each | Keeps "one per date" | Still doesn't keep the signal's own dates; market direction still leaks in |
| **Same dates, random other stocks** | For each signal occasion, a random *other* eligible stock on that same date | None found; costs one random draw per occasion |

## Decision

Same dates, random other stocks (`matchedLuck` in `src/research/delivery.ts`): 1,000
seeded draws, each replacing every occasion with a random other eligible stock on its
date; "beats random" is the share of draws whose median the signal beat (ties count
half). The baseline shown next to it is the same yardstick as one number
(`matchedBaseline`: the median of random same-day picks).

## Why

- Bunching is kept exactly: a signal that fires for 300 stocks in March 2020 is compared
  with 300 other stocks in March 2020.
- Whether the market rose or fell cancels out, because both sides live through the same
  days. No index is needed, which matters because our index history starts in 2020.
- It is checked: a test feeds random "signals" made of eligible stocks and confirms they
  pass the 97.5% bar about 5% of the time, as a fair check should.

## Something we found along the way

The spec first defined the baseline as "the median of each signal day's median stock".
On the first run it contradicted the luck check (a signal beating 95% of random draws
came out *below* the baseline, and all eight signals came out below it). When some days
swing far more than others, the median of day medians isn't what a random stock from
those days typically does. The baseline now uses the luck check's own random draws. The
correction made the results less favourable (two "Build" verdicts became "Maybe"); both
runs are in research 0003.

## Revisit when

- Re-running research 0002 (volume) on the whole market: use `matchedLuck` and
  `matchedBaseline` instead of `luckCheck`.
- A study needs to hold sector or size constant too: draw the random stock from the same
  sector or size band on that date.
