# Research 0002: does volume tell us anything on the NIFTY 50? — design

**Date:** 2026-10-03 · **Status:** agreed in conversation; owner asked to go straight to the plan · **Path:** architectural (study)

## Intent (agreed)

- **Why:** the owner wants volume-and-price indicators in the app. The project's rule is
  to test before building (research 0001 found "breadth over 80%" meant nothing), so the
  first of four projects is a study. Order agreed: **D (this study) → A (market-wide
  volume page/alarm) → B (Report Card volume light) → C (Screener volume-confirmed
  breakouts)**. Each later project goes ahead only for indicators this study supports.
- **Success:** `docs/research/0002-does-volume-predict.md` in research 0001's plain style,
  ending in a Build / Maybe / Don't build verdict per indicator, decided by rules fixed
  here before any result is seen. A re-runnable `bun run research:volume`.
- **Owner's choices:** test everything first; judge on both short (1–2 weeks) and longer
  (1–6 months) spans, shown side by side.
- **Data:** daily totals only (no intraday; the owner asked, and daily is what every
  indicator here is defined on). OHLCV in `daily_prices` since 2016; membership
  point-in-time from 2020.
- **Out of scope:** any page, light or table change; intraday data; delivery %.

## Approach

A research module of pure, tested functions plus a CLI that prints Markdown, like
research 0001. Nothing stored. Reuse the split/bonus/demerger adjustment and rename
lineage of `computeIndicators` by extracting its per-symbol loader into a shared function
(`src/indicators/history.ts`); `computeIndicators` uses it unchanged in behaviour.

Rejected: storing indicators nightly (premature); a notebook in another language
(could not share the tested adjustment and episode code).

## Indicators (textbook settings, never tuned)

Computed on the adjusted series: prices ÷ adjustment factor, volume × share factor
(splits/bonuses only, never demergers). Each restarts at a gap (`segmentByGaps`).

- **Chaikin Money Flow, 20:** MFM = ((C − L) − (H − C)) ÷ (H − L), 0 when H = L;
  CMF = Σ(MFM·V, 20) ÷ Σ(V, 20); null until 20 sessions or when Σ V = 0.
- **Money Flow Index, 14:** TP = (H + L + C) ÷ 3; raw flow = TP·V; positive when TP > the
  previous TP, negative when lower, neither when equal; MFI = 100 − 100 ÷ (1 + P ÷ N) over
  14 sessions; 100 when N = 0 and P > 0; 50 when both are 0; null until 14 flows.
- **On-Balance Volume:** running total from 0 at each segment start; + V on an up close,
  − V on a down close, unchanged on an equal close.
- **Up-volume share (market):** per session, over that day's NIFTY 50 members:
  up = Σ turnover where `change_pct` > 0, down = Σ turnover where < 0;
  share = up ÷ (up + down) × 100 (null when both 0). Rupee turnover, not shares: share
  counts differ by price level, and turnover isn't moved by splits. 10-day version =
  mean of the last 10 sessions' shares (within a segment).

## Tests and signals

**Market-wide (outcome: NIFTY 50 index forward return; main horizon 63 sessions):**
1. Panic day: share ≤ 10 (≥ 90% of value into falling stocks).
2. Stampede day: share ≥ 90.
3. Panic then stampede: a stampede day within 10 sessions after a panic day (episode
   starts on the stampede day).
4. 10-day share in its top fifth; 5. in its bottom fifth (fifth cut points from all
   sessions).
Plus a descriptive table: median forward return by fifth of the 10-day share.

**Per stock (outcome: stock's forward return − NIFTY 50's over the same sessions; main
horizon 21 sessions), counted only on days the stock was a member, from 2020:**
6. CMF in its top fifth; 7. bottom fifth (cut points from all member-days).
8. MFI < 20; 9. MFI > 80.
10. Quiet buying: 20-session adjusted close change < 0 and OBV change > 0.
11. Quiet selling: the reverse.
12. Cross above the 200-day SMA on heavy volume (`vol_ratio` ≥ 2);
13. on light volume (< 1.5); 14. cross below on heavy; 15. cross below on light.
A cross: yesterday's close ≤ its 200-day SMA and today's above (or the reverse), both
non-null, no gap between (`readSymbol`'s rule).
Plus a descriptive table: median excess return by fifth of CMF.

**Episodes:** per series (per stock for per-stock tests), qualifying days within
`MERGE_GAP` (10) sessions are one episode, from `findEpisodeSpans`.

**Horizons:** 5, 10, 21, 63, 126 sessions. A return past the last session or across a gap
is left out.

## Verdict rules (fixed before results)

- **Luck check:** draw the same number of random eligible days (market: sessions; per
  stock: member-days) 1,000 times with a seeded generator; `beat` = % of draws whose
  median is below the signal's median. Direction = "better" if beat ≥ 50, else "worse",
  and strength = max(beat, 100 − beat).
- **The bar is two-sided:** a signal may point either way, so "only 1 in 20 random picks
  would be this unusual" means strength ≥ **97.5** (2.5% in each tail). A one-sided 95
  would let about 10% of useless signals through (amended while planning).
- **Build:** episodes ≥ 8 (market) or ≥ 30 (per stock), strength ≥ 97.5 at the main horizon,
  and the signal's median is on the same side of the ordinary-day median at ≥ 3 of the
  other 4 horizons.
- **Maybe:** same side at ≥ 3 of 4 other horizons but not Build.
- **Don't build:** anything else.
- The write-up states that ~15 tests are run, so about one could pass by luck; a lone
  narrow pass is reported as Maybe. Per-stock results also show the number of distinct
  calendar months their episodes start in.

## Checks

- Unit tests for every formula on hand-worked inputs; a split inside a 20-day window
  doesn't move CMF; exactly 90% counts; the luck check is reproducible and a signal drawn
  from the pool itself passes ≈ 5% of the time; no return across a gap.
- `computeIndicators`' existing tests pass unchanged after the loader extraction.
- TradingView comparison of CMF(20) and MFI(14) for two stocks on the latest session
  (via the TradingView connector), noted in the write-up.

## Documentation

`docs/research/0002-does-volume-predict.md`; a "Research 0002" row in
`docs/decisions/README.md`; TODO (which of A, B, C go ahead); README function reference;
root CLAUDE.md commands list (`bun run research:volume`). A decision file only if a real
problem or choice appears (e.g. TradingView disagrees).
