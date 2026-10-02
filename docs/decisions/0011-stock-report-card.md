# 0011 — The Stock Report Card + Risk Calculator

**Date:** 2026-10-02 · **Status:** done ·
Spec: `docs/superpowers/specs/2026-10-02-stock-report-card-design.md` ·
Plan: `docs/superpowers/plans/2026-10-02-stock-report-card.md`

## Problem

A beginner looking at one stock needs to know **what could go wrong** before buying:
whether it's in an uptrend, whether it's stronger than the market, how bumpy it is, how
badly it has fallen before and how long recovery took, whether it trades enough to
get in and out, and what a bad stretch would cost **in rupees**. The app had none of this
for individual stocks.

## Options

| Option | Good | Bad |
|---|---|---|
| **Compute every page view from the stored adjusted daily moves** (`change_pct`) ✅ | No new pipeline; can't disagree with the rest of the app; works "as of" any date; milliseconds per stock | Recomputed each time (cheap: ~2,500 rows) |
| Precompute a `stock_risk` table nightly | Faster pages | Another pipeline step and another copy of the numbers; "as of today" only |
| Compute in SQL with window functions | Fewer round trips | Rolling multi-horizon stats and recovery times are awkward and hard to test in SQL |

## Decision

`/stock/[symbol]` for every NIFTY 50 member since 2020 (current and past; the owner chose
NIFTY 50 for v1). It shows five checks with traffic lights, a risk calculator, a price chart,
a "how far below its high" chart and corporate events. It's linked from every symbol in the
app, the `/stock` list, the sidebar ("Report card") and the `r` key.

**All numbers come from one adjusted price line**, rebuilt by chaining
`daily_indicators.change_pct`. That's the daily move already adjusted for splits, bonuses and
demergers and joined across renames (decisions 0002–0004, 0008). So KOTAKBANK's 1:5 split is
not a crash, and ETERNAL's history includes its ZOMATO years. A missing move starts a new
segment; nothing is measured across a hole in the data. Only data on or before the chosen
date is used, so there's no hindsight.

**One new stored column:** `daily_indicators.turnover` (₹ that session, joined across
renames), for liquidity. NSE's turnover is in rupees in both file formats (checked:
turnover ÷ (close × volume) ≈ 1.00).

### The lights (one constants block: `THRESHOLDS` in `src/indicators/risk.ts`)

| Check | Measure | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|
| Trend | Close vs its 50- and 200-day SMA | above both | above one | below both |
| Strength | 6-month return, ranked among the members on that day | ≥ 67th pct | 34th–66th | ≤ 33rd |
| Bumpiness | Std. dev. of daily moves (last 250) ÷ NIFTY 50's | ≤ 1.2× | ≤ 1.8× | > 1.8× |
| Worst fall | Max drawdown ÷ NIFTY 50's over the same years | ≤ 1.2× | ≤ 1.8× | > 1.8× |
| Liquidity | Median daily turnover, last 20 sessions | ≥ ₹100 cr | ≥ ₹10 cr | < ₹10 cr |

- **Relative to the NIFTY 50, not absolute.** Otherwise the COVID crash would paint every
  stock red. "Worst fall" compares with the NIFTY's worst over **the same years**, so a 2021
  listing (ETERNAL) is compared with 2021-onward NIFTY (−17%), not with 2020's crash.
- **Liquidity is absolute** (₹ crore) and is green for every NIFTY 50 member today. The
  thresholds exist for the future whole-market version (vision note).
- **No score, no verdict.** The summary only counts lights ("4 green · 1 amber · 0 red"), in
  keeping with SEBI rules on advice and the app's "teach, don't tip" rule.
- **Amber has no colour token** in the design system, so it's drawn as a neutral ring, and
  every light carries its word ("Amber"). Colour is never the only signal.

### The risk calculator

For the reader's horizon (1 week / 1 month / 3 months / 1 year = 5 / 21 / 63 / 250
sessions; default 1 month): every overlapping stretch of that length in the history. It
shows the **1-in-10** outcome (10th percentile), the **worst** (with its start date), the
**share that ended lower**, the NIFTY 50's 1-in-10 for comparison, and a histogram. The
amount (₹, default 10,000) is applied in the browser, so typing never reloads; the horizon
goes in the URL (`h=`) without a reload. A horizon needs **at least 3× its length** of
history, or it says "not enough history yet". It always carries the caveat *"Past ranges,
not a forecast. Losses can be larger than anything in this history."*

## Why

- **Approach A** is the simplest, has no new pipeline, and cannot drift from Breadth,
  Advance/Decline and the Screener, because it reads the same adjusted moves.
- **Relative lights** keep the card meaningful in crashes and for recent listings.
- **Rupee ranges instead of a score** turn abstract risk into something a beginner can feel,
  without telling them what to do.

## Problems met while building it

- **Exact float comparisons in the plan's tests** (100 × 1.1 = 110.00000000000001) were
  switched to "close to".
- **A 2003 rename** showed in KOTAKBANK's events, 13 years before the card's history.
  Events are now limited to the history the card covers.
- **"92th"** became "92nd" (`ordinal()`).
- **The date picker had no upper bound**, so `lastDate` was added to the report.

## Found by the independent review (fixed)

A fresh reviewer checked the whole change. It found no critical problems and confirmed
the maths, no hindsight and the URL safety. Fixed, each with a test that failed first:

- **"Every month" was really every overlapping month-long *stretch***: ten years hold
  ~2,460 of them, not 120 months. The calculator now says "overlapping month-long
  stretches (2,461 of them)", so nobody mistakes overlap for independent evidence.
- **The amount was silently clamped**: ₹500 showed ₹1,000 figures. Now the figures are for
  exactly what's typed, and an empty box asks for an amount.
- **Worst fall had no minimum history**: JIOFIN after 12 sessions read "red, 6.9×". It now
  needs a year (250 sessions), like the other checks need theirs.
- **Arrow and 1/2/3 keys on the card**: ← → now step that stock's sessions (keeping the
  horizon), and 1/2/3 do nothing instead of jumping to the list. The key routing is now a
  tested pure function (`hotkey-target.ts`).
- **No "not advice" line near the lights**: added ("They are not advice to buy or sell.").
- **The split test had no split**: replaced with one that has a raw ÷5 drop. It was proved
  to fail when the adjustment is deliberately broken.

Deferred minor polish is listed in the branch summary: ranking can read "100%", the
membership line ignores the chosen date, the horizon resets when stepping after a toggle,
no median or peak/recovery annotation yet, and events aren't de-duplicated across old symbols.

## Checks

- **Against TradingView (memory: verify before claiming).** M&M's worst fall: the card says
  −73% (29 Aug 2018 → 24 Mar 2020, about 44 months to recover). TradingView's weekly closes:
  ₹973.70 (week of 3 Sep 2018) → ₹280.70 (week of 30 Mar 2020) = −71.2%, back above the
  peak in the week of 30 May 2022. The 2-point gap is expected: weekly closes can't see the
  24 March daily low.
- **On real data:** KOTAKBANK's worst fall is −36.5% (COVID), not the −80% split.
  YESBANK: −97%, not recovered, "Left the NIFTY 50 on 27 Mar 2020". ETERNAL: history from
  23 Jul 2021 with "Renamed from ZOMATO".
- **In the browser** (headless Chrome): no split cliff in KOTAKBANK's charts; ₹50,000 over
  1 year gives "1 in 10 years lost more than −₹4,649" and the worst year −₹11,568; switching
  the horizon updates the URL without a reload; symbol links work from the Breadth tables;
  the `/stock` filter works.
- **URLs:** real symbols (including `M&M`, `BAJAJ-AUTO`, lower case) return 200; unknown or
  path-traversal symbols return 404; a malformed escape returns 400 (Next.js), never an error.

## Revisit when

- **Going whole-market:** `turnover`, `change_pct` and the averages are only computed for
  index members. The card itself takes any symbol with history.
- **Delivery % or valuation (P/E)** are added: both fit as extra checks.
- **A light feels wrong for a stock:** change `THRESHOLDS` in one place and record why here.
