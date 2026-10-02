# 0004 — Adjust moving averages for demergers

**Date:** 2026-10-02 · **Status:** done

## Problem

Found right after the rename fix ([0003](0003-renamed-symbols-lose-history.md)). TMPV is
TATAMOTORS renamed, and its newly joined history contains **2025-10-14**, when Tata
Motors demerged its commercial-vehicles business into a separate company (TMCV). The
price fell from ₹660.75 to ₹395.45 overnight, but shareholders lost nothing: they
received TMCV shares for the difference. The jump check flagged it.

A demerger is like a split: the price drops, but the investment is worth the same.
Leaving it unadjusted drags the averages up the same way a split does. TMPV's 200 EMA
came out at ₹372.7 instead of about ₹346.7.

Four NIFTY 50 members have had one, and **none had ever been adjusted**:

| Member | Ex-date | Spun off | Drop |
|---|---|---|---|
| RELIANCE | 2023-07-20 | Jio Financial | −8% |
| ITC | 2025-01-06 | ITC Hotels | −8% |
| TMPV (Tata Motors) | 2025-10-14 | Commercial vehicles | −40% |
| HINDUNILVR | 2025-12-05 | Ice cream business | −5% |

**A mistake corrected.** Decision 0002 said we leave demergers alone "matching
TradingView". That was wrong: TradingView **does** adjust demergers. It was an
assumption that was never checked; this time it was checked against TradingView's
own data (below).

**Why it isn't just another split.** NSE's corporate-actions record says only
"Demerger" (99 times since 2016, in 5 wordings), with no ratio. The bhavcopy doesn't
carry one either: on the ex-date `prev_close` is the old unadjusted price.

## Options

| Option | Good | Bad |
|---|---|---|
| **Work the ratio out from prices** ✅ | Automatic for every future demerger; no new source | Depends on the ex-date's opening price being a fair one |
| Enter each company's official cost-split ratio by hand | Matches the tax ratio | Manual for every future demerger, and **doesn't** match TradingView (see below) |
| Restart the averages at a demerger | Simple | The stock drops out of breadth for ~200 days; doesn't match TradingView |
| Leave it | Nothing to do | TMPV's 200 EMA ~7.5% too high; small errors for the other three |

The owner chose: **work it out from prices.**

## Decision

Factor = **last close before the ex-date ÷ opening price on the ex-date**
(`demergerFactor` in `src/indicators/adjust.ts`). On a demerger's ex-date, NSE holds a
special pre-open session to set a price for what remains of the company. So the
opening price reflects the business that left, without that day's ordinary trading.

- `classifyAction` recognises all 5 wordings as `kind = 'demerger'`, with factor 1
  stored ("nothing from text"). The real factor is worked out when averages are
  computed, from the same lineage-stitched prices, so a demerger before a rename
  (TATAMOTORS → TMPV) works.
- It refuses to guess: no trade before the ex-date, no trade within 7 days after, or an
  open **at or above** the last close (a demerger hands value out, so the price must
  fall) → no adjustment, and the 30% jump check reports a large move instead.
- A demerger combined with a split or bonus in one record is `unparsed`, never guessed.

## Why

**It is exactly what TradingView does.** Checked against TradingView's own adjusted
history:

| Event | Ours | TradingView | Official cost split |
|---|---|---|---|
| RELIANCE 2023 (keeps) | **0.9079** | **0.9079** | ~0.953 |
| TMPV 2025 (keeps) | 0.6054 | 0.6037 | — |

For RELIANCE the price method matches TradingView to four decimals, and the official
tax ratio does not. Since TradingView is the reference the owner checks against, the
price method is the right one. TMPV differs by 0.3%, probably a slightly different
opening price.

Plus the usual reasons: automatic, no new data source, raw prices untouched, and
fixing a bad case means re-running `bun run indicators`.

## Result (2026-10-02)

- **0 unexplained jumps** across all 50 members and ten years, with renames now included.
- TMPV 200 EMA: ₹372.7 → **₹346.8** (TradingView-style: ₹346.7).
- Factors: RELIANCE 1.1015, ITC 1.0571, TMPV 1.6519, HINDUNILVR 1.0166.
- Today's counts unchanged: 4 / 8 / 7 above the 50 SMA / 200 SMA / 200 EMA.

## Revisit when

- **A demerger opens at a strange price** (very thin special session). The jump check
  will not notice a small error. If a member's average looks off right after a
  demerger, compare it with TradingView.
- **A demerger record comes combined with a split or bonus.** It is stored as
  `unparsed` and shows up as a `WARNING` in the nightly log.
