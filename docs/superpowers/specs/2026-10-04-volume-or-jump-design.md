# Research 0005: volume or the jump? — design

**Date:** 2026-10-04 · **Status:** design agreed in conversation (owner: "yes please"); rules for owner review before any result is seen · **Path:** architectural (study)

## Intent (agreed)

- **Question:** research 0004 found two kinds of day followed by weaker months: huge volume
  on an up day (−0.9 pts) and heavy-volume breakouts above the 200-day average (−1.2 pts).
  Both are big up days, and big one-day jumps often give back ground whatever the volume.
  **Holding the size of the day's jump constant, does the volume add anything?**
- **Why:** it decides whether the Unusual activity page may carry a caution line about
  "Huge volume" up days (owner's call afterwards), and how the Screener presents
  heavy-volume crossings.
- **Success:** `docs/research/0005-volume-or-jump.md` in plain language with a verdict per
  question, the charts page in the same style as 0004, and `bun run research:volume-or-jump`.
- **Out of scope:** any page change; new signals beyond the two questions.

## Data and universe (same as research 0003/0004)

Every company with EQ prices since 28 Sep 2016 (renames followed, delisted kept, ETFs out
via `allFundSymbols`); a stock-day counts when its median turnover over the last 20
sessions is ≥ ₹1 crore. Histories through `loadAdjustedHistory` (EQ only, as in 0004, so
the questions are asked on exactly 0004's days). Returns from the **next** session's close.

## The two questions

**Q1. Huge-volume jumps vs ordinary-volume jumps.**
- *Signal:* an up day with volume ≥ **5×** its previous-20-session mean.
- *Control:* an up day with volume < **1.5×** normal.
- Both need a day's move of at least **+3%** (smaller "jumps" aren't jumps).

**Q2. Heavy-volume breakouts vs light-volume breakouts.**
- *Signal:* adjusted close crosses above its 200-day SMA with volume ≥ **2×** normal.
- *Control:* the same cross on volume < **1.5×** normal.

**Matching (like with like).** Each signal day is compared only with control days that
share all of:
- the same **calendar month** (so both live through the same market),
- the same **move band** of the day's jump: +3–5%, +5–8%, +8–12%, +12% or more,
- the same **trading-size third** that day: the stock's median 20-session turnover ranked
  across all eligible stocks that day (low / middle / high third). This is the size measure,
  taken on the day itself: today's NSE size lists would leak the future into 2016–2022.

Returns are compared as **excess over the typical stock on the same day** (the day's median
eligible return), so mixing days inside a month can't let the market's move in.

A signal day with no control in its group is left out, and the count is reported.

## The comparison and the verdict (fixed before results)

- **Effect** = median excess return of signal days − median excess return of their matched
  controls, at **1 month (21 sessions)**; also shown at 1 week, 2 weeks, 3 and 6 months.
- **Luck check:** 1,000 seeded draws; each draw replaces every signal day with a random
  control from its own group. "Beats" = share of draws the signal beat (ties count half).
- **"Volume adds"** only if all of: discovery (2016–2022) has ≥ 30 matched signal days;
  strength ≥ **97.5**; |effect| ≥ **0.5 pts**, pointing the same way as the luck check; the
  same side at ≥ 3 of the other 4 spans; and **2023 onward confirms** (≥ 30 days, beat ≥ 95
  in the same direction, one-sided).
- **"The jump explains it"** if the effect is under 0.3 pts at 1 month in discovery
  **and** in 2023 onward.
- **"Not settled"** otherwise.

**Secondary (no verdict):** the same comparison adding **sector** to the groups, for the
Nifty Total Market stocks only (NSE's sector, as of today; sectors rarely change).

## Carried over from research 0004's review

- Volume thresholds allow 1e-9 (a 2× computed as 1.9999999 counts).
- Up / down days use the day's move ≥ +3% here, so no exact-zero comparison is involved;
  a day's move is null across a stretch outside EQ (5-day rule).

## Output

- The report: short answer per question in plain words, how to read it, results, caveats,
  method, what it means for the pages.
- A charts page (same style as 0004): (1) signal vs control gap at each span, per question;
  (2) the gap per move band; (3) 2016–22 vs 2023 onward.

## Checks

- Unit tests: move bands and size thirds on hand-worked inputs; matching groups only same
  month + band + third; a signal day with no control is dropped and counted; the luck check
  draws only within a group; thresholds at exactly 5× / 2× / +3% count.
- Spot check: one Q1 signal day equals a research 0004 signal-1 day.

## Documentation

The write-up and charts in `docs/research/`; a "Research 0005" row in
`docs/decisions/README.md`; TODO (caution line, Screener wording); README; CLAUDE.md commands.
