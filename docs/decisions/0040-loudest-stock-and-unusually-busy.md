# 0040 — One loud stock on Money flow, and "Unusually busy" on Top volume

**Date:** 2026-10-07 · **Status:** done (branch `feat/loudest-stock-busy-sort`) ·
**Spec:** `docs/superpowers/specs/2026-10-07-loudest-stock-and-busy-sort-design.md`

## Problem

1. **Money flow told a one-company story as a sector story.** In the week to 6 Oct 2026 Media
   (NSE's "Media Entertainment & Publication") was the busiest sector at 1.78× its normal. But
   SUNTV alone traded more extra rupees than the whole sector did; the other seven stocks were
   *quieter* than usual. The bar looked like money going into media.
2. **Top volume only ranked by size.** Giants such as HDFCBANK and BSE are always on top. A
   stock trading 23 times its own usual amount (SUNTV) sat at #24, where nobody looks.

## Options

- For (1): show only a count of busier stocks; show only a "without the biggest" figure; or
  both. A count alone hides how much one stock mattered; a figure alone hides how many stocks
  joined in.
- For (2): (a) join the Money flow table at page time for 1 day / 1 week / 1 month and show a
  dash for 3 and 6 months; or (b) store each window's normal in `volume_leaders`, computed by
  the same function as Money flow.

## Decision

**Money flow:** every sector shows "*b* of *n* busier" (stocks whose ₹ traded was above their
own normal; exactly at normal is not busier), and the whole market's count sits above the
bars ("269 of 747" that week). A switch, **Hide the loudest stock** (`loud=hide`, off by
default), re-measures each sector without the stock with the most rupees above its normal,
re-sorts the bars, names the stock ("without SUNTV") and keeps the full figure in small text
("1.78× with it"). If no stock is above its normal, nothing is hidden and the row says so. A
sector whose figure rests on 5 or fewer stocks is marked "few stocks".

**Top volume:** option (b). `volume_leaders` gains `normal_daily`, written by
`computeVolumeLeaders` through Money flow's own `normalDaily` function over the 63 market
sessions before each window. A **× normal** column shows on every ranking; a third ranking,
**Unusually busy**, sorts by it on 1 day / 1 week / 1 month only. That ranking leaves out
stocks that usually trade under **₹5 crore a day** (and stocks too new for a normal) and says
how many it left out. A line under the switch says "Shares favour low-priced stocks; ₹ compares
companies on the same footing."

## Why

- **One normal, one function.** A stock's 1-week × normal must read the same on both pages.
  `normalDaily` lives in `money-flow.ts`; Money flow's window maths and Top volume's nightly
  step both call it, and the windows are built the same way (the 63 sessions just before).
- **A stored column beats a page-time join:** one nullable number on a table rebuilt nightly
  (about 3,700 values), one source per page, and it also fills the 3- and 6-month tabs.
- **× normal divides by the period's market sessions**, not the sessions the stock traded,
  so a stock suspended for part of a week reads lower, not higher.
- **The floor** stops a stock that trades ₹10 lakh a day from topping the list at 40×.
- **Busy, not buy.** Research 0004 and 0005 found heavy volume doesn't predict the next move;
  the page says so under the Unusually busy ranking.

## Checks

- Tests written first for every rule: busier count at exactly normal, loudest tie by symbol,
  no stock above normal, a 5-stock sector, the Media-like case, the toggle's sort, the floor at
  exactly ₹5 crore and one rupee under, filters applied before the floor, 39 vs 40 traded
  sessions, a renamed stock's normal reaching back into its old ticker, the 6-month normal
  needing 189 sessions, and Top volume's normal equal to Money flow's on one fixture.
- **Real data (6 Oct 2026):** for 1 day / 1 week / 1 month, all 747 stocks' Top volume normals
  equal Money flow's (largest difference 0). An independent SQL sum from `daily_prices` gave
  SUNTV's normal as ₹27.0 crore a day over 63 traded sessions, the stored value exactly; its
  week of ₹3,085 crore is 22.85×. IRCON 13.7×, ABLBL 9.2×, KSB 9.2×; BSE (#1 by ₹) 2.74×,
  HDFCBANK 1.36×. Media 1.78× → 0.74× without SUNTV, 2 of 8 busier; Construction 1.38× →
  1.24× without IRCON, 8 of 23; Construction Materials 1.23× → 1.01× without SHREECEM.
- 3- and 6-month normals are filled for 742 and 733 of 747 stocks.

## Limits

- **Taking out the biggest mover usually, not always, lowers a sector's figure.** The biggest
  stock *in rupees* can be less busy, relative to its normal, than the rest of its sector
  (a small stock at 10× beside a giant at 2×). The page therefore says "usually". On 6 Oct no
  sector rose.
- **The ₹5 crore floor rarely bites on this list:** only 2–4 of the ~750 Nifty Total Market
  stocks usually trade less than that. It matters if the page ever covers the whole market.
- **The 3- and 6-month normals are old** (the 3 months before a 6-month window are 6–9 months
  ago), which is why Unusually busy isn't offered there and the column header says "3 months
  before".
- One-day lists are topped by index rebalance days and ex-dates; the page says so.
- A Muhurat or special session inside the window makes everything look quiet; the existing
  short-session note now shows on Top volume too.

## Revisit when

- The page covers stocks outside Nifty Total Market (the floor starts to matter).
- The owner wants the toggle on the 52-week history chart (out of scope here).
