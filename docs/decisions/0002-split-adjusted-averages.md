# 0002 — Adjust moving averages for splits and bonuses

**Date:** 2026-10-02 · **Status:** done

## Problem

TradingView showed KOTAKBANK **above** its 200 SMA and 200 EMA. Our dashboard showed it
**below**.

| 2026-10-01 | Close | 200 SMA | 200 EMA |
|---|---|---|---|
| Ours, before the fix | ₹418.35 | ₹607.73 | ₹685.75 |
| After the fix (matches TradingView) | ₹418.35 | ₹400.05 | ₹400.26 |

**Cause.** KOTAKBANK split 1:5 on 2026-01-14: the price went from ₹2,132.60 to ₹421
overnight with nothing actually happening to the company. NSE's bhavcopy publishes
**raw, unadjusted** prices, so our 200-day average still contained ~20 days at
₹2,100 and was dragged far above today's price. TradingView adjusts history for
splits, so it was right and we were wrong. The moving-average formulas themselves
were correct.

**It was not just KOTAKBANK.** The members had **36** splits/bonuses since 2016.
At the time of the fix it bent today's readings badly for several stocks — for
example the 200 EMA was 30% too high for BAJFINANCE (split June 2025), 22% for
TRENT, 8% for HDFCBANK — and every one showed up on the ten-year chart as a fake
crash followed by ~200 days of falsely bearish breadth. The EMA is the worst
affected because it never fully forgets an old price; it only fades it ~1% a day.

## Options

| Option | Good | Bad |
|---|---|---|
| **Detect jumps ourselves** and round to a typical ratio (2, 5, 10…) | No new source | Guesses. Cannot tell a real 50% crash from a 1:2 split, and misses small bonuses (1:10) entirely |
| **Hand-maintained table** of splits, checked against TradingView | Exact | Someone has to add every new split by hand; does not scale beyond 50 stocks |
| **Broker API** (Zerodha Kite, Groww) for adjusted prices | Adjustment done for us | Paid; Kite needs a manual login every day (kills automation); one request per stock per range; abandons the "store the whole market from one free file" design |
| **TradingView** | Already adjusted | Only reachable inside a Claude session, not from the app/server; no official data feed |
| **NSE's own corporate-actions feed** ✅ | Free, no login, same source as our prices, **whole market in one request per year**, exact ratios | NSE writes the events as free text that must be parsed |

## Decision

1. **New table `corporate_actions`** holds every NSE corporate action for the whole
   market (≈22,000 since 2016: splits, bonuses, dividends, meetings…), with NSE's
   original wording kept verbatim in `subject`. This is also where per-stock split
   information lives for display later.
2. **A parser** (`classifyAction`, `src/ingest/corporate-actions.ts`) turns NSE's text
   into a `factor` — what closes before the ex-date must be divided by:
   - split "From Rs 5 To Re 1" → 5 ÷ 1 = **5**
   - bonus "1:2" (1 new share per 2 held) → (1+2) ÷ 2 = **1.5**
   - split and bonus on the same day → factors multiply (BAJFINANCE 2025: 5 × 2 = **10**)
   - consolidation "From Re 1 To Rs 10" → **0.1** (a reverse split)
   - dividends, meetings, rights issues → **1** (share count unchanged)
3. **The averages are computed on adjusted prices** (`computeIndicators`, using
   `src/indicators/adjust.ts`), then converted back into the rupees that day traded
   at. So each stored average is in the same units as its `close`, and the breadth
   and crossings pages did not need any change.
4. **Raw prices are never modified.** `daily_prices` still holds exactly what NSE
   published.
5. **Nightly**, the job fetches corporate actions from a month back to a month ahead,
   then recomputes.
6. **Two safety nets**, both printed as `WARNING` in the nightly log:
   - an action that mentions a split/bonus but cannot be read is stored as
     `kind = 'unparsed'` and reported — **never** silently treated as factor 1;
   - any member moving more than 30% overnight with no matching action is reported.

## Why

- **Same source as the prices**, so the dates and symbols line up exactly, and the
  fix works on any machine that can already download bhavcopy.
- **Fully automatic**: new splits arrive with the nightly run. A hand-kept table
  would fail the first time nobody noticed a split.
- **Scales to the whole market**, which keeps TODO item 7 (NIFTY 500 / whole-market
  breadth) a query change.
- **Exact factors from the exchange**, instead of guessing from price jumps.
- **Adjusting at compute time, not in storage**, follows the project's rule "store
  everything, filter at query time": if a factor is ever wrong, fixing the row and
  re-running `bun run indicators` (~5 s) repairs all ten years. Nothing to re-download.
- **Rights issues and demergers are not adjusted**, matching TradingView, which
  adjusts for splits only. That keeps our numbers comparable with the chart you
  check against.

## What we found while doing it

- NSE used **~30 different wordings** across ten years ("From Rs 10/- To Rs 2/-",
  "RsN/-", "Bonus- 1:1", "Bonus 1: 1", events joined with "/" or "+"…). The parser was
  built from all of them.
- **The safety net caught a real bug on day one.** For JSWSTEEL (2017-01-04) NSE wrote
  the abbreviation **"Fv Splt Frm Rs 10 To Re 1"**. The parser did not recognise
  "Splt" and filed it as an ordinary event; the 30%-jump check flagged the 10× drop.
  Fixed, with a test. After that: **0 unexplained jumps** across all members and ten
  years.
- Bonuses of **preference shares or debentures** ("Bonus NCRPS 1:1") look like
  bonuses but do not change the equity count — deliberately ignored.
- **Capital reductions** (5 since 2016, none in NIFTY 50) cannot be read reliably from
  the text and are left `unparsed` on purpose.
- NSE's bhavcopy `prev_close` is **not** adjusted on the ex-date either, so it cannot
  be used to detect splits.

## Known gaps (checked 2026-10-02)

All **50 NIFTY 50 members: 0 unexplained jumps** over ten years, so every split and
bonus that affects the dashboard is handled.

Across the **whole market**, 487 of 729 big overnight jumps are explained. The other
242 are outside NIFTY 50 and don't affect the dashboard today, since averages are only
computed for members. They fall into three groups:
- **Genuine moves:** real crashes and rallies, and demergers (e.g. ABFRL 2025), which
  we deliberately don't adjust.
- **ETF unit splits** (GOLDADD, HDFC/ICICI/UTI index ETFs…): NSE's *equities*
  corporate-actions feed doesn't list ETFs.
- **Renamed companies:** the feed files the event under the new symbol, while the old
  prices use the old one. See [0003](0003-renamed-symbols-lose-history.md).

Both of the last two need fixing before whole-market breadth (TODO item 7).

## Revisit when

- **The nightly log shows a `WARNING`.** Look up the event, add its wording to
  `tests/corporate-actions.test.ts`, fix the parser, run `bun run indicators`.
- **NSE starts blocking the feed** (it blocks its main website from scripts already,
  and some cloud server IPs). The run reports an error instead of failing silently;
  the 30% check still catches new splits. Fallback: a broker API (the user has
  offered a paid Groww/broker API) — check first whether its history is split-adjusted.
- **We need total-return accuracy** (dividend adjustment). Not needed for "above or
  below the average"; TradingView does not do it on its default chart either.
