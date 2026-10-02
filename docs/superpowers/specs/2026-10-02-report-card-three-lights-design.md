# Report Card: three new lights (Right now, Bad days, In crashes) — design

**Date:** 2026-10-02 · **Status:** awaiting owner review · **Path:** architectural

## Intent (agreed)

- **Why:** a beginner choosing a stock needs to know three more things the card doesn't
  say yet: *is it unusually jumpy right now?*, *does it fall harder than the market on bad
  days?*, and *what happened to it in past market crashes?*
- **Success:** each question gets a traffic light and one plain sentence, from published,
  standard formulas, and every number is proven by the independent audit (0 mismatches).
- **Owner's choices:** the three become **lights** (the card goes from 5 to 8); proven
  formulas only; we must be able to show the numbers are right.
- **Constraints (unchanged from decision 0011):** NIFTY 50 members only; education, not
  tips: no score, no verdict, the "not advice" line stays; computed from the stored adjusted
  daily moves (`change_pct`), so splits, bonuses, demergers and renames are already handled;
  only data on or before the chosen date (no hindsight).

## Approach

Same as the existing lights (decision 0011, approach A): compute on every page view in
`stockReport`, from the adjusted line it already builds. No new table, no nightly step.
Pure functions in `src/indicators/risk.ts` (or a sibling file if it grows too long); the
query only assembles them.

Rejected: precomputing nightly (another pipeline step, "as of today" only, no gain at
milliseconds per stock).

## Light 6 — Right now ("Is it unusually jumpy right now?")

- **Recent volatility, σₜ** (RiskMetrics, J.P. Morgan 1996): an exponentially weighted
  average of squared daily moves, λ = 0.94:
  `σ²ₜ = 0.94 · σ²ₜ₋₁ + 0.06 · r²ₜ`, with r the adjusted daily move in %.
  Seeded with the sample variance of the segment's first 20 moves; restarts at each segment
  (a gap in the data, `segmentByGaps`), like every other measure.
- **Its normal:** the existing `dailyVolatility` (sample std. dev. of the last 250 moves).
- **Light:** ratio σₜ ÷ normal. 🟢 ≤ 1.0 · 🟡 ≤ 1.5 · 🔴 > 1.5. No light under 250 moves.
- **Sentence:** "A normal week: up or down about 4.1% (about ₹410 on ₹10,000). Calmer than
  its usual year." Weekly range = σₜ · √5. "Calmer / jumpier than its usual year" from the
  ratio (≤ 1 / > 1).
- **Honesty line (the range checks itself):** over the last 500 sessions, for every day t
  with t + 5 in the same segment and on or before the chosen date: was |5-session move|
  ≤ σₜ · √5, using σₜ known **at day t**? "In the last 2 years, 7 in 10 week-long stretches
  stayed inside this range (of 495)." About 68% is expected if the model fits; shown as
  measured, never adjusted. Omitted under 100 such stretches.

## Light 7 — Bad days ("When the market falls, does it fall harder?")

- **Data:** the last 250 sessions where both the stock's move and the NIFTY 50's move exist,
  matched by date. No light under 120 such sessions.
- **Down capture** = mean(stock move on NIFTY-down days) ÷ mean(NIFTY move on those days)
  × 100. **Up capture** the same on NIFTY-up days. Days the NIFTY was exactly flat count in
  neither (|move| ≤ `NOISE_PCT`).
- **Beta** = Cov(stock, NIFTY) ÷ Var(NIFTY) (sample), shown small as a number.
- **Light:** on down capture. 🟢 ≤ 100% · 🟡 ≤ 120% · 🔴 > 120%.
- **Sentence:** "When the NIFTY falls 1%, it usually falls 1.3%. When it rises 1%, this rises
  0.9%." (= capture ÷ 100.) Small: "Beta 1.12 over the last 250 sessions."

## Light 8 — In crashes ("What happened in past market crashes?")

- **A crash episode** = 200-SMA breadth of the NIFTY 50 (point-in-time membership,
  `breadthSeries("sma200")`) below 20%, found with research 0001's `findEpisodes` and its
  merge gap (10 sessions). `findEpisodes` and `MERGE_GAP` move out of `src/research/` to a
  shared module so the study and the card can never disagree.
- **Counted only when complete:** an episode is used once 63 sessions (3 months) have passed
  after its start, on or before the chosen date. A newer one is mentioned, not counted:
  "A new episode began on 1 Oct 2026; it counts once 3 months have passed."
- **Per episode** (from the close on its start day, on the adjusted line):
  - stock's fall = lowest level in the next 63 sessions ÷ start level − 1 (0 if it never
    went below the start);
  - the NIFTY 50's fall, the same on its closes;
  - back 6 months later? level 126 sessions after the start ≥ start level ("not yet" if
    126 sessions haven't passed);
  - skipped if the stock has no data at the start or the 63 sessions cross a segment break.
- **Light:** median stock fall ÷ median NIFTY fall. 🟢 ≤ 1.2× · 🟡 ≤ 1.8× · 🔴 > 1.8× (the
  same cut-offs as Bumpiness and Worst fall). No light under 3 counted episodes, or if the
  NIFTY's median fall is 0.
- **Sentence:** "In 5 crashes since 2020 it fell a median 12% (NIFTY 9%) and was back 6
  months later in 4 of 5."
- **Card:** a small table below the calculator, "In past market crashes": start date, stock
  fall, NIFTY fall, back in 6 months (Yes / No / Not yet). True minus signs; latest first.

## Thresholds

All in `THRESHOLDS` (`src/indicators/risk.ts`), each with its reason in decision 0014:
`nowVol { green: 1.0, amber: 1.5 }`, `downCapture { green: 100, amber: 120 }`, crashes reuse
`ratio { green: 1.2, amber: 1.8 }`, `crashMinEpisodes: 3`, plus `EWMA_LAMBDA = 0.94`,
`CAPTURE_SESSIONS = 250`, `CAPTURE_MIN = 120`, `CRASH_FALL_SESSIONS = 63`,
`CRASH_BACK_SESSIONS = 126`.

## Screen

- `StockChecks`: eight cards (grid of four from `lg`, two below); labels "Right now", "Bad
  days", "In crashes", each with an ⓘ (`<Term>`) and its sentence. `LightSummary` counts all
  eight. Colour is never the only signal (each light keeps its word).
- New card "In past market crashes" (the episode table) under the risk calculator.
- Glossary entries (topic Risk): `right-now`, `bad-days` (covers capture and beta),
  `crash-episodes`, each with `liveExample` sentences, and Learn pages via the existing
  system. Every new number gets its glossary entry before it ships (CLAUDE.md rule).

## Errors and edge cases

- Short history or missing NIFTY data: that light is null ("Not enough history yet"), never
  a fabricated colour; the summary counts only lights that exist.
- Every comparison of returns uses `NOISE_PCT` (decision 0013).
- A past date (`?date=`) uses only data up to that date: σₜ, the capture window and the
  counted episodes all stop there.

## Testing

- **Hand-worked unit tests:** a stock that moves exactly 2× the NIFTY every day gives beta
  2.00, up and down capture 200%; one that equals the NIFTY gives 1.00 / 100%; a constant
  move gives σ = 0; an EWMA on a known short series matches a hand calculation; the
  hit-rate uses σ from day t (a test where using σ from t + 5 would give a different
  answer); `findEpisodes` behaviour unchanged after the move (existing tests).
- **Rules that must hold:** doubling every move doubles σ and the range and leaves beta 1
  vs itself; crash episodes still under way are never counted.
- **Report Card tests** (test DB): each light green/amber/red at its boundary; null with
  short history; the episode table with a seeded breadth collapse.
- **Independent audit:** `audit:report-card` recomputes σₜ, its ratio, the hit rate, up/down
  capture, beta, the counted episodes and their falls from raw prices; 0 mismatches on
  the four audit dates of decision 0013.
- **Outside reference:** compare beta for 3 stocks with TradingView via the MCP (record
  what TradingView's definition is; differences in window or weekly vs daily are explained,
  not hidden) in decision 0014.
- **Browser check:** the eight lights at 1440 px and 390 px; the crash table; ⓘ on the new
  labels.

## Out of scope (v1)

12-1 momentum, 52-week high, signal track records, factor leaderboard, diversification,
sector strength (all in TODO). Changing the five existing lights.

## Documentation

`docs/decisions/0014-three-new-lights.md` (problem, options, decision, why, thresholds and
their reasons, checks, TradingView comparison); README function reference; CLAUDE.md
Commands unchanged; TODO updated.
