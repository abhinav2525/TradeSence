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

## Found by the independent review (fixed)

- **A made-up price move.** HEGAM on 22 Sep 2026 showed **−68%**: it traded in series BE from
  7 to 21 Sep around a demerger, so "the previous day" was an EQ close from 4 Sep, before the
  demerger, which couldn't be priced. Now no move is shown when the previous EQ session is
  more than 5 calendar days back (the longest normal NSE break is a 4-day weekend). The
  reviewer suggested anything beyond ±20% was an artefact; that's not so: stocks in the
  derivatives segment have no daily price band, and the 56 rows still beyond ±25% are real
  (ZEEL 23 Jan 2024 −32.6% when the Sony merger was called off; INDUSINDBK 11 Mar 2025; the
  4 Jun 2024 election result; POLICYBZR 24 Sep 2026 −36%, checked on TradingView: it closed at
  its low on 27 million shares against ~2 million usual). The same BE stretch also stretches
  "its own last 20 sessions" across the series switch; accepted, since it can only make a
  normal day look less unusual, never invent a spike.
- **New ETFs would have appeared.** The committed fund list never updated. Now a table,
  `fund_symbols`, is topped up every night from that session's bhavcopy (ISIN "INF…"), and
  the rebuild leaves out both. A test now checks the rebuild itself leaves a fund out.
- **A value a hair under a threshold.** A mean of whole shares times a bonus factor can come
  out at 4.999999999999999 for an exact 5×; thresholds now allow 1e-9 (CLAUDE.md: never
  compare computed numbers exactly). The test uses a case found by search.
- **Links:** any stock that has a Report Card (ever a NIFTY 50 member since 2020) links to it,
  not only members on the day viewed. **Wording:** "1 NIFTY 50 member" in the singular; the
  Delivery % glossary example now uses INFY's real 1 Oct 2026 figures. **Phones:** the Price
  column keeps the card's edge padding.
- Not done: a separate glossary term for "× normal" (the two ratio columns point at Big
  keeping and Huge volume, which define it); cosmetic glossary formatting; running the
  page's queries in parallel; chip/tab ARIA roles, which Screener shares (to fix app-wide).

## Revisit when

- Report Cards exist for every stock: link every row.
- Nightly alerts are built: the day's list is a natural thing to send.
- The owner finds the list too long or too short: the thresholds are constants in
  `src/indicators/activity.ts` (`KEPT_X`, `VOLUME_X`, `JUMP_PTS`); re-measure after a change.
