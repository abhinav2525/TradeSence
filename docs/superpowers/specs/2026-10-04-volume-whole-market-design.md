# Research 0004: does volume tell us anything across the whole market? — design

**Date:** 2026-10-04 · **Status:** design agreed in conversation (owner: "okay. go ahead"); rules for owner review before any result is seen · **Path:** architectural (study)

## Intent (agreed)

- **Question:** when a stock has an unusual *volume* day, did it then do better or worse
  than other stocks on the same days? Research 0002 asked this for the NIFTY 50 only and
  found nothing; big companies trade heavily every day, so the real test is the whole market.
- **Why:** if a signal holds, the Unusual activity page (decision 0024) can say what
  usually followed days like it, and the planned Top volume leaderboard (TODO) can carry it.
  If nothing holds, those pages stay facts-only.
- **Success:** `docs/research/0004-does-volume-predict-whole-market.md` in plain language,
  with Build / Maybe / Don't build per signal decided by the rules below, **plus a visual
  page** with three charts (owner's request), and a re-runnable `bun run research:volume-market`.
- **Out of scope:** any page change; intraday data; delivery (research 0003 covered it).

## Universe and data (same as research 0003)

- Every company with EQ prices since 28 Sep 2016, once under its latest symbol (renames
  followed), delisted included; **ETFs left out** (`allFundSymbols`: the committed list plus
  `fund_symbols`).
- Eligible stock-day: median turnover of the last 20 sessions ≥ ₹1 crore (`liquidFlags`),
  and the measure the signal needs exists.
- Histories through `loadAdjustedHistory`: prices ÷ `factors`, volume × `shareFactors`
  (splits and bonuses only), every window restarting at a gap (`segmentByGaps`).

## The six signals (textbook settings, never tuned)

| # | Signal | Fires on day D when |
|---|---|---|
| 1 | Huge volume, price up | volume ≥ **5×** its previous-20-session mean, and the adjusted close rose |
| 2 | Huge volume, price down | the same, and the adjusted close fell |
| 3 | Breakout on heavy volume | adjusted close crosses **above** its 200-day SMA (yesterday ≤, today >) with volume ≥ **2×** normal |
| 4 | Breakdown on heavy volume | crosses **below** its 200-day SMA with volume ≥ 2× normal |
| 5 | Buyers in control | Chaikin Money Flow (20) in its **top fifth** (cut points from discovery stock-days) |
| 6 | Quiet buying | 20-session adjusted close change < 0 **and** On-Balance Volume change > 0 |

- "Normal" volume = `windowMean` of the previous 20 sessions (≥ 15 present), the same
  definition as the Unusual activity page, so signal 1/2 days are exactly the page's
  "Huge volume" days that also moved up/down.
- The price move uses the page's rule: none when the previous EQ session is more than 5
  calendar days back (no move invented across a stretch outside EQ).
- SMA 200 is computed per stock on the adjusted closes (needs 200 sessions in the segment);
  a cross needs both days in the same segment. CMF and OBV reuse `cmf` / `obv` from
  research 0002 (they match TradingView).
- Episodes: per stock, firing days within 10 sessions are one episode (`episodeStarts`).

## Returns and the comparison (same as research 0003)

- Return = adjusted close on **D+1** → h sessions later (the signal is known only after the
  close), never across a gap. Verdict spans h ∈ {5, 10, 21, 63, 126}; **main span 21**.
- Each episode is compared with **random other eligible stocks on the same date**
  (`matchedLuck`, 1,000 seeded draws) and the baseline is the same yardstick
  (`matchedBaseline`), decision 0022.

## Verdict rules (fixed before results; identical to research 0003)

- **Build** only if all of: discovery (episodes starting 2016–2022) has ≥ 30 episodes;
  strength ≥ **97.5**; the median sits on the same side of the baseline at ≥ 3 of the other
  4 spans; the effect at 1 month is ≥ **0.5 points** and points the same way as the luck
  check; and the **2023-onward** episodes confirm it (≥ 30 episodes, beat ≥ 95 in the same
  direction).
- **Maybe:** same way at ≥ 3 spans in discovery, but not Build. **Don't build:** the rest.
- The write-up says 6 signals were tested, so one could pass the discovery bar by luck; the
  2023-onward check guards against that. It also says what "Maybe" means (not ruled out,
  not promising).

## Output: the report and three charts

1. **The answer at a glance:** one horizontal bar per signal, the 1-month effect vs other
   stocks on the same days, with the ±0.5-point cost lines drawn. Only bars that are
   Build get colour (`up` if better, `down` if worse); the rest are grey.
2. **Day by day after the signal:** for each signal, the median return of signal stocks
   and of the same-day baseline at 1, 3, 5, 10, 21, 42, 63 and 126 sessions, as two lines.
3. **Does it still hold today?** The 1-month effect for 2016–2022 next to 2023-onward, one
   pair of bars per signal.

The runner writes the numbers as JSON; the charts are drawn on a private web page (an
Artifact) following the dataviz rules, with hover values. The Markdown report carries the
same tables for the record.

## Checks

- Unit tests on hand-worked inputs: each signal fires at its threshold and not just below;
  a split inside a window fires nothing; a cross needs both days in one segment and 200
  sessions of history; the price-move gap rule; returns start at D+1.
- The runner re-uses the two-pass alignment check (`assertAligned`).
- Spot check after the run: one signal-1 day matches the Unusual activity table's Huge
  volume flag for that stock and date.

## Documentation

The research write-up; a "Research 0004" row in `docs/decisions/README.md`; TODO (what the
Unusual activity page and the leaderboard get from it); README function reference;
CLAUDE.md commands. A decision file only if a real problem or choice appears.
