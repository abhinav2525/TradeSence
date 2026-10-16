# Research roadmap: what to measure, study and show (the quant advisor's list)

Kept by the `quant-advisor` agent. Ideas live here until the owner picks one; a picked item
moves to `TODO.md` (the main list) and this file keeps a one-line "→ picked, <date>" note.
Every idea says whether it is **tracking** (ships as facts) or **predictive** (needs a study
with pass/fail rules fixed before results), the data it uses (we hold it; no new sources,
owner's rule of 5 Oct 2026), the advisor's honest chance of passing our bar, and the main trap.
Full reasoning and the queries behind the numbers: `docs/proposals/`.

## Proposed (ranked by value ÷ effort; from `docs/proposals/2026-10-05-what-next.md`)

- [ ] **1. Big stocks vs the long tail of trading** — tracking, ~1 day. Each day, split all ₹
  traded into the 100 most-traded stocks, the next 400, and everything beyond the top 500.
  Found already: under 2% of trading was outside the top 500 in 2019; almost 15% in 2026.
  Data: `daily_prices`, `fund_symbols`. Trap: groups must be decided each day from the prior
  ~3 months, never from today's lists; say "most traded", not "large cap". *Advisor's first pick.*
- [ ] **2. New 52-week highs vs new lows, whole market** — tracking, ~1 day. E.g. 3 Mar 2025:
  6 highs, 513 lows; 1 Oct 2026: 33 highs, 187 lows. Data: adjusted histories, ₹1 crore rule,
  ETFs out. Trap: never NSE's 52-week file (off by one day); chart starts ~Sep 2017.
- [ ] **3. Momentum study, whole liquid market** — predictive, 2–3 days. Rank by 12-month
  return (skip the latest month) each month-end; does the top tenth beat the bottom tenth?
  NSE's momentum indices beat the Nifty 500 since 2016 (18.6% vs 11.3% a year, one index,
  before costs). Chance of clearing our bar: ~1 in 3 (10 years is short for t ≥ 3). Either way
  the planned Strength Leaderboard ships; the study decides its wording. Traps: delisted
  stocks in; eligibility from data up to each ranking date; non-overlapping months; keep the
  2020 crash; costs; at most two pre-declared factors.
- [ ] **4. Breadth thrust and divergence, re-scoped** — tracking, ½–1 day. Only ~7 thrust
  episodes since 2016 on the whole market: show them like the washout alarm ("7 occasions,
  not a test"). Chart NIFTY 50 vs whole-market breadth together and show the gap as a fact.
  Prerequisite: day moves for every symbol on adjusted history.
- [ ] **5. Sector strength from NSE's sector indices, beside Money flow** — tracking, ~1 day.
  1/3/6-month returns vs the Nifty 500 (3 months to 1 Oct 2026: IT +9.8%, Pharma +4.5%,
  Nifty 500 −5.4%, Banks −6.2%, FMCG −12.1%). Uses `index_prices`, built on each day's real
  members (no survivorship). Caveats: price indices (no dividends); sectors overlap.

## Money flow and Top volume additions (from `docs/proposals/2026-10-07-money-flow-and-top-volume-next.md`)

- [x] → picked and built (decision 0040, 7 Oct). **MF-1. "One stock or the whole sector?"** (tracking, ~½ day). This is the advisor's
  pick for these pages. Next to each sector's × normal: "busier than usual: x of y stocks" and
  "without its biggest mover: z×". Week to 6 Oct 2026: Media 1.78×, but 2 of 8 stocks were
  busier, and it is 0.74× without SUNTV. Data: `money_flow`. Trap: same exclusions as the ratio.
- [x] → picked and built (decision 0040, 7 Oct). **MF-2. "× its own normal" column + "Unusually busy" sort on Top volume** (tracking,
  ~1 day). SUNTV is 22.9× its normal but #24 by ₹; HDFCBANK is #2 by ₹ at 1.36×. Data:
  `money_flow`, plus a stored normal in `volume_leaders` for 3/6 months. Trap: illiquid tail
  (₹5 crore/day floor), new listings, short sessions.
- [ ] **MF-3. Delivery share by sector vs the market's change** (tracking, 1–1½ days; already
  on TODO.md "Later"). IT 61.2% vs 39.1% normal while all ~750 went 36.4% to 43.7%. Weight by ₹,
  not shares. Skip `EXCLUDED_DAYS`. Not a buying signal (research 0003).
- [x] **MF-4. Sector share of trading over 52 weeks** (tracking, ~1 day). → picked and built 7 Oct
  (decision 0041, branch `feat/sector-share-year`; shipped as 3-month blocks on the same calendar dates). Same 4 weeks:
  Financial Services 23.4% to 26.1%, IT 8.1% to 6.3% (2025 to 2026). Trap: today's members
  (new listings inflate 2026), so state it under the chart.
- [ ] **MF-5. Optional study: do busy weeks stay jumpy?** (predictive, ~2 days, prior high
  ~3 in 4). It would only allow one caution line. Rules are in the proposal.
- Fix (→ built with MF-2, decision 0040): one line under Top volume's Shares switch. Over the last month YESBANK is #5 by shares
  but #136 by ₹.

## Parked (needs data we don't hold)

- Company size by market value; valuation; sector tags for past dates; who bought (bulk/block
  deals and FII/DII flows are on the main list under "Who moved the money", owner's choice).

## Picked → moved to `TODO.md`

- (none yet)
