# Money flow (sector money flow) — design

**Date:** 2026-10-05 · **Status:** design agreed in conversation (owner: "yes"); written spec for owner review · **Path:** architectural (new page, new nightly table)

## Intent (agreed)

- **Question the page answers:** which parts of the market is money rushing into, or leaving,
  right now? Tracking, not prediction (owner's goal: "track where money moves").
- **Who:** the owner, not a finance expert: plain words, every term explained once.
- **Success:** a new sidebar page "Money flow" under Stocks showing, for each NSE sector, its
  trading in ₹ against its own normal for 1 day / 1 week / 1 month, the direction its stocks
  moved, its share of all trading against usual, and the stocks driving it. Rebuilt nightly.
- **Out of scope:** a history chart per sector (later); any buy/sell wording; sectors for stocks
  outside the Nifty Total Market (NSE publishes sectors only for index members).

## Universe and data

- The ~750 **Nifty Total Market** stocks (`index_constituents`, `index_key = 'total-market'`),
  with NSE's sector (`industry`), the same universe and sector names as Top volume.
- ₹ traded per day from `daily_prices.turnover`, read through `loadAdjustedHistory(symbol,
  renames, { series: ["EQ", "BE"] })` so renames are followed and a stock moved to BE isn't
  cut short (decision 0025). Rupees need no split adjustment.
- Market sessions from `ingest_log` (bhavcopy `ok`), as `computeVolumeLeaders` does.

## The numbers (fixed here)

For each period P in **1, 5, 21** market sessions ending on the latest session D:

- **Window:** the last P sessions. **Normal window:** the **63 sessions before** the window
  (about 3 months), so "normal" never includes the days being judged.
- Per stock: `turnover` = ₹ traded in the window; `normalDaily` = mean ₹ traded per session over
  the normal window, counting only sessions it traded; a stock needs **≥ 40 of the 63** to have
  a normal (new listings, long suspensions excluded from the ratio); `changePct` = price move over
  the window on adjusted closes, null across a gap over 5 calendar days (as Top volume,
  `MAX_MOVE_GAP_DAYS`), or if it didn't trade on D.
- Per sector (query time, from the per-stock rows):
  - **Trading vs normal** = Σ turnover ÷ Σ (normalDaily × P), over stocks that have a normal
    and traded in the window. Example: ₹3,000 cr this week against a normal ₹300 cr a day ×
    5 = ₹1,500 cr → **2.0×**.
  - **Direction** = the median `changePct` of its stocks, plus how many rose and fell.
    Green when the median is above 0, red below, grey at 0 (within `NOISE_PCT`).
  - **Share of trading** = sector turnover ÷ all sectors' turnover in the window, against the
    same share in the normal window ("24% this week; usually 19%").
- Sectors with **fewer than 5 stocks** (Forest Materials 1, Diversified 1, Utilities 4 today)
  are left out of the bars and named in the card footer: one stock is not a sector.
- **Drill-down:** a sector's stocks sorted by **extra ₹** (turnover − normalDaily × P), the
  money above normal, with their trading vs normal and price move.

## Storage and nightly job

- New table **`money_flow`**: one row per (symbol, period): `as_of`, `symbol`, `sector`,
  `period`, `turnover`, `normal_daily` (null without a normal), `sessions`, `change_pct`.
  Rebuilt in full in one transaction (like `volume_leaders`); ~2,250 rows.
- `computeMoneyFlow()` in `src/indicators/compute-money-flow.ts` (the database part) over a pure,
  tested `flowStats(h, windows)` in `src/indicators/money-flow.ts`; sector maths in a pure
  `sectorFlows(rows, period)` there too, so the page and tests share it.
- `bun run money-flow` rebuilds it (~5–10 s); `ingest:nightly` runs it after Top volume.
  `docs/pipelines.md` updated.

## The page (`/money-flow`)

- Sidebar entry **"Money flow"** under Stocks, hotkey **m**.
- Controls: period switch **1 day / 1 week / 1 month** (`period` = 1/5/21, strict check,
  default 5). No date navigation (like Top volume: the table holds the latest night only).
- **Main card:** one horizontal bar per sector, sorted by trading vs normal, a line at 1×
  ("normal"); bar coloured by direction; each row shows the ×, the share now vs usual and the
  median move. A row links to the drill-down (`?sector=…`, accepted only if it matches a
  sector in the table).
- **Drill-down card** (when a sector is picked): its stocks by extra ₹ (top 25), with trading
  vs normal and price move; links to a Report Card where one exists.
- Header line: "As of <date>. Each sector against its own last 3 months. Facts, not predictions."
- Design system tokens and density tokens only; the bars grow in through a `grow-*` class
  (decision 0015); a "Nothing loaded" card when the table is empty.

## Glossary (before it ships)

New entries with `<Term>` on screen: **money-flow** (the page's idea), **trading-vs-normal**,
**share-of-trading**. The page reuses **nse-sector** and **value-traded**.

## Checks

- Unit tests (written first): window and normal-window boundaries (normal never overlaps the
  window); the 40-of-63 rule; a stock missing D gets no move; sector ratio, share and median on
  hand-worked rows; sectors under 5 stocks dropped; drill-down order by extra ₹; `period` and
  `sector` parameter checks fall back safely.
- Rename lineage: a renamed stock's normal includes its old symbol's days.
- Live spot check after the first build: one sector's ratio recomputed by hand from SQL.
- Headless screenshots, wide and phone, dark and light.

## Documentation

Decision 0028 (what, options, why) with a README row; `docs/pipelines.md`; README function
reference and command; CLAUDE.md commands and page list; folder guides via the existing pattern.
