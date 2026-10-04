# 0024 — Unusual activity: what counts, and how it's computed

**Date:** 2026-10-04 · **Status:** done · Spec: `docs/superpowers/specs/2026-10-04-unusual-activity-design.md` · Plan: `docs/superpowers/plans/2026-10-04-unusual-activity.md`

## Problem

The owner wants to **see** where money suddenly went into or out of a stock ("people
suddenly invested", "people suddenly sold and we don't know why"), across the whole market
and for the NIFTY 50. This is tracking, not prediction: research 0003 found delivery spikes
don't reliably lead to gains, so the page states what happened and never says "buy".

## Decisions

**1. Four kinds, each against the stock's own last 20 sessions** (owner chose all four):

| Kind | Fires when |
|---|---|
| Big keeping | delivered shares ≥ 5× normal |
| Huge volume | traded shares ≥ 5× normal |
| Delivery jump | delivery % ≥ normal + 30 points |
| Delivery collapse | delivery % ≤ normal − 30 points |

Thresholds were picked from data before building: at 2× about 190 stocks a day qualified
(1 in 8, not "unusual"); 5× and ±30 points aimed at roughly 1 in 20. **Measured after the
build** (last 12 months, ~1,500 active stocks a day): about **47 stocks a day**: Big keeping
22, Huge volume 31, Delivery jump 7.5, Delivery collapse 16 (some days are several kinds).
Over all years since 2016 it averages 34 a day; crash days run far higher (85 on
23 Mar 2020, mostly stocks frozen at their −5% limit, where the few shares that trade are
nearly all delivered).

**2. Who is watched:** companies trading a median ₹1 crore a day or more over their last 20
sessions, ETFs left out (`fund-symbols.txt`, ISIN "INF"), the same universe as research
0003. The NIFTY 50 switch uses membership **on that date**.

**3. Share counts are split-adjusted** (`shareFactors`), so a 1:2 split can't look like a
2× spike; delivery % needs no adjustment. The five days when NSE's two files disagree
(0021) carry no delivery figure: only Huge volume can fire on them, and they're skipped
inside the 20-session normal. (A spot check matched by hand only once that day was
skipped: PIXTRANS on 1 Oct 2026, 11.1163×.)

**4. Stored events, rebuilt in full each night.** `computeUnusualDays` runs every company
through `loadAdjustedHistory` and replaces `unusual_days` in one transaction (about
84,000 rows since 27 Oct 2016, 21 seconds), so a reader never sees an empty table and a late
corporate action re-adjusts history. Rejected: computing on each page view (would repeat
split adjustment in SQL, which CLAUDE.md forbids) and extending `daily_indicators` to every
stock (a bigger job, on the roadmap).

**5. One copy of the maths.** `windowMean`, the liquidity rule, the excluded days and the
company universe moved from `src/research/` to `src/indicators/activity.ts` and
`universe.ts`; research 0003 imports them, and re-running it after the move gave identical
output.

**6. On screen:** `/activity` under Stocks (key **u**), date picker, All / NIFTY 50 switch,
four filter chips with counts, sorted by how far outside normal (largest measure ÷ its
threshold). NIFTY 50 members link to their Report Card; other stocks don't have one yet, and
the footer says so. NIFTY 50 Report Cards get an "Unusual days, last 3 months" card. Six
glossary terms, each with a live sentence. A date before 27 Oct 2016 explains that each
stock needs 20 sessions of history first.

## Revisit when

- Report Cards exist for every stock: link every row.
- Nightly alerts are built: the day's list is a natural thing to send.
- The owner finds the list too long or too short: the thresholds are constants in
  `src/indicators/activity.ts` (`KEPT_X`, `VOLUME_X`, `JUMP_PTS`); re-measure after a change.
