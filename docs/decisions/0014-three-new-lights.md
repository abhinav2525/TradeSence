# 0014 — Three new Report Card lights: Right now, Bad days, In crashes

**Date:** 2026-10-02 · **Status:** done ·
Spec: `docs/superpowers/specs/2026-10-02-report-card-three-lights-design.md` ·
Plan: `docs/superpowers/plans/2026-10-02-report-card-three-lights.md`

## Problem

The Report Card's five lights (decision 0011) didn't answer three things a beginner asks
before buying:

1. **Is it unusually jumpy right now?**
2. **When the market has a bad day, does it fall harder?**
3. **What happened to it in past market crashes?**

The owner asked for these as **lights**, using **proven formulas only**, with a way to
**show the numbers are right**.

## Options

| Option | Good | Bad |
|---|---|---|
| **Three new lights on the card** ✅ (owner's choice) | One glance, same as the other five | The card grows to 8 lights; every cut-off is a judgement call that must be written down |
| Plain numbers, no lights | No cut-offs to defend | Easy to skip; inconsistent with the rest of the card |
| Merge "Right now" into the risk calculator | Fewer cards | Mixes a "today" reading with a "history" range |
| "Bad days" light on **beta** instead of **down capture** | Beta is the famous number | Beta treats up and down days alike; a beginner's worry is the down days. Beta is still shown, small |

## Decision

| Light | Question | Measure | 🟢 | 🟡 | 🔴 | No light when |
|---|---|---|---|---|---|---|
| **Right now** | Unusually jumpy now? | Recent volatility (RiskMetrics, λ = 0.94) ÷ its own last-year volatility | ≤ 1.0× | ≤ 1.5× | > 1.5× | under a year (250) of daily moves |
| **Bad days** | Falls harder on bad days? | **Down capture**: its average move on NIFTY-down days ÷ the NIFTY's, last 250 sessions | ≤ 100% | ≤ 120% | > 120% | under 120 sessions alongside the NIFTY |
| **In crashes** | How did it do in crashes? | Median further fall in the 3 months after each crash began ÷ the NIFTY's | ≤ 1.2× | ≤ 1.8× | > 1.8× | under 3 completed crashes, or the NIFTY didn't fall |

**Why these cut-offs:**
- **1.0 / 1.5 for Right now**: 1.0 means "as usual". 1.5× its normal swing is a clearly
  turbulent spell, without firing on ordinary noise.
- **100% / 120% for Bad days**: 100% means "falls as much as the market". 120% matches the
  1.2× "noticeably worse than the NIFTY" line used by Bumpiness and Worst fall.
- **1.2 / 1.8 for In crashes**: the same ratio cut-offs as Bumpiness and Worst fall, so
  "1.5×" means the same thing everywhere on the card.

All of these live in one place: `THRESHOLDS` in `src/indicators/risk.ts`.

**What each light shows:**
- **Right now** shows a normal week in % and in ₹ on ₹10,000 (σ × √5). It also shows **how
  often real weeks actually stayed inside that range** over the last 2 years, judged with
  the range known *at the time*, so there's no hindsight. For KOTAKBANK, 7 in 10 of 495
  weeks stayed inside; about 68% is expected if the model fits. It is shown as measured,
  never adjusted.
- **Bad days** says "When the NIFTY falls 1%, it usually falls 0.8%", plus up capture and
  beta.
- **In crashes**:
  - A crash starts on a day when fewer than 20% of NIFTY 50 stocks are above their 200-day
    average.
  - Days within 10 sessions are one crash. That is research 0001's exact rule; the code
    (`findEpisodes`) now lives in one shared file, so the study and the card can never
    count crashes differently.
  - A crash counts only once 3 months have passed. Today's (from 1 Oct 2026) is mentioned,
    not counted.
  - A table under the calculator lists every crash.

Every number comes from the adjusted daily moves already used everywhere: splits, bonuses,
demergers and renames are handled.

## Problems met while building it

- **The plan's test said a steady +0.5% a day has zero volatility.** It doesn't, in
  RiskMetrics: the method assumes moves average zero and blends in each move *squared*, so
  a steady +0.5% reads as ±0.5%. That is the published definition. The test now checks
  this, and the code follows the spec.
- **"Fell a median 3% in 5 crashes" read like the whole crash.** COVID was −30%. The
  measure is the fall *after* breadth had already collapsed, which is what the spec defines
  and what matters to someone looking at the screen on that day. The wording now says "fell
  a further 3% at the median after each one began", and the Learn page lists reading it as
  the whole crash as a common mistake.
- **The audit's breadth rebuild was placed before the variables it uses** (a type error).
  It was moved; the logic is unchanged.

## Checks

- **Tests (written first):**
  - a stock moving exactly 2× the NIFTY gives beta 2, capture 200%;
  - the NIFTY against itself gives 1 / 100%;
  - RiskMetrics matches a hand calculation;
  - the hit rate uses only the range known at the start of each week;
  - crashes merge within 10 sessions, an unfinished crash is not counted, a gap in the data
    skips a crash;
  - a past date inside a crash counts nothing from after it;
  - a raw split changes neither volatility nor beta;
  - short histories get no light.
  - Suite: 298 tests pass.
- **Independent audit** (`bun run audit:report-card`, decision 0013):
  - It recomputes every new number from raw prices, rebuilding breadth itself.
  - **0 mismatches** on 1 Oct 2026, 23 Mar 2020, 17 Jun 2022 and 4 Jun 2024 (1,250 numbers
    per date).
  - Proved sensitive by breaking the app on purpose: λ = 0.95 gave 128 mismatches; a 62-day
    crash window gave 1. Both were caught, then reverted.
- **Browser:** 8 lights (four per row on a laptop, two on a phone, no sideways scroll); the
  ⓘ explanations; JIOFIN shows "only 2 completed crashes… not enough to judge"; on
  23 Mar 2020 the March crash is "counts once 3 months have passed".
- **On real data (1 Oct 2026):**

  | Stock | Beta | Down / up capture | Right now | Crash ratio |
  |---|---|---|---|---|
  | KOTAKBANK | 0.98 | 81% / 100% | 0.93× | 1.54× |
  | RELIANCE | 0.97 | 116% / 110% | 0.95× | 2.08× |
  | INFY | 0.65 | 89% / 60% | 1.01× | 3.86× |

- **TradingView: not compared yet.** Its data service refused every request on 2 Oct 2026
  (rate limit, HTTP 429), so no claim of matching TradingView is made. Do it with the
  numbers above (TODO). Expect differences of definition: TradingView's beta may use a
  different window, weekly returns or another benchmark. Explain any gap; don't hide it.

## What the numbers don't prove

- **About 5 crashes since 2020** is a small sample. The card always says how many.
- **The weekly range** is a typical range, not a limit. About 1 week in 3 should end outside
  it, which is why the card shows how often weeks actually stayed inside.
- **Lights are relative to the NIFTY 50 or to the stock's own past.** They describe
  behaviour, not future returns, and they are not advice.

## Revisit when

- **A crash completes** (3 months after 1 Oct 2026): the counts and lights change on their
  own; check that they read sensibly.
- **TradingView is reachable**: compare beta for these three stocks and record it here.
- **Going whole-market**: thresholds were chosen for NIFTY 50 stocks; small caps may need
  their own.
